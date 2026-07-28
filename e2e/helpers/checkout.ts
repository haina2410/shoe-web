import { expect, type Page } from "@playwright/test";

/**
 * Tạo một đơn guest qua đúng luồng người dùng:
 * storefront → sản phẩm → giỏ hàng → checkout → trang VietQR.
 *
 * Sản phẩm/biến thể này thuộc dữ liệu seed và được dùng chung với storefront
 * E2E để mọi test dựa trên cùng một tổ hợp còn hàng đã biết.
 */
export async function createPendingOrderViaCheckout(
  page: Page,
  customerSuffix: string,
): Promise<{ orderCode: string; total: number }> {
  await page.goto("/");
  await page.getByRole("link", { name: "Xem tất cả" }).click();
  await expect(page).toHaveURL(/\/products$/);

  await page.getByText("Giày Chạy Bộ Êm Nhẹ").first().click();
  await expect(page).toHaveURL(/\/products\/giay-chay-bo-em-nhe$/);

  const sizeGroup = page.getByRole("radiogroup", { name: "Kích cỡ" });
  const colorGroup = page.getByRole("radiogroup", { name: "Màu sắc" });
  await sizeGroup.getByRole("radio", { name: "40" }).click();
  await colorGroup.getByRole("radio", { name: "Đen" }).click();
  await expect(page.getByText(/Còn \d+ sản phẩm/)).toBeVisible();

  await page.getByRole("button", { name: "Thêm vào giỏ" }).click();

  await page.getByRole("link", { name: "Giỏ hàng", exact: true }).click();
  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.getByText("Giày Chạy Bộ Êm Nhẹ")).toBeVisible();
  await expect(page.getByText("40 / Đen")).toBeVisible();
  await expect(page.getByText(/Tổng cộng/)).toBeVisible();

  await page.getByRole("link", { name: "Thanh toán" }).click();
  await expect(page).toHaveURL(/\/checkout$/);

  await page.getByLabel("Họ tên").fill(`Khách E2E ${customerSuffix}`);
  await page
    .getByLabel("Email")
    .fill(`khach-e2e+${customerSuffix}@example.com`);
  await page.getByLabel("Số điện thoại").fill("0900000000");
  await page.getByLabel("Tỉnh/Thành phố").selectOption("Hà Nội");
  await page.getByLabel("Phường/Xã").fill("Phường Ba Đình");
  await page.getByLabel("Địa chỉ cụ thể").fill("123 Đường Kiểm Thử");

  await page.getByRole("button", { name: "Đặt hàng" }).click();

  await page.waitForURL(/\/orders\/.+/);
  await expect(
    page.getByRole("heading", { name: "Đặt hàng thành công" }),
  ).toBeVisible();

  const orderCode = new URL(page.url()).pathname.split("/orders/")[1];
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

  return { orderCode, total };
}

export async function loginAsStaff(page: Page): Promise<void> {
  const email = process.env.SEED_STAFF_EMAIL;
  const password = process.env.SEED_STAFF_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "E2E cần SEED_STAFF_EMAIL và SEED_STAFF_PASSWORD trong môi trường test.",
    );
  }

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu").fill(password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}
