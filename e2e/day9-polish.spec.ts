import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 1000 },
] as const;

for (const viewport of VIEWPORTS) {
  test(`${viewport.name}: homepage dẫn tới danh mục và sản phẩm`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: /Bước êm cùng leafshoes/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Sneaker", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Thanh toán VietQR")).toBeVisible();
    await expect(
      page.getByText("CÔNG TY TNHH LEAFSHOES VIỆT NAM"),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });
}

test("tìm kiếm storefront sử dụng được hoàn toàn bằng bàn phím", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Bỏ qua điều hướng" }),
  ).toBeFocused();

  await page.getByRole("searchbox", { name: "Tìm sản phẩm" }).fill("chay bo");
  await page.getByRole("button", { name: "Gửi tìm kiếm" }).click();
  await expect(page).toHaveURL(/[?&]q=chay(\+|%20)bo/);
});

test("tôn trọng lựa chọn giảm chuyển động của hệ điều hành", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const cardImage = page.locator('a[href^="/products/"] img').first();
  await expect(cardImage).toHaveCSS("transition-duration", "1e-05s");
});
