import { describe, it, expect, beforeEach } from "vitest";
import { testPrisma, resetDb } from "@/test/db";
import { normalizeText } from "@/lib/normalize";
import {
  listProducts,
  getProductBySlug,
  getFacets,
  listCategories,
} from "@/server/queries/catalog";

/**
 * `src/server/queries/catalog.integration.test.ts` — integration test cho lớp
 * query catalog thuần (`src/server/queries/catalog.ts`), test bằng
 * `testPrisma` (Postgres thật, xem `src/test/db.ts`).
 *
 * QUAN TRỌNG: fixture tạo trực tiếp qua `testPrisma.product.create` KHÔNG tự
 * điền `nameNormalized` (đó là logic của `createProductCore`, không phải
 * default DB) — nên mọi fixture ở đây tự set `nameNormalized: normalizeText(name)`
 * để test search không bị vacuous.
 */

async function makeCategory(name: string, slug: string) {
  return testPrisma.category.create({ data: { name, slug } });
}

async function makeProduct(opts: {
  name: string;
  categoryId: string;
  basePrice: number;
  status?: "ACTIVE" | "DRAFT" | "ARCHIVED";
  images?: { url: string; position: number }[];
  variants?: { size: string; color: string; sku: string; stock: number; priceOverride?: number | null }[];
}) {
  return testPrisma.product.create({
    data: {
      name: opts.name,
      nameNormalized: normalizeText(opts.name),
      categoryId: opts.categoryId,
      basePrice: opts.basePrice,
      status: opts.status ?? "ACTIVE",
      slug: normalizeText(opts.name).replace(/\s+/g, "-") + "-" + Math.random().toString(36).slice(2, 8),
      images: opts.images ? { create: opts.images } : undefined,
      variants: opts.variants ? { create: opts.variants } : undefined,
    },
    include: { images: true, variants: true },
  });
}

