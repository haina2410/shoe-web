import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 1000 },
] as const;

const CONTENT_ROUTES = [
  { path: "/gioi-thieu", heading: "Giới thiệu công ty" },
  { path: "/nha-may", heading: "Nhà máy & hoạt động kinh doanh" },
  { path: "/chi-nhanh", heading: "Chi nhánh" },
  { path: "/chinh-sach/gia", heading: "Chính sách giá" },
  { path: "/chinh-sach/thanh-toan", heading: "Chính sách thanh toán" },
  { path: "/chinh-sach/giao-hang", heading: "Chính sách giao hàng" },
  { path: "/chinh-sach/doi-tra", heading: "Chính sách đổi trả và hoàn tiền" },
  { path: "/chinh-sach/bao-hanh", heading: "Chính sách bảo hành" },
  {
    path: "/chinh-sach/dieu-kien-cung-cap",
    heading: "Điều kiện và hạn chế trong việc cung cấp hàng hoá",
  },
  {
    path: "/chinh-sach/khieu-nai",
    heading: "Phương thức tiếp nhận và giải quyết phản ánh, yêu cầu, khiếu nại",
  },
  { path: "/chinh-sach/bao-mat", heading: "Chính sách bảo mật thông tin" },
] as const;

for (const viewport of VIEWPORTS) {
  test(`${viewport.name}: mọi trang doanh nghiệp và chính sách mở được, không tràn ngang`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);

    for (const route of CONTENT_ROUTES) {
      await page.goto(route.path);
      await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();

      if (route.path === "/gioi-thieu") {
        const companyImages = page.getByTestId("about-company-images");

        await expect(companyImages).toBeVisible();
        await expect(companyImages.getByRole("img")).toHaveCount(3);
      }

      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
        `${route.path} tràn ngang ở ${viewport.name}`,
      ).toBe(true);
    }
  });
}

test("menu Tổng quan doanh nghiệp mở bằng bàn phím và dẫn tới trang giới thiệu", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");

  // Cùng một tập liên kết xuất hiện ở cả navbar và chân trang, nên mọi selector
  // đều phải giới hạn trong vùng "Điều hướng chính".
  const mainNav = page.getByRole("navigation", { name: "Điều hướng chính" });
  const toggle = mainNav.getByRole("button", { name: "Tổng quan doanh nghiệp" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  await mainNav.getByRole("link", { name: "Giới thiệu công ty" }).click();
  await expect(page).toHaveURL(/\/gioi-thieu$/);
  await expect(page.getByRole("heading", { level: 1, name: "Giới thiệu công ty" })).toBeVisible();
});

test("Escape đóng menu doanh nghiệp và trả focus về nút", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");

  const mainNav = page.getByRole("navigation", { name: "Điều hướng chính" });
  const toggle = mainNav.getByRole("button", { name: "Tổng quan doanh nghiệp" });
  await toggle.click();
  await expect(mainNav.getByRole("link", { name: "Chi nhánh" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();
});

test("chân trang dẫn tới chính sách đổi trả", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const link = page
    .getByRole("navigation", { name: "Chính sách" })
    .getByRole("link", { name: "Chính sách đổi trả và hoàn tiền" });

  // Cú click ngay sau `goto` có thể rơi vào lúc router chưa hydrate xong (chỉ
  // xảy ra khi cả bộ E2E chạy song song), khiến điều hướng bị bỏ. `toPass` cho
  // phép click lại thay vì chờ mù một điều hướng không bao giờ tới.
  await expect(async () => {
    await link.click();
    await expect(page).toHaveURL(/\/chinh-sach\/doi-tra$/, { timeout: 2_000 });
  }).toPass({ timeout: 15_000 });

  await expect(
    page.getByRole("heading", { level: 1, name: "Chính sách đổi trả và hoàn tiền" }),
  ).toBeVisible();
});

test("thanh liên hệ trên cùng cho gọi và gửi thư ngay", async ({ page }) => {
  await page.goto("/");

  const topBar = page.getByTestId("site-top-bar");
  await expect(topBar.getByRole("link", { name: /^0/ })).toHaveAttribute(
    "href",
    /^tel:\d+$/,
  );
  await expect(topBar.getByRole("link", { name: /@/ })).toHaveAttribute(
    "href",
    /^mailto:.+@.+$/,
  );
});

test("slug chính sách không tồn tại trả về trang 404", async ({ page }) => {
  const response = await page.goto("/chinh-sach/khong-ton-tai");

  expect(response?.status()).toBe(404);
});
