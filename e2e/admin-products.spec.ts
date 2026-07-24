import "dotenv/config";
import { test, expect } from "@playwright/test";

/**
 * Headline E2E Ngày 3: đăng nhập bằng owner seed → tạo sản phẩm mới (kèm 1
 * biến thể) qua form → thấy sản phẩm trong danh sách `/admin/products`.
 *
 * Chứng minh xuyên suốt: Task 1 (seed user + disableSignUp + login + guard)
 * + Task 3 (product actions) + Task 5 (list UI) + Task 6 (form UI).
 *
 * Bỏ qua upload ảnh trong test này để ổn định (đã có integration test riêng
 * cho việc persist ảnh — xem `src/server/products.integration.test.ts`).
 *
 * Cần chuẩn bị trước khi chạy: `npx prisma db seed` (owner + category) trên
 * DB dev mà `npm run build && npm run start` (xem `playwright.config.ts`) sẽ
 * dùng.
 */

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL || "owner@leafshoes.local";
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD;

test("owner đăng nhập → tạo sản phẩm mới kèm 1 biến thể → thấy trong danh sách", async ({
  page,
}) => {
  test.skip(
    !OWNER_PASSWORD,
    "Thiếu SEED_OWNER_PASSWORD trong môi trường — không thể đăng nhập owner seed.",
  );

  const runId = Math.floor(Math.random() * 1_000_000);
  const productName = `Giày Thử Nghiệm E2E ${runId}`;
  const sku = `E2E-SKU-${runId}`;

  // 1) Đăng nhập bằng owner seed.
  await page.goto("/login");
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Mật khẩu").fill(OWNER_PASSWORD as string);
  await page.getByRole("button", { name: "Đăng nhập" }).click();

  await expect(page).toHaveURL(/\/admin(\/products)?$/, { timeout: 15_000 });

  // 2) Vào /admin/products → "Thêm sản phẩm".
  await page.goto("/admin/products");
  await page.getByRole("link", { name: "Thêm sản phẩm" }).click();
  await expect(page).toHaveURL(/\/admin\/products\/new/);

  // 3) Điền thông tin sản phẩm.
  await page.getByLabel("Tên sản phẩm").fill(productName);
  await page.getByLabel("Giá (VND)").fill("199000");
  // Chọn danh mục đầu tiên có sẵn (đã seed ≥ 1 category).
  const categorySelect = page.getByLabel("Danh mục");
  const firstCategoryValue = await categorySelect
    .locator("option")
    .first()
    .getAttribute("value");
  if (firstCategoryValue) {
    await categorySelect.selectOption(firstCategoryValue);
  }

  // 4) Điền 1 biến thể (size 40, màu Đen, sku duy nhất, tồn 10).
  await page.getByLabel("Size").fill("40");
  await page.getByLabel("Màu").fill("Đen");
  await page.getByLabel("SKU").fill(sku);
  await page.getByLabel("Tồn kho").fill("10");

  // 5) Submit → về /admin/products.
  await page.getByRole("button", { name: "Tạo sản phẩm" }).click();
  await expect(page).toHaveURL(/\/admin\/products$/, { timeout: 15_000 });

  // 6) Thấy sản phẩm mới trong bảng.
  const row = page.getByRole("row", { name: new RegExp(productName) });
  await expect(row).toBeVisible();
  await expect(row.getByText("10", { exact: true })).toBeVisible(); // tổng tồn = 10 (1 biến thể)
});
