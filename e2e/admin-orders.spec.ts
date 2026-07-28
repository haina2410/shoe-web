import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  createPendingOrderViaCheckout,
  loginAsStaff,
} from "./helpers/checkout";

function uniqueNumericProviderId(): number {
  return Date.now() * 1_000 + (process.pid % 1_000);
}

test("staff: xác nhận thanh toán → giao hàng → hoàn tất → hoàn tiền một phần", async ({
  page,
}) => {
  const runId = `${Date.now()}-${process.pid}`;
  const { orderCode } = await createPendingOrderViaCheckout(
    page,
    `fulfillment-${runId}`,
  );

  await loginAsStaff(page);
  await page.goto("/admin/orders");
  await page.getByLabel("Mã đơn").fill(orderCode);
  await page.getByRole("button", { name: "Lọc đơn hàng" }).click();

  const orderLink = page.getByRole("link", { name: orderCode });
  await expect(orderLink).toBeVisible();
  await orderLink.click();
  await expect(
    page.getByRole("heading", { name: `Đơn hàng ${orderCode}` }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Xác nhận thanh toán" }).click();
  await expect(page.getByText(/^Đã thanh toán · Tạo lúc/)).toBeVisible();

  await page.getByRole("button", { name: "Chuyển sang đang giao" }).click();
  await expect(page.getByText(/^Đang giao · Tạo lúc/)).toBeVisible();

  await page.getByRole("button", { name: "Đánh dấu hoàn tất" }).click();
  await expect(page.getByText(/^Hoàn tất · Tạo lúc/)).toBeVisible();

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

  const paymentSection = page
    .getByRole("heading", { name: "Thanh toán và hoàn tiền" })
    .locator("..");
  await expect(paymentSection).toContainText("Hoàn tiền một phần");
  await expect(
    paymentSection.getByText("Tiền hoàn", { exact: true }).locator(".."),
  ).toContainText("10.000 ₫");
  await expect(paymentSection).toContainText(refundReference);
  await expect(page.getByText(/^Hoàn tất · Tạo lúc/)).toBeVisible();
});

test("staff: ghép giao dịch cần đối soát vào đúng đơn pending", async ({
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
  const payload = {
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
  };
  const rawBody = JSON.stringify(payload);
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

  await loginAsStaff(page);
  await page.goto("/admin/bank-transactions/review");

  const reviewRow = page.getByRole("row").filter({ hasText: uniqueContent });
  await expect(reviewRow).toBeVisible();
  await reviewRow.getByLabel("Mã đơn").fill(orderCode);
  await reviewRow.getByRole("button", { name: "Ghép giao dịch" }).click();
  await expect(reviewRow).toHaveCount(0);

  await page.goto("/admin/orders");
  await page.getByLabel("Mã đơn").fill(orderCode);
  await page.getByRole("button", { name: "Lọc đơn hàng" }).click();
  await page.getByRole("link", { name: orderCode }).click();
  await expect(page.getByText(/^Đã thanh toán · Tạo lúc/)).toBeVisible();
});
