import { createHmac } from "node:crypto";
import { test, expect } from "@playwright/test";

/**
 * Headline E2E Ngày 5: toàn bộ luồng đặt hàng GUEST (không đăng nhập) —
 * home → `/products` → mở sản phẩm → chọn size+màu còn hàng → **Thêm vào
 * giỏ** → `/cart` (thấy item + tạm tính) → **Thanh toán** → `/checkout`
 * (điền địa chỉ) → **Đặt hàng** → `/orders/<orderCode>` (thấy QR VietQR, mã
 * đơn hàng, tổng tiền) → gửi webhook SePay có chữ ký → refresh và thấy đơn
 * đã thanh toán, không còn QR.
 *
 * Dùng lại đúng sản phẩm/tổ hợp size+màu đã xác nhận CÒN HÀNG ở
 * `e2e/storefront.spec.ts` ("Giày Chạy Bộ Êm Nhẹ", size "40", màu "Đen") để
 * không phụ thuộc thêm giả định mới về dữ liệu seed.
 *
 * Cần env có đủ `VIETQR_BANK_CODE`/`VIETQR_ACCOUNT_NO`/
 * `VIETQR_ACCOUNT_NAME` và `SEPAY_WEBHOOK_SECRET`. `playwright.config.ts`
 * nạp `.env`; CI/local Task 8 truyền secret webhook tạm qua assignment của
 * chính lệnh test để cả Playwright lẫn webServer kế thừa cùng một giá trị.
 * Không chạy email worker: route chỉ cần pg-boss để enqueue nguyên tử.
 */

test("guest: checkout → webhook SePay có chữ ký → đơn đã thanh toán", async ({
  page,
}) => {
  // 1) Home → /products → mở sản phẩm.
  await page.goto("/");
  await page.getByRole("link", { name: "Xem tất cả" }).click();
  await expect(page).toHaveURL(/\/products$/);

  await page.getByText("Giày Chạy Bộ Êm Nhẹ").first().click();
  await expect(page).toHaveURL(/\/products\/giay-chay-bo-em-nhe$/);

  // 2) Chọn size + màu còn hàng → Thêm vào giỏ.
  const sizeGroup = page.getByRole("radiogroup", { name: "Kích cỡ" });
  const colorGroup = page.getByRole("radiogroup", { name: "Màu sắc" });
  await sizeGroup.getByRole("radio", { name: "40" }).click();
  await colorGroup.getByRole("radio", { name: "Đen" }).click();
  await expect(page.getByText(/Còn \d+ sản phẩm/)).toBeVisible();

  await page.getByRole("button", { name: "Thêm vào giỏ" }).click();

  // 3) /cart — thấy item vừa thêm + tạm tính.
  await page.getByRole("link", { name: "Giỏ hàng", exact: true }).click();
  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.getByText("Giày Chạy Bộ Êm Nhẹ")).toBeVisible();
  await expect(page.getByText("40 / Đen")).toBeVisible();
  await expect(page.getByText(/Tổng cộng/)).toBeVisible();

  // 4) Thanh toán → /checkout → điền form.
  await page.getByRole("link", { name: "Thanh toán" }).click();
  await expect(page).toHaveURL(/\/checkout$/);

  await page.getByLabel("Họ tên").fill("Nguyễn Văn A");
  await page.getByLabel("Email").fill("khach-e2e@example.com");
  await page.getByLabel("Số điện thoại").fill("0901234567");
  await page.getByLabel("Tỉnh/Thành phố").selectOption("Hà Nội");
  await page.getByLabel("Phường/Xã").fill("Phường Ba Đình");
  await page.getByLabel("Địa chỉ cụ thể").fill("123 Đường Láng");

  await page.getByRole("button", { name: "Đặt hàng" }).click();

  // 5) /orders/<orderCode> — QR VietQR + mã đơn hàng + tổng tiền raw.
  await page.waitForURL(/\/orders\/.+/);
  await expect(
    page.getByRole("heading", { name: "Đặt hàng thành công" }),
  ).toBeVisible();

  const orderCode = page.url().split("/orders/")[1];
  expect(orderCode).toBeTruthy();

  await expect(page.locator('img[src*="img.vietqr.io"]')).toBeVisible();
  await expect(page.getByTestId("order-code")).toHaveText(orderCode);
  await expect(page.getByTestId("order-status")).toHaveText("Chờ thanh toán");

  const orderTotal = page.getByTestId("order-total");
  await expect(orderTotal).toBeVisible();
  await expect(orderTotal).toContainText("₫");
  const rawTotal = await orderTotal.getAttribute("data-total");
  expect(rawTotal).toMatch(/^[1-9]\d*$/);
  const total = Number(rawTotal);
  expect(Number.isSafeInteger(total)).toBe(true);

  // 6) Mô phỏng đúng payload SePay + chữ ký trên CHÍNH chuỗi raw gửi đi.
  const webhookSecret = process.env.SEPAY_WEBHOOK_SECRET;
  const accountNumber = process.env.VIETQR_ACCOUNT_NO;
  if (!webhookSecret || !accountNumber) {
    throw new Error(
      "E2E cần SEPAY_WEBHOOK_SECRET và VIETQR_ACCOUNT_NO trong môi trường test.",
    );
  }

  const transactionId = Date.now();
  const payload = {
    id: transactionId,
    gateway: "MBBank",
    transactionDate: "2026-07-25 14:30:45",
    accountNumber,
    subAccount: null,
    code: orderCode,
    content: `Thanh toan don ${orderCode}`,
    transferType: "in",
    description: `E2E payment ${orderCode}`,
    transferAmount: total,
    accumulated: total,
    referenceCode: `E2E-${transactionId}`,
  };
  const rawBody = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
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

  // 7) Trang force-dynamic đọc lại trạng thái DB sau webhook.
  await page.reload();
  await expect(page.getByTestId("order-status")).toHaveText("Đã thanh toán");
  await expect(page.locator('img[src*="img.vietqr.io"]')).toHaveCount(0);
  await expect(page.getByTestId("order-transfer-content")).toHaveCount(0);
});
