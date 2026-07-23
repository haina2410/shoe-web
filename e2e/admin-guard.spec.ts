import { test, expect } from "@playwright/test";

// Phạm vi Ngày 2: chỉ E2E test khách CHƯA đăng nhập bị chặn khỏi /admin.
// Phân biệt redirect staff-vs-owner (đã đăng nhập nhưng không đủ quyền) cần
// UI đăng nhập + user thật → hoãn sang Ngày 3.
test("khách chưa đăng nhập bị chặn khỏi /admin, redirect sang /login", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Đăng nhập" }),
  ).toBeVisible();
});

test("redirect giữ lại đường dẫn gốc trong query ?redirect=", async ({
  page,
}) => {
  await page.goto("/admin/products");
  await expect(page).toHaveURL(/\/login\?redirect=%2Fadmin%2Fproducts/);
});
