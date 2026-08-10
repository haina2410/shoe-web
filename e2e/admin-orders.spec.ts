import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  createPendingOrderViaCheckout,
  loginAsStaff,
} from "./helpers/checkout";

function uniqueNumericProviderId(): number {
  return Date.now() * 1_000 + (process.pid % 1_000);
}

async function expectToast(page: import("@playwright/test").Page, title: string) {
  const liveRegion = page.getByRole("region", { name: "Notifications" });
  await expect(liveRegion).toBeVisible();
  await expect(liveRegion.getByText(title, { exact: true })).toBeVisible();
}

async function loginAsStaffForE2E(page: import("@playwright/test").Page) {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": "198.51.100.10" });
  await loginAsStaff(page);
}

async function openOrder(page: import("@playwright/test").Page, orderCode: string) {
  await page.goto("/admin/orders");
  await page.getByLabel("Mã đơn").fill(orderCode);
  await page.getByRole("button", { name: "Lọc đơn hàng" }).click();
  await page.getByRole("link", { name: orderCode }).click();
  await expect(
    page.getByRole("heading", { name: `Đơn hàng ${orderCode}` }),
  ).toBeVisible();
}

test("staff confirms payment, applies safe transitions, and records a refund", async ({
  page,
}) => {
  const runId = `${Date.now()}-${process.pid}`;
  const { orderCode } = await createPendingOrderViaCheckout(
    page,
    `fulfillment-${runId}`,
  );

  await loginAsStaffForE2E(page);
  await openOrder(page, orderCode);

  await page.getByRole("button", { name: "Xác nhận thanh toán" }).click();
  const paymentDialog = page.getByRole("alertdialog", {
    name: "Xác nhận thanh toán",
  });
  await expect(paymentDialog).toContainText(orderCode);
  await expect(page.getByText("Chờ thanh toán", { exact: true })).toBeVisible();
  await paymentDialog.getByRole("button", { name: "Xác nhận" }).click();
  await expectToast(page, "Đã xác nhận thanh toán");
  await expect(page.getByText("Đã thanh toán", { exact: true })).toBeVisible();

  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Chuyển sang đang giao" }).click();
  await expectToast(page, "Đã cập nhật trạng thái đơn hàng");
  await expect(page.getByText("Đang giao", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Đánh dấu hoàn tất" }).click();
  await expect(page.getByText("Hoàn tất", { exact: true })).toBeVisible();

  const refundReference = `E2E-REFUND-${runId}`;
  const refundForm = page.getByRole("form", { name: "Hoàn tiền" });
  await refundForm.getByLabel("Số tiền hoàn").fill("10000");
  await refundForm
    .getByLabel("Mã giao dịch ngân hàng")
    .fill(refundReference);
  await refundForm.getByLabel("Ghi chú").fill("Hoàn tiền E2E một phần");
  await refundForm
    .getByRole("button", { name: "Ghi nhận hoàn tiền" })
    .click();
  const refundDialog = page.getByRole("alertdialog", { name: "Xác nhận hoàn tiền" });
  await expect(refundDialog).toContainText(orderCode);
  await refundDialog.getByRole("button", { name: "Xác nhận hoàn tiền" }).click();

  await expectToast(page, "Đã ghi nhận hoàn tiền");
  await expect(page.getByText("Hoàn tiền một phần", { exact: true })).toBeVisible();
  const paymentHistory = page.getByRole("region", { name: "Lịch sử thanh toán" });
  await expect(paymentHistory).toContainText("Hoàn tiền");
  await expect(paymentHistory).toContainText("10.000 ₫");
  await expect(paymentHistory).toContainText(refundReference);
  await expect(page.getByText("Hoàn tất", { exact: true })).toBeVisible();
});

test("staff leaves a pending order unchanged until cancellation is confirmed", async ({
  page,
}) => {
  const { orderCode } = await createPendingOrderViaCheckout(
    page,
    `cancellation-${Date.now()}-${process.pid}`,
  );

  await loginAsStaffForE2E(page);
  await openOrder(page, orderCode);

  await page.getByRole("button", { name: "Huỷ đơn" }).click();
  const cancellationDialog = page.getByRole("alertdialog", { name: "Huỷ đơn hàng" });
  await expect(cancellationDialog).toBeVisible();
  await cancellationDialog.getByRole("button", { name: "Hủy" }).click();
  await expect(page.getByText("Chờ thanh toán", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Xác nhận thanh toán" })).toBeVisible();

  await page.getByRole("button", { name: "Huỷ đơn" }).click();
  await cancellationDialog.getByRole("button", { name: "Huỷ đơn hàng" }).click();
  await expectToast(page, "Đã cập nhật trạng thái đơn hàng");
  await expect(page.getByText("Đã huỷ", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Huỷ đơn" })).toHaveCount(0);
});

test("staff validates then confirms reconciliation and sees refreshed records", async ({
  page,
}) => {
  const providerId = uniqueNumericProviderId();
  const { orderCode, total } = await createPendingOrderViaCheckout(
    page,
    `review-${providerId}`,
  );
  const webhookSecret = process.env.SEPAY_WEBHOOK_SECRET;
  const accountNumber = process.env.VIETQR_ACCOUNT_NO;
  if (!webhookSecret || !accountNumber) {
    throw new Error(
      "E2E cần SEPAY_WEBHOOK_SECRET và VIETQR_ACCOUNT_NO trong môi trường test.",
    );
  }

  const uniqueContent = `E2E review ${providerId}`;
  const rawBody = JSON.stringify({
    id: providerId,
    gateway: "MBBank",
    transactionDate: "2026-07-28 14:30:45",
    accountNumber,
    subAccount: null,
    code: "LEAFFFFFF",
    content: uniqueContent,
    transferType: "in",
    description: `E2E reviewed payment ${providerId}`,
    transferAmount: total,
    accumulated: total,
    referenceCode: `E2E-REVIEW-${providerId}`,
  });
  const timestamp = String(Math.floor(Date.now() / 1_000));
  const signature = createHmac("sha256", webhookSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const webhookResponse = await page.request.post("/api/webhooks/sepay", {
    headers: {
      "content-type": "application/json",
      "x-sepay-signature": `sha256=${signature}`,
      "x-sepay-timestamp": timestamp,
    },
    data: rawBody,
  });
  expect(webhookResponse.status()).toBe(200);
  expect(await webhookResponse.json()).toEqual({ success: true });

  await loginAsStaffForE2E(page);
  await page.goto("/admin/bank-transactions/review");
  const reviewRow = page.getByRole("row").filter({ hasText: uniqueContent });
  await expect(reviewRow).toBeVisible();
  const matchForm = reviewRow.getByRole("form", { name: "Ghép giao dịch" });
  await matchForm.getByLabel("Mã đơn").fill("invalid");
  await matchForm.getByRole("button", { name: "Ghép giao dịch" }).click();
  await page
    .getByRole("alertdialog", { name: "Xác nhận ghép giao dịch" })
    .getByRole("button", { name: "Xác nhận ghép" })
    .click();
  await expect(matchForm.getByRole("alert")).toHaveText("Mã đơn hàng không hợp lệ.");
  await expect(reviewRow).toBeVisible();

  await matchForm.getByLabel("Mã đơn").fill(orderCode);
  await matchForm.getByRole("button", { name: "Ghép giao dịch" }).click();
  const matchDialog = page.getByRole("alertdialog", {
    name: "Xác nhận ghép giao dịch",
  });
  await expect(matchDialog).toContainText(orderCode);
  await matchDialog.getByRole("button", { name: "Xác nhận ghép" }).click();
  await expectToast(page, "Đã ghép giao dịch");
  await expect(reviewRow).toHaveCount(0);

  await openOrder(page, orderCode);
  await expect(page.getByText("Đã thanh toán", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Lịch sử thanh toán" })).toContainText(
    "Tiền vào",
  );
});