describe("listProducts", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("không lọc → chỉ trả sản phẩm ACTIVE, DRAFT bị loại", async () => {
    const cat = await makeCategory("Giày Sneaker", "giay-sneaker");
    const active = await makeProduct({ name: "Giày Chạy Bộ Alpha", categoryId: cat.id, basePrice: 300000 });
    await makeProduct({ name: "Giày Nháp Beta", categoryId: cat.id, basePrice: 200000, status: "DRAFT" });
    await makeProduct({ name: "Giày Cũ Gamma", categoryId: cat.id, basePrice: 200000, status: "ARCHIVED" });

    const result = await listProducts(testPrisma, {});

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(active.id);
  });

  it("trả đúng shape: imageUrl = ảnh position thấp nhất, totalStock = tổng stock variants", async () => {
    const cat = await makeCategory("Giày Sneaker", "giay-sneaker");
    const product = await makeProduct({
      name: "Giày Chạy Bộ Alpha",
      categoryId: cat.id,
      basePrice: 300000,
      images: [
        { url: "/img/second.jpg", position: 1 },
        { url: "/img/first.jpg", position: 0 },
      ],
      variants: [
        { size: "40", color: "Đen", sku: "SKU-1", stock: 3 },
        { size: "41", color: "Trắng", sku: "SKU-2", stock: 7 },
      ],
    });

    const result = await listProducts(testPrisma, {});

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: product.id,
      slug: product.slug,
      name: product.name,
      basePrice: 300000,
      imageUrl: "/img/first.jpg",
      totalStock: 10,
    });
  });

  it("imageUrl = null khi sản phẩm không có ảnh", async () => {
    const cat = await makeCategory("Giày Sneaker", "giay-sneaker");
    await makeProduct({ name: "Giày Trơn", categoryId: cat.id, basePrice: 300000 });

    const result = await listProducts(testPrisma, {});

    expect(result[0].imageUrl).toBeNull();
  });

  it("lọc theo categorySlug", async () => {
    const cat1 = await makeCategory("Giày Sneaker", "giay-sneaker");
    const cat2 = await makeCategory("Giày Sandal", "giay-sandal");
    const p1 = await makeProduct({ name: "Sneaker A", categoryId: cat1.id, basePrice: 300000 });
    await makeProduct({ name: "Sandal B", categoryId: cat2.id, basePrice: 300000 });

    const result = await listProducts(testPrisma, { categorySlug: "giay-sneaker" });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(p1.id);
  });

  it("lọc size/color: OR trong-facet, AND giữa-facet", async () => {
    const cat = await makeCategory("Giày Sneaker", "giay-sneaker");
    // p1: có size 40 Đen VÀ size 41 Trắng -> variant riêng biệt cho mỗi size/color
    const p1 = await makeProduct({
      name: "Sản phẩm Match",
      categoryId: cat.id,
      basePrice: 300000,
      variants: [
        { size: "40", color: "Đen", sku: "M-1", stock: 1 },
        { size: "41", color: "Trắng", sku: "M-2", stock: 1 },
      ],
    });
    // p2: chỉ có size 40 nhưng màu Xanh (không khớp color filter)
    await makeProduct({
      name: "Sản phẩm Size Only",
      categoryId: cat.id,
      basePrice: 300000,
      variants: [{ size: "40", color: "Xanh", sku: "M-3", stock: 1 }],
    });
    // p3: chỉ có màu Đen nhưng size 42 (không khớp size filter)
    await makeProduct({
      name: "Sản phẩm Color Only",
      categoryId: cat.id,
      basePrice: 300000,
      variants: [{ size: "42", color: "Đen", sku: "M-4", stock: 1 }],
    });

    // filter: size trong [40, 41] AND color trong [Đen, Trắng]
    const result = await listProducts(testPrisma, {
      sizes: ["40", "41"],
      colors: ["Đen", "Trắng"],
    });

    expect(result.map((r) => r.id)).toEqual([p1.id]);
  });

  it("lọc price: 1 bucket", async () => {
    const cat = await makeCategory("Giày Sneaker", "giay-sneaker");
    const cheap = await makeProduct({ name: "Rẻ", categoryId: cat.id, basePrice: 100000 });
    await makeProduct({ name: "Đắt", categoryId: cat.id, basePrice: 2000000 });

    const result = await listProducts(testPrisma, { priceKeys: ["duoi-500k"] });

    expect(result.map((r) => r.id)).toEqual([cheap.id]);
  });

  it("lọc price: nhiều bucket (OR)", async () => {
    const cat = await makeCategory("Giày Sneaker", "giay-sneaker");
    const cheap = await makeProduct({ name: "Rẻ", categoryId: cat.id, basePrice: 100000 });
    const mid = await makeProduct({ name: "Vừa", categoryId: cat.id, basePrice: 700000 });
    await makeProduct({ name: "Đắt", categoryId: cat.id, basePrice: 2000000 });

    const result = await listProducts(testPrisma, { priceKeys: ["duoi-500k", "500k-1tr"] });

    expect(new Set(result.map((r) => r.id))).toEqual(new Set([cheap.id, mid.id]));
  });

  it("price bucket không trần (tren-1r5) bao gồm giá rất cao", async () => {
    const cat = await makeCategory("Giày Sneaker", "giay-sneaker");
    const expensive = await makeProduct({ name: "Siêu Đắt", categoryId: cat.id, basePrice: 50_000_000 });
    await makeProduct({ name: "Rẻ", categoryId: cat.id, basePrice: 100000 });

    const result = await listProducts(testPrisma, { priceKeys: ["tren-1r5"] });

    expect(result.map((r) => r.id)).toEqual([expensive.id]);
  });

  it("search không dấu: q khớp bất kể dấu/hoa-thường", async () => {
    const cat = await makeCategory("Giày Sneaker", "giay-sneaker");
    const target = await makeProduct({ name: "Giày Chạy Bộ Marathon", categoryId: cat.id, basePrice: 300000 });
    await makeProduct({ name: "Giày Sandal Nữ", categoryId: cat.id, basePrice: 300000 });

    for (const q of ["chay bo", "CHẠY BỘ", "Chạy"]) {
      const result = await listProducts(testPrisma, { q });
      expect(result.map((r) => r.id), `q=${q}`).toEqual([target.id]);
    }
  });

  it("search không khớp → rỗng", async () => {
    const cat = await makeCategory("Giày Sneaker", "giay-sneaker");
    await makeProduct({ name: "Giày Chạy Bộ Marathon", categoryId: cat.id, basePrice: 300000 });

    const result = await listProducts(testPrisma, { q: "khong ton tai" });

    expect(result).toEqual([]);
  });

  it("sort moi-nhat (mặc định): createdAt desc", async () => {
    const cat = await makeCategory("Giày Sneaker", "giay-sneaker");
    const p1 = await makeProduct({ name: "Đầu tiên", categoryId: cat.id, basePrice: 100000 });
    const p2 = await makeProduct({ name: "Thứ hai", categoryId: cat.id, basePrice: 100000 });
    const p3 = await makeProduct({ name: "Thứ ba", categoryId: cat.id, basePrice: 100000 });

    const result = await listProducts(testPrisma, {});

    expect(result.map((r) => r.id)).toEqual([p3.id, p2.id, p1.id]);
  });

  it("sort gia-tang: basePrice asc", async () => {
    const cat = await makeCategory("Giày Sneaker", "giay-sneaker");
    const mid = await makeProduct({ name: "Vừa", categoryId: cat.id, basePrice: 500000 });
    const cheap = await makeProduct({ name: "Rẻ", categoryId: cat.id, basePrice: 100000 });
    const expensive = await makeProduct({ name: "Đắt", categoryId: cat.id, basePrice: 900000 });

    const result = await listProducts(testPrisma, { sort: "gia-tang" });

    expect(result.map((r) => r.id)).toEqual([cheap.id, mid.id, expensive.id]);
  });

  it("sort gia-giam: basePrice desc", async () => {
    const cat = await makeCategory("Giày Sneaker", "giay-sneaker");
    const mid = await makeProduct({ name: "Vừa", categoryId: cat.id, basePrice: 500000 });
    const cheap = await makeProduct({ name: "Rẻ", categoryId: cat.id, basePrice: 100000 });
    const expensive = await makeProduct({ name: "Đắt", categoryId: cat.id, basePrice: 900000 });

    const result = await listProducts(testPrisma, { sort: "gia-giam" });

    expect(result.map((r) => r.id)).toEqual([expensive.id, mid.id, cheap.id]);
  });
});

