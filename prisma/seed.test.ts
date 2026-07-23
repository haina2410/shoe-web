import { describe, it, expect, beforeEach } from "vitest";
import { testPrisma, resetDb } from "@/test/db";
import { seed } from "./seed";
import { PROVINCE_ZONES } from "./data/provinces";

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
    // 3 tỉnh được map; và có đúng 1 zone mặc định (fallback)
    expect(await testPrisma.provinceZone.count()).toBe(
      PROVINCE_ZONES.length,
    ); // = 3
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
});
