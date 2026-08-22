import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, testPrisma } from "@/test/db";
import {
  CategoryBusinessError,
  createCategoryCore,
  deleteCategoryCore,
  updateCategoryCore,
} from "./categories";

describe("category core", () => {
  beforeEach(resetDb);

  it("creates a flat category with a unique slug", async () => {
    await testPrisma.category.create({
      data: { name: "Giày chạy bộ cũ", slug: "giay-chay-bo" },
    });

    const category = await createCategoryCore(testPrisma, {
      name: "Giày chạy bộ",
    });

    expect(category).toMatchObject({
      name: "Giày chạy bộ",
      slug: "giay-chay-bo-2",
      parentId: null,
    });
  });

  it("updates the name without changing the storefront slug", async () => {
    const category = await testPrisma.category.create({
      data: { name: "Sneaker", slug: "sneaker" },
    });

    const updated = await updateCategoryCore(testPrisma, category.id, {
      name: "Giày sneaker",
    });

    expect(updated).toMatchObject({
      id: category.id,
      name: "Giày sneaker",
      slug: "sneaker",
    });
  });

  it("deletes an empty category", async () => {
    const category = await testPrisma.category.create({
      data: { name: "Phụ kiện", slug: "phu-kien" },
    });

    await deleteCategoryCore(testPrisma, category.id);

    await expect(
      testPrisma.category.findUnique({ where: { id: category.id } }),
    ).resolves.toBeNull();
  });

  it("blocks deletion when products still belong to the category", async () => {
    const category = await testPrisma.category.create({
      data: { name: "Sandal", slug: "sandal" },
    });
    await testPrisma.product.create({
      data: {
        name: "Sandal đi biển",
        slug: "sandal-di-bien",
        categoryId: category.id,
        basePrice: 350000,
      },
    });

    await expect(deleteCategoryCore(testPrisma, category.id)).rejects.toEqual(
      new CategoryBusinessError("CATEGORY_IN_USE"),
    );
    await expect(
      testPrisma.category.findUnique({ where: { id: category.id } }),
    ).resolves.not.toBeNull();
  });
});
