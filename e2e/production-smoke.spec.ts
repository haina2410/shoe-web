import { expect, test } from "@playwright/test";

const baseURL = process.env.SMOKE_BASE_URL;
if (!baseURL) {
  throw new Error("SMOKE_BASE_URL is required for production smoke tests");
}

const productPath = process.env.SMOKE_PRODUCT_PATH;
if (!productPath?.startsWith("/products/")) {
  throw new Error("SMOKE_PRODUCT_PATH must start with /products/");
}

test("production health is ready and non-cacheable", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await response.json()).toEqual({ status: "ok" });
});

test("public storefront and login routes render", async ({ request }) => {
  for (const path of ["/", "/products", productPath, "/login"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["content-type"], path).toContain("text/html");
  }
});

test("anonymous admin request is redirected to login", async ({ request }) => {
  const response = await request.get("/admin", { maxRedirects: 0 });
  const location = new URL(response.headers().location ?? "", baseURL);

  expect(response.status()).toBeGreaterThanOrEqual(300);
  expect(response.status()).toBeLessThan(400);
  expect(location.origin).toBe(new URL(baseURL).origin);
  expect(location.pathname).toBe("/login");
  expect(location.searchParams.get("redirect")).toBe("/admin");
});
