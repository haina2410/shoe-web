import type { PrismaClient, Product, Variant } from "@/generated/prisma/client";
import { slugify, uniqueSlug } from "@/lib/slug";
import { normalizeText } from "@/lib/normalize";
import type {
  CreateProductInput,
  UpdateProductInput,
} from "@/lib/validation/product";

/**
 * `src/server/products.ts` — hàm core THUẦN cho nghiệp vụ sản phẩm.
 *
 * Cố ý KHÔNG import bất kỳ gì từ `next/*` và KHÔNG tự gọi `requireAdmin`/`can`:
 * mọi hàm ở đây nhận `db: PrismaClient` + input ĐÃ được validate (zod) từ nơi
 * gọi. Nhờ vậy có thể integration-test trực tiếp bằng `testPrisma`, không cần
 * dựng HTTP/Server Action. Việc auth + authz + validate input là trách nhiệm
 * của lớp mỏng `src/server/actions/products.ts`.
 */

export type ProductWithVariants = Product & { variants: Variant[] };

export const VARIANT_IN_USE_ERROR =
  "Không thể xoá phân loại đã phát sinh đơn hàng. Hãy đặt tồn kho về 0.";
export const STALE_STOCK_ERROR =
  "Tồn kho đã thay đổi. Hãy tải lại trang và thử lại.";

export class ProductBusinessError extends Error {
  constructor(public readonly code: "VARIANT_IN_USE" | "STALE_STOCK") {
    super(code === "STALE_STOCK" ? STALE_STOCK_ERROR : VARIANT_IN_USE_ERROR);
    this.name = "ProductBusinessError";
  }
}

function isForeignKeyConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2003"
  );
}

/** Map một variant input (create hoặc update) sang phần data ghi DB (không gồm id/productId). */
function variantWriteData(v: {
  size: string;
  color: string;
  sku: string;
  priceOverride?: number | null;
  stock: number;
}) {
  return {
    size: v.size,
    color: v.color,
    sku: v.sku,
    priceOverride: v.priceOverride ?? null,
    stock: v.stock,
  };
}

/**
 * Tạo sản phẩm mới kèm các biến thể.
 * - Slug sinh từ `name` qua `slugify` + `uniqueSlug` (đụng slug đã tồn tại → thêm hậu tố `-2`, `-3`…).
 * - Product + variants được tạo trong 1 `db.$transaction`: nếu bất kỳ variant nào
 *   vi phạm ràng buộc (vd SKU trùng — unique) thì toàn bộ rollback, không để lại
 *   product/variant mồ côi.
 */
export async function createProductCore(
  db: PrismaClient,
  input: CreateProductInput,
): Promise<ProductWithVariants> {
  const slug = await uniqueSlug(slugify(input.product.name), async (candidate) => {
    const existing = await db.product.findUnique({ where: { slug: candidate } });
    return existing !== null;
  });

  return db.$transaction(async (tx) => {
    return tx.product.create({
      data: {
        name: input.product.name,
        nameNormalized: normalizeText(input.product.name),
        description: input.product.description,
        categoryId: input.product.categoryId,
        basePrice: input.product.basePrice,
        status: input.product.status,
        slug,
        variants: {
          create: input.variants.map((v) => variantWriteData(v)),
        },
        images: {
          create: input.images.map((img) => ({ url: img.url, position: img.position })),
        },
      },
      include: { variants: true },
    });
  });
}

/**
 * Cập nhật sản phẩm + đồng bộ danh sách biến thể.
 *
 * **Chiến lược đồng bộ biến thể (đơn giản, cố ý — xem `variantSyncInputSchema`):**
 * - Biến thể trong input có `id` KHỚP một bản ghi hiện có của sản phẩm → UPDATE tại chỗ (giữ nguyên `id`).
 * - Biến thể trong input KHÔNG có `id`, hoặc có `id` không khớp bản ghi hiện có → CREATE mới.
 * - Bản ghi hiện có mà `id` của nó KHÔNG xuất hiện (hợp lệ) trong input → DELETE.
 *
 * Toàn bộ chạy trong 1 `db.$transaction` cùng với update các field của Product,
 * nên nếu một thao tác variant nào đó ném lỗi (vd SKU trùng), mọi thay đổi —
 * kể cả các variant đã delete/update/create trước đó trong cùng lượt gọi — đều rollback.
 */
