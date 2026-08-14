import { describe, it, expect } from "vitest";
import {
  variantInputSchema,
  productInputSchema,
  createProductInputSchema,
  updateProductInputSchema,
  updateVariantStockSchema,
} from "@/lib/validation/product";

describe("variantInputSchema", () => {
  const valid = {
    size: "42",
    color: "Đen",
    sku: "SKU-001",
    priceOverride: null,
    stock: 10,
  };

  it("chấp nhận payload hợp lệ (priceOverride null)", () => {
    expect(variantInputSchema.safeParse(valid).success).toBe(true);
  });

  it("chấp nhận priceOverride là số nguyên hợp lệ", () => {
    expect(
      variantInputSchema.safeParse({ ...valid, priceOverride: 100000 })
        .success,
    ).toBe(true);
  });

  it("chấp nhận priceOverride bị bỏ qua (optional)", () => {
    const rest = {
      size: valid.size,
      color: valid.color,
      sku: valid.sku,
      stock: valid.stock,
    };
    expect(variantInputSchema.safeParse(rest).success).toBe(true);
  });

  it("từ chối sku rỗng", () => {
    expect(variantInputSchema.safeParse({ ...valid, sku: "" }).success).toBe(
      false,
    );
  });

  it("từ chối size rỗng", () => {
    expect(variantInputSchema.safeParse({ ...valid, size: "" }).success).toBe(
      false,
    );
  });

  it("từ chối color rỗng", () => {
    expect(
      variantInputSchema.safeParse({ ...valid, color: "" }).success,
    ).toBe(false);
  });

  it("từ chối stock âm", () => {
    expect(variantInputSchema.safeParse({ ...valid, stock: -1 }).success).toBe(
      false,
    );
  });

  it("từ chối stock không nguyên", () => {
    expect(variantInputSchema.safeParse({ ...valid, stock: 1.5 }).success).toBe(
      false,
    );
  });

  it("từ chối priceOverride âm", () => {
    expect(
      variantInputSchema.safeParse({ ...valid, priceOverride: -1 }).success,
    ).toBe(false);
  });

  it("từ chối priceOverride không nguyên", () => {
    expect(
      variantInputSchema.safeParse({ ...valid, priceOverride: 1.5 }).success,
    ).toBe(false);
  });
});

describe("productInputSchema", () => {
  const valid = {
    name: "Giày Sục Nữ",
    description: "Mô tả",
    categoryId: "cat-1",
    basePrice: 250000,
    status: "ACTIVE" as const,
  };

  it("chấp nhận payload hợp lệ", () => {
    expect(productInputSchema.safeParse(valid).success).toBe(true);
  });

  it("status mặc định là DRAFT nếu bỏ qua", () => {
    const rest = {
      name: valid.name,
      description: valid.description,
      categoryId: valid.categoryId,
      basePrice: valid.basePrice,
    };
    const result = productInputSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe("DRAFT");
    }
  });

  it("description có thể bỏ qua (optional)", () => {
    const rest = {
      name: valid.name,
      categoryId: valid.categoryId,
      basePrice: valid.basePrice,
      status: valid.status,
    };
    expect(productInputSchema.safeParse(rest).success).toBe(true);
  });

  it("từ chối name rỗng", () => {
    expect(productInputSchema.safeParse({ ...valid, name: "" }).success).toBe(
      false,
    );
  });

  it("từ chối categoryId rỗng", () => {
    expect(
      productInputSchema.safeParse({ ...valid, categoryId: "" }).success,
    ).toBe(false);
  });

  it("từ chối basePrice âm", () => {
    expect(
      productInputSchema.safeParse({ ...valid, basePrice: -1 }).success,
    ).toBe(false);
  });

  it("từ chối basePrice không nguyên", () => {
    expect(
      productInputSchema.safeParse({ ...valid, basePrice: 1.5 }).success,
    ).toBe(false);
  });

  it("từ chối status không thuộc enum", () => {
    expect(
      productInputSchema.safeParse({ ...valid, status: "PUBLISHED" }).success,
    ).toBe(false);
  });
});

