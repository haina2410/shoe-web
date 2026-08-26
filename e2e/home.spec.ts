import { test, expect } from "@playwright/test";

test("trang chủ hiển thị brand và điều hướng", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Trang chủ leafshoes", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("leafshoes");
  await expect(
    page.getByRole("banner").getByRole("link", { name: "Giỏ hàng", exact: true }),
  ).toBeVisible();
});

test("thư viện công ty chuyển ảnh thủ công và quay vòng", async ({ page }) => {
  await page.goto("/");

  const gallery = page.locator('[data-section="company"]');
  await expect(
    gallery.getByRole("heading", { name: "Khoảnh khắc tại leafshoes" }),
  ).toBeVisible();
  await expect(gallery.getByText("1 / 2", { exact: true })).toBeVisible();

  await gallery.getByRole("button", { name: "Ảnh tiếp theo" }).click();
  await expect(gallery.getByText("2 / 2", { exact: true })).toBeVisible();

  await gallery.getByRole("button", { name: "Ảnh tiếp theo" }).click();
  await expect(gallery.getByText("1 / 2", { exact: true })).toBeVisible();

  await gallery.getByRole("button", { name: "Ảnh trước đó" }).click();
  await expect(gallery.getByText("2 / 2", { exact: true })).toBeVisible();
});
