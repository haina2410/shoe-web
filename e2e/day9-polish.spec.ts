import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 1000 },
] as const;

async function tabTo(
  page: import("@playwright/test").Page,
  target: import("@playwright/test").Locator,
) {
  await expect(target).toBeVisible();

  for (let attempts = 0; attempts < 80; attempts += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => document.activeElement === element)) {
      return;
    }
  }

  throw new Error(`Không thể đưa focus bàn phím tới ${await target.ariaSnapshot()}`);
}

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

test("mua hàng public sử dụng được hoàn toàn bằng bàn phím", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Bỏ qua điều hướng" }),
  ).toBeFocused();

  const searchbox = page.getByRole("searchbox", { name: "Tìm sản phẩm" });
  await tabTo(page, searchbox);
  await page.keyboard.type("chay bo");

  await tabTo(page, page.getByRole("button", { name: "Gửi tìm kiếm" }));
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/[?&]q=chay(\+|%20)bo/);

  const product = page.getByRole("link", { name: "Giày Chạy Bộ Êm Nhẹ" }).first();
  await tabTo(page, product);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/products\/giay-chay-bo-em-nhe$/);

  const size = page.getByRole("radio", { name: "40" });
  await tabTo(page, size);
  await page.keyboard.press("Space");
  await expect(size).toHaveAttribute("aria-checked", "true");

  const color = page.getByRole("radio", { name: "Đen" });
  await tabTo(page, color);
  await page.keyboard.press("Space");
  await expect(color).toHaveAttribute("aria-checked", "true");

  await tabTo(page, page.getByRole("button", { name: "Thêm vào giỏ" }));
  await page.keyboard.press("Space");

  const cartLink = page.getByRole("link", { name: /Đã thêm — Xem giỏ hàng/ });
  await tabTo(page, cartLink);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/cart$/);

  await tabTo(page, page.getByRole("link", { name: "Thanh toán" }));
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/checkout$/);
});

test("tôn trọng lựa chọn giảm chuyển động của hệ điều hành", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const cardImage = page.locator('a[href^="/products/"] img').first();
  await expect(cardImage).toHaveCSS("transition-duration", "1e-05s");

  const category = page.getByRole("link", { name: "Sneaker", exact: true });
  const categoryArrow = category.locator("svg").first();
  await category.hover();
  await expect(categoryArrow).toHaveCSS("transform", "none");
});
