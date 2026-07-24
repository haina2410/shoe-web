import type { PrismaClient, Prisma } from "@/generated/prisma/client";
import { ProductStatus } from "@/generated/prisma/enums";
import { normalizeText } from "@/lib/normalize";
import { PRICE_RANGES, type CatalogQuery } from "@/lib/catalog-filters";

/**
 * `src/server/queries/catalog.ts` — lớp query THUẦN cho toàn bộ trang catalog
 * storefront (danh sách + lọc + search + sort + chi tiết sản phẩm + facets).
 *
 * Giống `src/server/products.ts`: nhận `db: PrismaClient` từ nơi gọi, KHÔNG tự
 * import `next/*`, để integration-test trực tiếp bằng `testPrisma`. Storefront
 * chỉ được thấy sản phẩm `ACTIVE` — mọi hàm ở đây enforce điều đó.
 */

/** Item trả về cho danh sách sản phẩm (trang catalog + kết quả search). */
export type CatalogListItem = {
  id: string;
  slug: string;
  name: string;
  basePrice: number;
  imageUrl: string | null;
  totalStock: number;
};

/** Chi tiết sản phẩm cho trang detail (Task 4) — ACTIVE only. */
export type CatalogProductDetail = Prisma.ProductGetPayload<{
  include: {
    images: true;
    variants: true;
    category: true;
  };
}>;

/**
 * Build mệnh đề `where` cho `Product` từ `CatalogQuery`.
 *
 * Ngữ nghĩa (khớp brief Ngày 4 Task 2):
 * - category: theo `category.slug`.
 * - size / color: OR trong-facet (`some` với `in`), AND giữa hai facet — dùng
 *   HAI điều kiện `variants: { some: {...} }` riêng biệt (không yêu cầu cùng 1
 *   variant khớp cả size lẫn color).
 * - price: `basePrice` rơi vào MỘT TRONG các khoảng đã chọn (OR các range).
 * - q: `nameNormalized contains normalizeText(q)`; bỏ qua nếu rỗng/toàn khoảng trắng.
 * - Tất cả các nhóm trên kết hợp AND với nhau, cộng thêm `status: ACTIVE` luôn áp dụng.
 */
function buildWhere(query: CatalogQuery): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [];

  if (query.categorySlug) {
    and.push({ category: { slug: query.categorySlug } });
  }

  if (query.sizes && query.sizes.length > 0) {
    and.push({ variants: { some: { size: { in: query.sizes } } } });
  }

  if (query.colors && query.colors.length > 0) {
    and.push({ variants: { some: { color: { in: query.colors } } } });
  }

  if (query.priceKeys && query.priceKeys.length > 0) {
    const ranges = PRICE_RANGES.filter((r) => query.priceKeys!.includes(r.key));
    if (ranges.length > 0) {
      and.push({
        OR: ranges.map((r) =>
          r.max === null
            ? { basePrice: { gte: r.min } }
            : { basePrice: { gte: r.min, lt: r.max } },
        ),
      });
    }
  }

  const q = query.q?.trim();
  if (q) {
    and.push({ nameNormalized: { contains: normalizeText(q) } });
  }

  return {
    status: ProductStatus.ACTIVE,
    ...(and.length > 0 ? { AND: and } : {}),
  };
}

function orderByFor(sort: CatalogQuery["sort"]): Prisma.ProductOrderByWithRelationInput {
  switch (sort) {
    case "gia-tang":
      return { basePrice: "asc" };
    case "gia-giam":
      return { basePrice: "desc" };
    case "moi-nhat":
    default:
      return { createdAt: "desc" };
  }
}

/**
 * Danh sách sản phẩm ACTIVE đã áp lọc + sort, dạng rút gọn cho grid catalog.
 * `imageUrl` = url ảnh có `position` thấp nhất (hoặc `null` nếu không có ảnh).
 * `totalStock` = tổng `stock` của tất cả variants.
 */
export async function listProducts(
  db: PrismaClient,
  query: CatalogQuery,
): Promise<CatalogListItem[]> {
  const products = await db.product.findMany({
    where: buildWhere(query),
    orderBy: orderByFor(query.sort),
    include: {
      images: { orderBy: { position: "asc" }, take: 1 },
      variants: { select: { stock: true } },
    },
  });

  return products.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    basePrice: p.basePrice,
    imageUrl: p.images[0]?.url ?? null,
    totalStock: p.variants.reduce((sum, v) => sum + v.stock, 0),
  }));
}

/**
 * Chi tiết một sản phẩm ACTIVE theo slug, kèm images (sort theo position),
 * variants (đủ) và category. Trả `null` nếu không tồn tại HOẶC không ACTIVE.
 */
export async function getProductBySlug(
  db: PrismaClient,
  slug: string,
): Promise<CatalogProductDetail | null> {
  const product = await db.product.findUnique({
    where: { slug },
    include: {
      images: { orderBy: { position: "asc" } },
      variants: true,
      category: true,
    },
  });

  if (!product || product.status !== ProductStatus.ACTIVE) return null;
  return product;
}

/** Distinct size & color, sort tăng dần, chỉ lấy từ variant của sản phẩm ACTIVE. */
export async function getFacets(
  db: PrismaClient,
): Promise<{ sizes: string[]; colors: string[] }> {
  const variants = await db.variant.findMany({
    where: { product: { status: ProductStatus.ACTIVE } },
    select: { size: true, color: true },
  });

  const sizes = [...new Set(variants.map((v) => v.size))].sort();
  const colors = [...new Set(variants.map((v) => v.color))].sort();

  return { sizes, colors };
}

/** Danh mục cho nav + bộ lọc. */
export async function listCategories(
  db: PrismaClient,
): Promise<{ id: string; name: string; slug: string }[]> {
  return db.category.findMany({
    select: { id: true, name: true, slug: true },
  });
}
