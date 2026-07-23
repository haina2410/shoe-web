import type { PrismaClient, Product, Variant } from "@/generated/prisma/client";
import { slugify, uniqueSlug } from "@/lib/slug";
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
        description: input.product.description,
        categoryId: input.product.categoryId,
        basePrice: input.product.basePrice,
        status: input.product.status,
        slug,
        variants: {
          create: input.variants.map((v) => variantWriteData(v)),
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
      await tx.variant.deleteMany({ where: { id: { in: idsToDelete } } });
    }

    for (const v of input.variants) {
      const data = variantWriteData(v);
      if (v.id !== undefined && existingIds.has(v.id)) {
        await tx.variant.update({ where: { id: v.id }, data });
      } else {
        await tx.variant.create({ data: { ...data, productId: id } });
      }
    }

    return tx.product.update({
      where: { id },
      data: {
        name: input.product.name,
        description: input.product.description,
        categoryId: input.product.categoryId,
        basePrice: input.product.basePrice,
        status: input.product.status,
      },
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
): Promise<Variant> {
  return db.variant.update({ where: { id: variantId }, data: { stock } });
}
