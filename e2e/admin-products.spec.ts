import { expect, test } from "@playwright/test";

const ownerEmail = process.env.SEED_OWNER_EMAIL || "owner@leafshoes.local";
const ownerPassword = process.env.SEED_OWNER_PASSWORD;

async function expectToast(page: import("@playwright/test").Page, title: string) {
  const liveRegion = page.getByRole("region", { name: "Notifications" });
  await expect(liveRegion).toBeVisible();
  await expect(liveRegion.getByText(title, { exact: true })).toBeVisible();
}

async function pauseServerAction(page: import("@playwright/test").Page) {
  let start: () => void;
  let finish: () => void;
  let release: () => void;
  let held = false;
  const started = new Promise<void>((resolve) => {
    start = resolve;
  });
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const unblocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const handler = async (route: import("@playwright/test").Route) => {
    if (!held && route.request().headers()["next-action"]) {
      held = true;
      start();
      await unblocked;
      await route.continue();
      finish();
      return;
    }
    await route.continue();
  };

  await page.route("**/*", handler);

  return {
    waitForStart: () => started,
    async release() {
      release();
      await finished;
      await page.unroute("**/*", handler);
    },
  };
}

async function loginAsOwner(page: import("@playwright/test").Page) {
  if (!ownerPassword) {
    throw new Error("E2E cần SEED_OWNER_PASSWORD trong môi trường test.");
  }

  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": "198.51.100.11" });
  await page.goto("/login");
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Mật khẩu").fill(ownerPassword);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("owner creates, edits, updates stock, and confirms product deletion", async ({
  page,
}) => {
  const runId = `${Date.now()}-${process.pid}`;
  const productName = `Giày Thử Nghiệm E2E ${runId}`;
  const updatedProductName = `${productName} đã sửa`;
  const sku = `E2E-SKU-${runId}`;

  await loginAsOwner(page);
  await page.goto("/admin/products");
  await page.getByRole("link", { name: "Thêm sản phẩm" }).click();
  await expect(page).toHaveURL(/\/admin\/products\/new$/);

  await page.getByLabel("Tên sản phẩm").fill(productName);
  await page.getByLabel("Giá (VND)").fill("199000");
  const category = page.getByLabel("Danh mục");
  await category.selectOption(await category.locator("option").first().getAttribute("value") ?? "");
  await page.getByLabel("Size").fill("40");
  await page.getByLabel("Màu").fill("Đen");
  await page.getByLabel("SKU").fill(sku);
  await page.getByLabel("Tồn kho").fill("10");
  await page.getByRole("button", { name: "Tạo sản phẩm" }).click();

  await expect(page).toHaveURL(/\/admin\/products$/, { timeout: 15_000 });
  await expectToast(page, "Đã tạo sản phẩm");
  let productRow = page.getByRole("row").filter({ hasText: productName });
  await expect(productRow).toContainText("10 đôi");

  await productRow.getByRole("link", { name: "Sửa" }).click();
  await expect(page.getByRole("heading", { name: "Sửa sản phẩm" })).toBeVisible();
  await page.getByLabel("Tên sản phẩm").fill(updatedProductName);
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();

  await expect(page).toHaveURL(/\/admin\/products$/, { timeout: 15_000 });
  await expectToast(page, "Đã lưu thay đổi");
  productRow = page.getByRole("row").filter({ hasText: updatedProductName });
  await expect(productRow).toBeVisible();

  await productRow.getByRole("link", { name: "Sửa" }).click();
  const stockSection = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Chỉnh nhanh tồn kho" }) });
  const stockRow = stockSection.getByRole("row").filter({ hasText: sku });
  const stockInput = stockRow.getByLabel("Tồn kho");
  await stockInput.fill("14");
  const pendingStockUpdate = await pauseServerAction(page);
  await stockRow.getByRole("button", { name: "Lưu" }).click();
  await pendingStockUpdate.waitForStart();
  await expect(stockInput).toBeDisabled();
  await expect(stockRow.getByRole("button", { name: "Đang lưu…" })).toBeDisabled();
  await expect(stockRow.getByRole("status", { name: "Đang lưu…" })).toBeVisible();
  await pendingStockUpdate.release();
  await expectToast(page, "Đã cập nhật tồn kho");

  await page.goto("/admin/products");
  productRow = page.getByRole("row").filter({ hasText: updatedProductName });
  await expect(productRow).toContainText("14 đôi");
  await productRow.getByRole("button", { name: "Xoá" }).click();
  const deletionDialog = page.getByRole("alertdialog", { name: "Xoá sản phẩm" });
  await expect(deletionDialog).toContainText(updatedProductName);
  await deletionDialog.getByRole("button", { name: "Hủy" }).click();
  await expect(deletionDialog).toBeHidden();
  await expect(productRow).toBeVisible();

  await productRow.getByRole("button", { name: "Xoá" }).click();
  await deletionDialog.getByRole("button", { name: "Xác nhận xoá" }).click();
  await expectToast(page, "Đã xoá sản phẩm");
  await expect(productRow).toHaveCount(0);
});

test.describe("mobile product administration", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("keeps navigation and product controls reachable", async ({ page }) => {
    await loginAsOwner(page);
    await page.goto("/admin/products");

    const navigation = page.getByRole("navigation", {
      name: "Điều hướng quản trị",
    });
    await expect(navigation).toBeVisible();
    await expect(
      navigation.getByRole("link", { name: "Sản phẩm" }),
    ).toHaveAttribute("aria-current", "page");

    for (const label of ["Sản phẩm", "Đơn hàng", "Đối soát"]) {
      const link = navigation.getByRole("link", { name: label });
      await link.scrollIntoViewIfNeeded();
      const box = await link.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(40);
    }

    const addProduct = page.getByRole("link", { name: "Thêm sản phẩm" });
    const addProductBox = await addProduct.boundingBox();
    expect(addProductBox?.height).toBeGreaterThanOrEqual(40);
    await expect(page.getByRole("region", { name: "Danh sách sản phẩm" })).toBeVisible();
  });
});
