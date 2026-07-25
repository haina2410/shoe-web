import { describe, it, expect, beforeEach } from "vitest";
import { testPrisma, resetDb } from "@/test/db";
import {
  createProductCore,
  updateProductCore,
  deleteProductCore,
  updateVariantStockCore,
} from "@/server/products";
import { normalizeText } from "@/lib/normalize";
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
    images: [],
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
    expect(persisted?.nameNormalized).toBe(normalizeText(input.product.name));
  });

  it("tạo sản phẩm kèm 2 ảnh → persist đúng url/position theo thứ tự", async () => {
    const category = await makeCategory();
    const input: CreateProductInput = {
      ...baseCreateInput({}, category.id),
      images: [
        { url: "/api/uploads/products/a.jpg", position: 0 },
        { url: "/api/uploads/products/b.jpg", position: 1 },
      ],
    };

    const product = await createProductCore(testPrisma, input);

    const images = await testPrisma.productImage.findMany({
      where: { productId: product.id },
      orderBy: { position: "asc" },
    });
    expect(images).toHaveLength(2);
    expect(images[0]).toMatchObject({ url: "/api/uploads/products/a.jpg", position: 0 });
    expect(images[1]).toMatchObject({ url: "/api/uploads/products/b.jpg", position: 1 });
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
      images: [],
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
      images: [],
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
      images: [],
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
      images: [],
    };

    const updated = await updateProductCore(testPrisma, product.id, update);

    expect(updated.name).toBe("Giày Sục Nữ Bản Mới");
    expect(updated.nameNormalized).toBe(normalizeText("Giày Sục Nữ Bản Mới"));
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

  it("không xoá phân loại đã phát sinh đơn hàng và rollback toàn bộ cập nhật sản phẩm", async () => {
    const category = await makeCategory();
    const product = await createProductCore(
      testPrisma,
      baseCreateInput({}, category.id),
    );
    const [keepVariant, orderedVariant] = product.variants;
    await testPrisma.order.create({
      data: {
        orderCode: "LEAF-FK0001",
        email: "buyer@example.com",
        customerName: "Khách thử nghiệm",
        phone: "0900000000",
        province: "Hà Nội",
        ward: "Phường Hoàn Kiếm",
        addressLine: "1 Tràng Tiền",
        subtotal: orderedVariant.priceOverride ?? product.basePrice,
        shippingFee: 0,
        total: orderedVariant.priceOverride ?? product.basePrice,
        items: {
          create: {
            variantId: orderedVariant.id,
            productName: product.name,
            size: orderedVariant.size,
            color: orderedVariant.color,
            unitPrice: orderedVariant.priceOverride ?? product.basePrice,
            quantity: 1,
          },
        },
      },
    });

    const update: UpdateProductInput = {
      product: {
        name: "Tên không được persist",
        description: "Mô tả không được persist",
        categoryId: category.id,
        basePrice: 999_000,
        status: "ARCHIVED",
      },
      variants: [
        {
          id: keepVariant.id,
          size: keepVariant.size,
          color: keepVariant.color,
          sku: keepVariant.sku,
          priceOverride: keepVariant.priceOverride,
          stock: 123,
        },
      ],
      images: [{ url: "/api/uploads/products/not-persisted.jpg", position: 0 }],
    };

    await expect(
      updateProductCore(testPrisma, product.id, update),
    ).rejects.toThrow(
      "Không thể xoá phân loại đã phát sinh đơn hàng. Hãy đặt tồn kho về 0.",
    );

    const persisted = await testPrisma.product.findUniqueOrThrow({
      where: { id: product.id },
      include: {
        variants: { orderBy: { sku: "asc" } },
        images: true,
      },
    });
    expect(persisted).toMatchObject({
      name: product.name,
      description: product.description,
      basePrice: product.basePrice,
      status: product.status,
    });
    expect(persisted.variants).toHaveLength(2);
    expect(
      persisted.variants.find((variant) => variant.id === keepVariant.id)
        ?.stock,
    ).toBe(keepVariant.stock);
    expect(
      persisted.variants.some((variant) => variant.id === orderedVariant.id),
    ).toBe(true);
    expect(persisted.images).toHaveLength(0);
  });

  it("cập nhật ảnh → thay thế toàn bộ danh sách ảnh cũ bằng danh sách mới", async () => {
    const category = await makeCategory();
    const product = await createProductCore(testPrisma, {
      ...baseCreateInput({}, category.id),
      images: [{ url: "/api/uploads/products/old.jpg", position: 0 }],
    });

    const update: UpdateProductInput = {
      product: {
        name: product.name,
        description: product.description ?? undefined,
        categoryId: category.id,
        basePrice: product.basePrice,
        status: "ACTIVE",
      },
      variants: product.variants.map((v) => ({
        id: v.id,
        size: v.size,
        color: v.color,
        sku: v.sku,
        priceOverride: v.priceOverride,
        stock: v.stock,
      })),
      images: [
        { url: "/api/uploads/products/new-1.jpg", position: 0 },
        { url: "/api/uploads/products/new-2.jpg", position: 1 },
      ],
    };

    await updateProductCore(testPrisma, product.id, update);

    const images = await testPrisma.productImage.findMany({
      where: { productId: product.id },
      orderBy: { position: "asc" },
    });
    expect(images).toHaveLength(2);
    expect(images.map((i) => i.url)).toEqual([
      "/api/uploads/products/new-1.jpg",
      "/api/uploads/products/new-2.jpg",
    ]);
  });
});
