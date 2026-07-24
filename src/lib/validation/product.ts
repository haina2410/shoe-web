import { z } from "zod";

/** Các trạng thái hợp lệ của sản phẩm (khớp enum `ProductStatus` trong Prisma schema). */
export const productStatusValues = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;

/**
 * Schema input cho một biến thể (variant) sản phẩm — dùng khi tạo/sửa qua Server Action.
 * `priceOverride` cho phép `null` (dùng giá `basePrice` của sản phẩm) hoặc số nguyên ≥ 0.
 */
export const variantInputSchema = z.object({
  size: z.string().min(1),
  color: z.string().min(1),
  sku: z.string().trim().min(1),
  priceOverride: z.number().int().min(0).nullable().optional(),
  stock: z.number().int().min(0),
});

export type VariantInput = z.infer<typeof variantInputSchema>;

/** Schema input cho sản phẩm (không kèm variants) — dùng riêng khi chỉ sửa thông tin sản phẩm. */
export const productInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  categoryId: z.string().min(1),
  basePrice: z.number().int().min(0),
  status: z.enum(productStatusValues).default("DRAFT"),
});

export type ProductInput = z.infer<typeof productInputSchema>;

/**
 * Schema input cho một ảnh sản phẩm — `url` là đường dẫn trả về từ
 * `POST /api/admin/upload` (xem `src/lib/upload.ts`), `position` xác định thứ
 * tự hiển thị (0 = ảnh đầu tiên/ảnh đại diện).
 */
export const productImageInputSchema = z.object({
  url: z.string().min(1),
  position: z.number().int().min(0),
});

export type ProductImageInput = z.infer<typeof productImageInputSchema>;

/** Schema tạo sản phẩm mới kèm ít nhất 1 biến thể (+ ảnh, tuỳ chọn). */
export const createProductInputSchema = z.object({
  product: productInputSchema,
  variants: z.array(variantInputSchema).min(1),
  images: z.array(productImageInputSchema).optional().default([]),
});

export type CreateProductInput = z.infer<typeof createProductInputSchema>;

/** Schema cập nhật tồn kho của một biến thể. */
export const updateVariantStockSchema = z.object({
  variantId: z.string().min(1),
  stock: z.number().int().min(0),
});

export type UpdateVariantStockInput = z.infer<typeof updateVariantStockSchema>;

/**
 * Schema biến thể dùng khi CẬP NHẬT sản phẩm — giống `variantInputSchema` nhưng
 * thêm `id` optional: có `id` → biến thể đã tồn tại (khớp bản ghi hiện có);
 * không có `id` → biến thể mới. Dùng làm input cho chiến lược đồng bộ biến thể
 * trong `updateProductCore` (xem `src/server/products.ts`).
 */
export const variantSyncInputSchema = variantInputSchema.extend({
  id: z.string().min(1).optional(),
});

export type VariantSyncInput = z.infer<typeof variantSyncInputSchema>;

/** Schema cập nhật sản phẩm kèm danh sách biến thể (đồng bộ theo `variantSyncInputSchema`). */
export const updateProductInputSchema = z.object({
  product: productInputSchema,
  variants: z.array(variantSyncInputSchema).min(1),
  images: z.array(productImageInputSchema).optional().default([]),
});

export type UpdateProductInput = z.infer<typeof updateProductInputSchema>;
