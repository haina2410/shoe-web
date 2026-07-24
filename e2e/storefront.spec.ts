import { test, expect } from "@playwright/test";

/**
 * Headline E2E Ngày 4: trang chủ hiện sản phẩm nổi bật → sang `/products` →
 * search KHÔNG DẤU ("chay bo") vẫn ra sản phẩm CÓ DẤU ("Giày Chạy Bộ …") →
 * mở 1 sản phẩm → trang chi tiết hiện đúng size/màu (variant selector).
 *
 * Chứng minh xuyên suốt: Task 2 (query + search chuẩn hoá dấu tiếng Việt,
 * `normalizeText`) + Task 3 (danh sách + lọc `/products`, `ProductCard`) +
 * Task 4 (trang chi tiết + `VariantSelector`) hoạt động end-to-end qua UI
 * thật, không phải unit/integration test riêng lẻ.
 *
 * Storefront là public — không cần đăng nhập. Cần chuẩn bị trước khi chạy:
 * `npx prisma db seed` (idempotent) trên DB dev mà `npm run build && npm run
 * start` (xem `playwright.config.ts`) sẽ dùng — test dựa vào các sản phẩm
 * seed sẵn ("Giày Chạy Bộ Êm Nhẹ", "Giày Chạy Bộ Địa Hình", size "40",
 * màu "Đen"/"Trắng").
 */

test("trang chủ → sản phẩm nổi bật → search không dấu → chi tiết sản phẩm", async ({
  page,
}) => {
  // 1) Trang chủ: thấy ít nhất 1 sản phẩm nổi bật.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sản phẩm nổi bật" })).toBeVisible();
  const featuredLinks = page.locator('a[href^="/products/"]');
  await expect(featuredLinks.first()).toBeVisible();

  // 2) Sang /products qua "Xem tất cả".
  await page.getByRole("link", { name: "Xem tất cả" }).click();
  await expect(page).toHaveURL(/\/products$/);

  // 3) Search KHÔNG DẤU "chay bo" → thấy sản phẩm CÓ DẤU trong tên thật.
  const searchInput = page.getByLabel("Tìm kiếm");
  await searchInput.fill("chay bo");
  await searchInput.press("Enter");

  await expect(page).toHaveURL(/[?&]q=chay(\+|%20)bo/);
  await expect(page.getByText("Giày Chạy Bộ Êm Nhẹ")).toBeVisible();
  await expect(page.getByText("Giày Chạy Bộ Địa Hình")).toBeVisible();

  // 4) Mở 1 sản phẩm → trang chi tiết hiện tên, size, màu (variant selector).
  await page.getByText("Giày Chạy Bộ Êm Nhẹ").first().click();
  await expect(page).toHaveURL(/\/products\/giay-chay-bo-em-nhe$/);
  await expect(
    page.getByRole("heading", { name: "Giày Chạy Bộ Êm Nhẹ" }),
  ).toBeVisible();

  const sizeGroup = page.getByRole("radiogroup", { name: "Kích cỡ" });
  await expect(sizeGroup.getByRole("radio", { name: "40" })).toBeVisible();

  const colorGroup = page.getByRole("radiogroup", { name: "Màu sắc" });
  await expect(colorGroup.getByRole("radio", { name: "Đen" })).toBeVisible();
  await expect(colorGroup.getByRole("radio", { name: "Trắng" })).toBeVisible();

  // Chọn 1 combo → thấy tồn kho.
  await sizeGroup.getByRole("radio", { name: "40" }).click();
  await colorGroup.getByRole("radio", { name: "Đen" }).click();
  await expect(page.getByText(/Còn \d+ sản phẩm|Hết hàng/)).toBeVisible();
});