export async function updateProductCore(
  db: PrismaClient,
  id: string,
  input: UpdateProductInput,
): Promise<ProductWithVariants> {
  return db.$transaction(async (tx) => {
    await tx.product.update({
      where: { id },
      data: {
        name: input.product.name,
        nameNormalized: normalizeText(input.product.name),
        description: input.product.description,
        categoryId: input.product.categoryId,
        basePrice: input.product.basePrice,
        status: input.product.status,
      },
    });

    const existing = await tx.variant.findMany({
      where: { productId: id },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((v) => v.id));

    const matchedIds = new Set(
      input.variants
        .filter((v) => v.id !== undefined && existingIds.has(v.id))
        .map((v) => v.id as string),
    );

    const idsToDelete = [...existingIds].filter((eid) => !matchedIds.has(eid));
    if (idsToDelete.length > 0) {
      try {
        await tx.variant.deleteMany({ where: { id: { in: idsToDelete } } });
      } catch (error: unknown) {
        // Chỉ đổi P2003 phát sinh ngay tại thao tác xoá stale variants thành
        // lỗi nghiệp vụ. Mọi lỗi Prisma khác tiếp tục nổi lên để không che lỗi
        // hạ tầng/lập trình không liên quan.
        if (isForeignKeyConstraintError(error)) {
          throw new ProductBusinessError("VARIANT_IN_USE");
        }
        throw error;
      }
    }

    for (const v of input.variants) {
      const data = variantWriteData(v);
      if (v.id !== undefined && existingIds.has(v.id)) {
        const updated = await tx.variant.updateMany({
          where: {
            id: v.id,
            productId: id,
            stock: v.expectedStock,
          },
          data,
        });
        if (updated.count !== 1) {
          throw new ProductBusinessError("STALE_STOCK");
        }
      } else {
        await tx.variant.create({ data: { ...data, productId: id } });
      }
    }

    // Ảnh sản phẩm: KHÔNG có khoá tự nhiên riêng để so khớp id như variant
    // (client không quản lý id ảnh), nên dùng chiến lược đơn giản — xoá hết
    // rồi tạo lại từ input — giống hệt cách `prisma/seed.ts` đồng bộ ảnh.
    // Đơn giản, cố ý; nếu cần giữ id ảnh ổn định (vd để không phá cache CDN)
    // thì nâng cấp sau.
    await tx.productImage.deleteMany({ where: { productId: id } });
    if (input.images.length > 0) {
      await tx.productImage.createMany({
        data: input.images.map((img) => ({
          productId: id,
          url: img.url,
          position: img.position,
        })),
      });
    }

    return tx.product.findUniqueOrThrow({
      where: { id },
      include: { variants: true },
    });
  });
}

/**
 * Xoá sản phẩm (cascade xoá `ProductImage` + `Variant` theo FK `onDelete: Cascade`).
 * Nếu một variant của sản phẩm đang bị `OrderItem` tham chiếu (`onDelete: Restrict`),
 * Prisma ném lỗi ràng buộc khoá ngoại (P2003) — bọc lại thành lỗi rõ ràng thay vì
 * để lỗi Prisma thô rò ra ngoài core.
 */
export async function deleteProductCore(db: PrismaClient, id: string): Promise<void> {
  try {
    await db.product.delete({ where: { id } });
  } catch (err) {
    throw new Error(
      `Không thể xoá sản phẩm: có thể một biến thể của sản phẩm này đang được tham chiếu bởi đơn hàng (${
        err instanceof Error ? err.message : String(err)
      })`,
    );
  }
}

/** Cập nhật nhanh tồn kho của một biến thể. */
export async function updateVariantStockCore(
  db: PrismaClient,
  variantId: string,
  stock: number,
  expectedStock: number,
): Promise<Variant> {
  return db.$transaction(async (tx) => {
    const updated = await tx.variant.updateMany({
      where: { id: variantId, stock: expectedStock },
      data: { stock },
    });
    if (updated.count !== 1) {
      throw new ProductBusinessError("STALE_STOCK");
    }
    return tx.variant.findUniqueOrThrow({ where: { id: variantId } });
  });
}
