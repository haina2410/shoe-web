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

export const productImageSetInputSchema = z.object({
  color: z.string().min(1),
  position: z.number().int().min(0),
  isDefault: z.boolean(),
  images: z.array(productImageInputSchema).min(1),
});

export type ProductImageSetInput = z.infer<typeof productImageSetInputSchema>;

function validateImageSets(
  input: {
    variants: Array<{ color: string }>;
    imageSets: ProductImageSetInput[];
  },
  ctx: z.RefinementCtx,
) {
  const variantColors = new Set(input.variants.map((variant) => variant.color));
  const imageSetColors = new Set<string>();

  input.imageSets.forEach((imageSet, index) => {
    if (!variantColors.has(imageSet.color)) {
      ctx.addIssue({
        code: "custom",
        path: ["imageSets", index, "color"],
        message: "Màu bộ ảnh phải thuộc một biến thể sản phẩm",
      });
    }
    if (imageSetColors.has(imageSet.color)) {
      ctx.addIssue({
        code: "custom",
        path: ["imageSets", index, "color"],
        message: "Mỗi màu chỉ được có một bộ ảnh",
      });
    }
    imageSetColors.add(imageSet.color);
  });

  if (
    input.imageSets.length > 0 &&
    input.imageSets.filter((imageSet) => imageSet.isDefault).length !== 1
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["imageSets"],
      message: "Sản phẩm có bộ ảnh phải có đúng một bộ mặc định",
    });
  }
}

/** Schema tạo sản phẩm mới kèm ít nhất 1 biến thể (+ ảnh, tuỳ chọn). */
export const createProductInputSchema = z
  .object({
    product: productInputSchema,
    variants: z.array(variantInputSchema).min(1),
    imageSets: z.array(productImageSetInputSchema).optional().default([]),
  })
  .superRefine(validateImageSets);

export type CreateProductInput = z.infer<typeof createProductInputSchema>;

/** Schema cập nhật tồn kho của một biến thể. */
export const updateVariantStockSchema = z.object({
  variantId: z.string().min(1),
  stock: z.number().int().min(0),
  expectedStock: z.number().int().min(0),
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
  expectedStock: z.number().int().min(0).optional(),
}).superRefine((variant, ctx) => {
  if (variant.id !== undefined && variant.expectedStock === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["expectedStock"],
      message: "Existing variants require expectedStock",
    });
  }
});

export type VariantSyncInput = z.infer<typeof variantSyncInputSchema>;

/** Schema cập nhật sản phẩm kèm danh sách biến thể (đồng bộ theo `variantSyncInputSchema`). */
export const updateProductInputSchema = z
  .object({
    product: productInputSchema,
    variants: z.array(variantSyncInputSchema).min(1),
    imageSets: z.array(productImageSetInputSchema).optional().default([]),
  })
  .superRefine(validateImageSets);

export type UpdateProductInput = z.infer<typeof updateProductInputSchema>;
