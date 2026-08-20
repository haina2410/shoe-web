import { beforeEach, describe, expect, it, vi } from "vitest";

const { findManyMock } = vi.hoisted(() => ({
  findManyMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: {
      findMany: findManyMock,
    },
  },
}));

const { default: sitemap } = await import("./sitemap");

beforeEach(() => {
  vi.stubEnv("APP_BASE_URL", "https://leafshoesvietnam.com/");
  findManyMock.mockImplementation(async (query) => {
    if (query?.where?.status !== "ACTIVE") {
      throw new Error("Sitemap query must select active products only");
    }

    return [
      {
        slug: "giay-chay-bo",
        updatedAt: new Date("2026-08-19T03:00:00.000Z"),
      },
      {
        slug: "giay-luoi",
        updatedAt: new Date("2026-08-20T04:00:00.000Z"),
      },
    ];
  });
});

describe("sitemap", () => {
  it("publishes public storefront pages and active products as canonical URLs", async () => {
    await expect(sitemap()).resolves.toEqual([
      { url: "https://leafshoesvietnam.com" },
      { url: "https://leafshoesvietnam.com/products" },
      { url: "https://leafshoesvietnam.com/gioi-thieu" },
      { url: "https://leafshoesvietnam.com/nha-may" },
      { url: "https://leafshoesvietnam.com/chi-nhanh" },
      {
        url: "https://leafshoesvietnam.com/chinh-sach/huong-dan-mua-hang",
      },
      { url: "https://leafshoesvietnam.com/chinh-sach/giao-hang" },
      { url: "https://leafshoesvietnam.com/chinh-sach/thanh-toan" },
      { url: "https://leafshoesvietnam.com/chinh-sach/doi-tra" },
      { url: "https://leafshoesvietnam.com/chinh-sach/bao-mat" },
      {
        url: "https://leafshoesvietnam.com/products/giay-chay-bo",
        lastModified: new Date("2026-08-19T03:00:00.000Z"),
      },
      {
        url: "https://leafshoesvietnam.com/products/giay-luoi",
        lastModified: new Date("2026-08-20T04:00:00.000Z"),
      },
    ]);
  });
});