describe("getProductBySlug", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("ACTIVE → trả đủ variants + images đã sort theo position + category", async () => {
    const cat = await makeCategory("Giày Sneaker", "giay-sneaker");
    const product = await makeProduct({
      name: "Giày Chi Tiết",
      categoryId: cat.id,
      basePrice: 300000,
      images: [
        { url: "/img/b.jpg", position: 1 },
        { url: "/img/a.jpg", position: 0 },
      ],
      variants: [
        { size: "40", color: "Đen", sku: "D-1", stock: 5 },
        { size: "41", color: "Trắng", sku: "D-2", stock: 2 },
      ],
    });

    const result = await getProductBySlug(testPrisma, product.slug);

    expect(result).not.toBeNull();
    expect(result?.id).toBe(product.id);
    expect(result?.images.map((i) => i.url)).toEqual(["/img/a.jpg", "/img/b.jpg"]);
    expect(result?.variants).toHaveLength(2);
    expect(result?.category.slug).toBe("giay-sneaker");
  });

  it("DRAFT → null", async () => {
    const cat = await makeCategory("Giày Sneaker", "giay-sneaker");
    const product = await makeProduct({
      name: "Giày Nháp",
      categoryId: cat.id,
      basePrice: 300000,
      status: "DRAFT",
    });

    const result = await getProductBySlug(testPrisma, product.slug);

    expect(result).toBeNull();
  });

  it("slug lạ → null", async () => {
    const result = await getProductBySlug(testPrisma, "khong-ton-tai");
    expect(result).toBeNull();
  });
});

describe("getFacets", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("chỉ trả size/color từ variant của sản phẩm ACTIVE", async () => {
    const cat = await makeCategory("Giày Sneaker", "giay-sneaker");
    await makeProduct({
      name: "Active Product",
      categoryId: cat.id,
      basePrice: 300000,
      variants: [
        { size: "40", color: "Đen", sku: "F-1", stock: 1 },
        { size: "41", color: "Trắng", sku: "F-2", stock: 1 },
      ],
    });
    await makeProduct({
      name: "Draft Product",
      categoryId: cat.id,
      basePrice: 300000,
      status: "DRAFT",
      variants: [{ size: "99", color: "MauLa", sku: "F-3", stock: 1 }],
    });

    const facets = await getFacets(testPrisma);

    expect(facets.sizes).toEqual(["40", "41"]);
    expect(facets.colors).toEqual(["Trắng", "Đen"].sort());
    expect(facets.sizes).not.toContain("99");
    expect(facets.colors).not.toContain("MauLa");
  });
});

describe("listCategories", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("trả danh mục với id/name/slug", async () => {
    await makeCategory("Giày Sneaker", "giay-sneaker");
    await makeCategory("Giày Sandal", "giay-sandal");

    const cats = await listCategories(testPrisma);

    expect(cats).toHaveLength(2);
    expect(cats.map((c) => c.slug).sort()).toEqual(["giay-sandal", "giay-sneaker"]);
  });
});
