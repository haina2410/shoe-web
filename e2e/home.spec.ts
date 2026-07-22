import { test, expect } from "@playwright/test";

test("trang chủ hiển thị brand và điều hướng", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "leafshoes" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("leafshoes");
  await expect(page.getByRole("link", { name: /giỏ hàng/i })).toBeVisible();
});
