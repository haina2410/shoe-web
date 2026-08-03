import { describe, it, expect, beforeEach } from "vitest";
import { testPrisma, resetDb } from "@/test/db";
import { seed, catalogAlreadySeeded } from "./seed";
import { PROVINCE_ZONES } from "./data/provinces";
import { SEEDED_PRODUCT_IMAGE_BY_SLUG } from "@/lib/storefront-assets";

describe("seed()", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("tạo danh mục, sản phẩm có biến thể, và zone phí ship", async () => {
    await seed(testPrisma);
    expect(await testPrisma.category.count()).toBeGreaterThan(0);
    const products = await testPrisma.product.count();
    expect(products).toBeGreaterThan(0);
    // mỗi sản phẩm có ≥ 1 biến thể
    const productsWithVariants = await testPrisma.product.findMany({
      include: { variants: true },
    });
    expect(productsWithVariants.every((p) => p.variants.length > 0)).toBe(
      true,
    );
    // 34 tỉnh/thành được map vào đúng 1 zone đồng giá toàn quốc (fallback = zone đó luôn)
    expect(await testPrisma.provinceZone.count()).toBe(
      PROVINCE_ZONES.length,
    ); // = 34
    expect(await testPrisma.shippingZone.count()).toBe(1);
    expect(
      await testPrisma.shippingZone.count({ where: { isDefault: true } }),
    ).toBe(1);
  });

  it("idempotent: chạy 2 lần không nhân đôi dữ liệu", async () => {
    await seed(testPrisma);
    const c1 = await testPrisma.provinceZone.count();
    await seed(testPrisma);
    const c2 = await testPrisma.provinceZone.count();
    expect(c2).toBe(c1);
  });

  it("phân biệt được catalog rỗng và catalog đã seed, để SEED=1 không ghi đè shop", async () => {
    expect(await catalogAlreadySeeded(testPrisma)).toBe(false);
    await seed(testPrisma);
    expect(await catalogAlreadySeeded(testPrisma)).toBe(true);
  });

  it("gắn đúng ảnh storefront cho từng sản phẩm mẫu", async () => {
    await seed(testPrisma);

    const products = await testPrisma.product.findMany({
      select: {
        slug: true,
        images: {
          select: { url: true },
          orderBy: { position: "asc" },
        },
      },
    });

    expect(products).toHaveLength(
      Object.keys(SEEDED_PRODUCT_IMAGE_BY_SLUG).length,
    );
    for (const product of products) {
      const expectedImage =
        SEEDED_PRODUCT_IMAGE_BY_SLUG[
          product.slug as keyof typeof SEEDED_PRODUCT_IMAGE_BY_SLUG
        ];
      expect(expectedImage).toBeDefined();
      expect(product.images.map((image) => image.url)).toEqual([
        expectedImage,
      ]);
    }
  });
});
