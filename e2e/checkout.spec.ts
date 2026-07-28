import { createHmac } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createPendingOrderViaCheckout } from "./helpers/checkout";

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
  const { orderCode, total } = await createPendingOrderViaCheckout(
    page,
    `webhook-${Date.now()}`,
  );

  // Mô phỏng đúng payload SePay + chữ ký trên CHÍNH chuỗi raw gửi đi.
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

  // Trang force-dynamic đọc lại trạng thái DB sau webhook.
  await page.reload();
  await expect(page.getByTestId("order-status")).toHaveText("Đã thanh toán");
  await expect(page.locator('img[src*="img.vietqr.io"]')).toHaveCount(0);
  await expect(page.getByTestId("order-transfer-content")).toHaveCount(0);
});