describe("createProductInputSchema", () => {
  const validVariant = {
    size: "42",
    color: "Đen",
    sku: "SKU-001",
    priceOverride: null,
    stock: 10,
  };
  const validProduct = {
    name: "Giày Sục Nữ",
    categoryId: "cat-1",
    basePrice: 250000,
  };
  const validImageSet = {
    color: "Đen",
    position: 0,
    isDefault: true,
    images: [{ url: "/api/uploads/products/black.webp", position: 0 }],
  };

  it("chấp nhận payload hợp lệ với ít nhất 1 biến thể", () => {
    const result = createProductInputSchema.safeParse({
      product: validProduct,
      variants: [validVariant],
    });
    expect(result.success).toBe(true);
  });

  it("từ chối khi variants rỗng", () => {
    const result = createProductInputSchema.safeParse({
      product: validProduct,
      variants: [],
    });
    expect(result.success).toBe(false);
  });

  it("từ chối khi product không hợp lệ", () => {
    const result = createProductInputSchema.safeParse({
      product: { ...validProduct, name: "" },
      variants: [validVariant],
    });
    expect(result.success).toBe(false);
  });

  it("chấp nhận bộ ảnh thuộc màu của biến thể", () => {
    expect(
      createProductInputSchema.safeParse({
        product: validProduct,
        variants: [validVariant],
        imageSets: [validImageSet],
      }).success,
    ).toBe(true);
  });

  it("từ chối hai bộ ảnh trùng màu", () => {
    expect(
      createProductInputSchema.safeParse({
        product: validProduct,
        variants: [validVariant],
        imageSets: [validImageSet, { ...validImageSet, position: 1 }],
      }).success,
    ).toBe(false);
  });

  it("từ chối bộ ảnh không thuộc màu biến thể", () => {
    expect(
      createProductInputSchema.safeParse({
        product: validProduct,
        variants: [validVariant],
        imageSets: [{ ...validImageSet, color: "Trắng" }],
      }).success,
    ).toBe(false);
  });

  it("từ chối bộ ảnh rỗng", () => {
    expect(
      createProductInputSchema.safeParse({
        product: validProduct,
        variants: [validVariant],
        imageSets: [{ ...validImageSet, images: [] }],
      }).success,
    ).toBe(false);
  });

  it("từ chối danh sách bộ ảnh không có bộ mặc định", () => {
    expect(
      createProductInputSchema.safeParse({
        product: validProduct,
        variants: [validVariant],
        imageSets: [{ ...validImageSet, isDefault: false }],
      }).success,
    ).toBe(false);
  });

  it("từ chối nhiều bộ ảnh mặc định", () => {
    expect(
      createProductInputSchema.safeParse({
        product: validProduct,
        variants: [validVariant, { ...validVariant, color: "Trắng", sku: "SKU-002" }],
        imageSets: [
          validImageSet,
          { ...validImageSet, color: "Trắng", position: 1 },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("updateVariantStockSchema", () => {
  it("chấp nhận payload hợp lệ", () => {
    expect(
      updateVariantStockSchema.safeParse({
        variantId: "v1",
        stock: 5,
        expectedStock: 4,
      }).success,
    ).toBe(true);
  });

  it("từ chối quick edit thiếu stock đã quan sát", () => {
    expect(
      updateVariantStockSchema.safeParse({ variantId: "v1", stock: 5 })
        .success,
    ).toBe(false);
  });

  it("từ chối variantId rỗng", () => {
    expect(
      updateVariantStockSchema.safeParse({
        variantId: "",
        stock: 5,
        expectedStock: 4,
      }).success,
    ).toBe(false);
  });

  it("từ chối stock âm", () => {
    expect(
      updateVariantStockSchema.safeParse({
        variantId: "v1",
        stock: -1,
        expectedStock: 4,
      }).success,
    ).toBe(false);
  });

  it("từ chối stock không nguyên", () => {
    expect(
      updateVariantStockSchema.safeParse({
        variantId: "v1",
        stock: 1.5,
        expectedStock: 4,
      }).success,
    ).toBe(false);
  });
});

describe("updateProductInputSchema optimistic stock contract", () => {
  const product = {
    name: "Giày Thử Nghiệm",
    categoryId: "cat-1",
    basePrice: 250_000,
    status: "ACTIVE" as const,
  };
  const variant = {
    size: "42",
    color: "Đen",
    sku: "SKU-001",
    priceOverride: null,
    stock: 8,
  };

  it("requires the originally observed stock for an existing variant", () => {
    expect(
      updateProductInputSchema.safeParse({
        product,
        variants: [{ ...variant, id: "variant-1" }],
        imageSets: [],
      }).success,
    ).toBe(false);
  });

  it("accepts expectedStock for an existing variant", () => {
    expect(
      updateProductInputSchema.safeParse({
        product,
        variants: [{ ...variant, id: "variant-1", expectedStock: 10 }],
        imageSets: [],
      }).success,
    ).toBe(true);
  });

  it("does not require expectedStock for a new variant", () => {
    expect(
      updateProductInputSchema.safeParse({
        product,
        variants: [variant],
        imageSets: [],
      }).success,
    ).toBe(true);
  });
});
