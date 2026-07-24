import { test, expect } from "@playwright/test";

/**
 * Headline E2E Ngày 5: toàn bộ luồng đặt hàng GUEST (không đăng nhập) —
 * home → `/products` → mở sản phẩm → chọn size+màu còn hàng → **Thêm vào
 * giỏ** → `/cart` (thấy item + tạm tính) → **Thanh toán** → `/checkout`
 * (điền địa chỉ) → **Đặt hàng** → `/orders/<orderCode>` (thấy QR VietQR, mã
 * đơn hàng, tổng tiền).
 *
 * Dùng lại đúng sản phẩm/tổ hợp size+màu đã xác nhận CÒN HÀNG ở
 * `e2e/storefront.spec.ts` ("Giày Chạy Bộ Êm Nhẹ", size "40", màu "Đen") để
 * không phụ thuộc thêm giả định mới về dữ liệu seed.
 *
 * Cần `.env` có đủ `VIETQR_BANK_CODE`/`VIETQR_ACCOUNT_NO`/`VIETQR_ACCOUNT_NAME`
 * (dummy, xem `.env.example`) để trang `/orders/[orderCode]` render được —
 * `playwright.config.ts` đã `import "dotenv/config"` nên `.env` được nạp
 * trước khi `npm run build && npm run start`.
 */

test("guest: giỏ hàng → checkout → xác nhận đơn hàng + QR VietQR", async ({
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

  // 5) /orders/<orderCode> — QR VietQR + mã đơn hàng + tổng tiền.
  await page.waitForURL(/\/orders\/.+/);
  await expect(
    page.getByRole("heading", { name: "Đặt hàng thành công" }),
  ).toBeVisible();

  const orderCode = page.url().split("/orders/")[1];
  expect(orderCode).toBeTruthy();

  await expect(page.locator('img[src*="img.vietqr.io"]')).toBeVisible();
  await expect(page.getByTestId("order-code")).toHaveText(orderCode);
  await expect(page.getByTestId("order-total")).toBeVisible();
  await expect(page.getByTestId("order-total")).toContainText("₫");
});
