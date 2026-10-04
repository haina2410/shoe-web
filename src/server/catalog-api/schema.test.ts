import { describe, expect, it } from "vitest";
import { catalogProductSchema } from "./schema";
const body = {
  product: { name: "Shoe", categoryId: "cat", basePrice: 350000 },
  variants: [{ size: "38", color: "Black", sku: "ONE", stock: 3 }],
};
describe("catalog input boundary", () => {
  it("defaults to drafts and preserves whole VND", () => {
    expect(catalogProductSchema.parse(body).product).toMatchObject({
      status: "DRAFT",
      basePrice: 350000,
    });
  });
  it("rejects publication, unknown fields, duplicate SKUs, and database integer overflow", () => {
    for (const input of [
      { ...body, product: { ...body.product, status: "ACTIVE" } },
      { ...body, ownerId: "injected" },
      { ...body, variants: [body.variants[0], body.variants[0]] },
      {
        ...body,
        variants: [body.variants[0], { ...body.variants[0], sku: "TWO" }],
      },
      { ...body, product: { ...body.product, basePrice: 2147483648 } },
      { ...body, product: { ...body.product, name: " " } },
      {
        ...body,
        imageSets: [
          {
            color: "Black",
            isDefault: true,
            position: 0,
            images: [{ url: "http://localhost/private", position: 0 }],
          },
        ],
      },
    ])
      expect(catalogProductSchema.safeParse(input).success).toBe(false);
  });
});
