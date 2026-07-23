import { describe, it, expect, beforeEach } from "vitest";
import { testPrisma, resetDb } from "@/test/db";
import {
  createProductCore,
  updateProductCore,
  deleteProductCore,
  updateVariantStockCore,
} from "@/server/products";
import type {
  CreateProductInput,
  UpdateProductInput,
} from "@/lib/validation/product";

async function makeCategory(name = "Giày Sneaker", slug = "giay-sneaker") {
  return testPrisma.category.create({ data: { name, slug } });
}

function baseCreateInput(
  overrides: Partial<CreateProductInput["product"]> = {},
  categoryId: string,
): CreateProductInput {
  return {
    product: {
      name: "Giày Sục Nữ",
      description: "Mô tả",
      categoryId,
      basePrice: 250000,
      status: "ACTIVE",
      ...overrides,
    },
    variants: [
      { size: "40", color: "Đen", sku: "SKU-A-40-DEN", priceOverride: null, stock: 10 },
      { size: "41", color: "Trắng", sku: "SKU-A-41-TRA", priceOverride: 260000, stock: 5 },
    ],
  };
}

describe("createProductCore", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("tạo sản phẩm hợp lệ: persisted, slug đúng, đúng số biến thể, stock/basePrice đúng", async () => {
    const category = await makeCategory();
    const input = baseCreateInput({}, category.id);

    const product = await createProductCore(testPrisma, input);

    expect(product.id).toBeTruthy();
    expect(product.slug).toBe("giay-suc-nu");
    expect(product.basePrice).toBe(250000);
    expect(product.variants).toHaveLength(2);

    const stocks = product.variants.map((v) => v.stock).sort((a, b) => a - b);
    expect(stocks).toEqual([5, 10]);

    const persisted = await testPrisma.product.findUnique({
      where: { id: product.id },
      include: { variants: true },
    });
    expect(persisted).not.toBeNull();
    expect(persisted?.variants).toHaveLength(2);
  });

  it("2 sản phẩm trùng tên → slug thứ 2 có hậu tố -2", async () => {
    const category = await makeCategory();

    const p1 = await createProductCore(
      testPrisma,
      baseCreateInput(
        {},
        category.id,
      ),
    );
    const p2 = await createProductCore(testPrisma, {
      product: { ...baseCreateInput({}, category.id).product },
      variants: [
        { size: "42", color: "Đen", sku: "SKU-B-42-DEN", priceOverride: null, stock: 3 },
      ],
    });

    expect(p1.slug).toBe("giay-suc-nu");
    expect(p2.slug).toBe("giay-suc-nu-2");
  });

  it("SKU trùng trong cùng input → ném lỗi, không tạo bản ghi rác (rollback)", async () => {
    const category = await makeCategory();
    const countBefore = await testPrisma.product.count();

    const input: CreateProductInput = {
      product: {
        name: "Giày Lỗi SKU",
        categoryId: category.id,
        basePrice: 100000,
        status: "DRAFT",
      },
      variants: [
        { size: "40", color: "Đen", sku: "DUP-SKU", priceOverride: null, stock: 1 },
        { size: "41", color: "Trắng", sku: "DUP-SKU", priceOverride: null, stock: 2 },
      ],
    };

    await expect(createProductCore(testPrisma, input)).rejects.toThrow();

    expect(await testPrisma.product.count()).toBe(countBefore);
    expect(await testPrisma.variant.count()).toBe(0);
  });

  it("SKU trùng với SKU đã tồn tại ở sản phẩm khác → ném lỗi, không tạo bản ghi rác", async () => {
    const category = await makeCategory();
    await createProductCore(testPrisma, baseCreateInput({}, category.id));
    const countBefore = await testPrisma.product.count();
    const variantCountBefore = await testPrisma.variant.count();

    const input: CreateProductInput = {
      product: {
        name: "Giày Khác",
        categoryId: category.id,
        basePrice: 300000,
        status: "DRAFT",
      },
      variants: [
        {
          size: "39",
          color: "Đen",
          sku: "SKU-A-40-DEN", // trùng sku đã tồn tại
          priceOverride: null,
          stock: 1,
        },
      ],
    };

    await expect(createProductCore(testPrisma, input)).rejects.toThrow();

    expect(await testPrisma.product.count()).toBe(countBefore);
    expect(await testPrisma.variant.count()).toBe(variantCountBefore);
  });
});

describe("deleteProductCore", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("xoá product → product + images + variants đều mất (đếm = 0)", async () => {
    const category = await makeCategory();
    const product = await createProductCore(testPrisma, baseCreateInput({}, category.id));
    await testPrisma.productImage.create({
      data: { productId: product.id, url: "/x.jpg", position: 0 },
    });

    await deleteProductCore(testPrisma, product.id);

    expect(await testPrisma.product.count({ where: { id: product.id } })).toBe(0);
    expect(await testPrisma.variant.count({ where: { productId: product.id } })).toBe(0);
    expect(
      await testPrisma.productImage.count({ where: { productId: product.id } }),
    ).toBe(0);
  });
});

describe("updateVariantStockCore", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("cập nhật đúng stock của biến thể", async () => {
    const category = await makeCategory();
    const product = await createProductCore(testPrisma, baseCreateInput({}, category.id));
    const variant = product.variants[0];

    const updated = await updateVariantStockCore(testPrisma, variant.id, 99);

    expect(updated.stock).toBe(99);
    const persisted = await testPrisma.variant.findUnique({ where: { id: variant.id } });
    expect(persisted?.stock).toBe(99);
  });
});

describe("updateProductCore", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("đổi tên/giá + thêm/bớt biến thể → phản ánh đúng", async () => {
    const category = await makeCategory();
    const product = await createProductCore(testPrisma, baseCreateInput({}, category.id));
    const [keepVariant, dropVariant] = product.variants;

    const update: UpdateProductInput = {
      product: {
        name: "Giày Sục Nữ Bản Mới",
        description: "Mô tả mới",
        categoryId: category.id,
        basePrice: 300000,
        status: "ACTIVE",
      },
      variants: [
        // giữ lại 1 biến thể cũ (có id), đổi stock
        {
          id: keepVariant.id,
          size: keepVariant.size,
          color: keepVariant.color,
          sku: keepVariant.sku,
          priceOverride: keepVariant.priceOverride,
          stock: 77,
        },
        // biến thể mới (không có id)
        {
          size: "44",
          color: "Xanh",
          sku: "SKU-A-44-XAN",
          priceOverride: null,
          stock: 8,
        },
      ],
    };

    const updated = await updateProductCore(testPrisma, product.id, update);

    expect(updated.name).toBe("Giày Sục Nữ Bản Mới");
    expect(updated.basePrice).toBe(300000);
    expect(updated.variants).toHaveLength(2);

    const skus = updated.variants.map((v) => v.sku).sort();
    expect(skus).toEqual(["SKU-A-44-XAN", keepVariant.sku].sort());

    const keptAfter = updated.variants.find((v) => v.id === keepVariant.id);
    expect(keptAfter?.stock).toBe(77);

    // biến thể bị bỏ khỏi input (dropVariant) đã bị xoá
    const dropped = await testPrisma.variant.findUnique({ where: { id: dropVariant.id } });
    expect(dropped).toBeNull();
  });
});
