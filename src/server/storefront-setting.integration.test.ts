import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, testPrisma } from "@/test/db";
import { setHomeHeroProduct } from "./storefront-setting";

async function createProduct(
  name: string,
  status: "ACTIVE" | "DRAFT",
  withImage: boolean,
) {
  const category = await testPrisma.category.upsert({
    where: { slug: "sneakers" },
    create: { name: "Sneakers", slug: "sneakers" },
    update: {},
  });
  return testPrisma.product.create({
    data: {
      name,
      nameNormalized: name.toLowerCase(),
      slug: name.toLowerCase().replaceAll(" ", "-"),
      categoryId: category.id,
      basePrice: 100000,
      status,
      ...(withImage
        ? {
            imageSets: {
              create: {
                color: "Đen",
                isDefault: true,
                images: { create: { url: `/products/${name}.png` } },
              },
            },
          }
        : {}),
    },
  });
}

describe("setHomeHeroProduct", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("switches the selected product and clears it when requested", async () => {
    const first = await createProduct("First", "ACTIVE", true);
    const second = await createProduct("Second", "ACTIVE", true);

    await setHomeHeroProduct(testPrisma, first.id);
    await setHomeHeroProduct(testPrisma, second.id);

    expect(
      await testPrisma.storefrontSetting.findUnique({ where: { id: 1 } }),
    ).toMatchObject({ heroProductId: second.id });

    await setHomeHeroProduct(testPrisma, null);
    expect(
      await testPrisma.storefrontSetting.findUnique({ where: { id: 1 } }),
    ).toMatchObject({ heroProductId: null });
  });

  it("rejects draft and imageless products without losing the selection", async () => {
    const selected = await createProduct("Selected", "ACTIVE", true);
    const draft = await createProduct("Draft", "DRAFT", true);
    const imageless = await createProduct("Imageless", "ACTIVE", false);
    await setHomeHeroProduct(testPrisma, selected.id);

    await expect(setHomeHeroProduct(testPrisma, draft.id)).rejects.toThrow(
      "HOME_HERO_INELIGIBLE",
    );
    await expect(setHomeHeroProduct(testPrisma, imageless.id)).rejects.toThrow(
      "HOME_HERO_INELIGIBLE",
    );
    expect(
      await testPrisma.storefrontSetting.findUnique({ where: { id: 1 } }),
    ).toMatchObject({ heroProductId: selected.id });
  });

  it("clears the saved selection when the product is deleted", async () => {
    const selected = await createProduct("Selected", "ACTIVE", true);
    await setHomeHeroProduct(testPrisma, selected.id);

    await testPrisma.product.delete({ where: { id: selected.id } });

    expect(
      await testPrisma.storefrontSetting.findUnique({ where: { id: 1 } }),
    ).toMatchObject({ heroProductId: null });
  });
});
