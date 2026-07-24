import { z } from "zod";
import { PROVINCES } from "@/lib/provinces";

/** Schema 1 dòng item khi đặt hàng: biến thể + số lượng (≥ 1). */
export const checkoutItemSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().min(1),
});

export type CheckoutItem = z.infer<typeof checkoutItemSchema>;

/**
 * Schema input tạo đơn hàng (checkout) — dùng cho Server Action tạo `Order`.
 * `province` bắt buộc thuộc danh sách 34 tỉnh/thành (`PROVINCES`, xem
 * `src/lib/provinces.ts`). `note` tuỳ chọn.
 */
export const createOrderInputSchema = z.object({
  customerName: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z.string().trim().min(1),
  province: z.enum(PROVINCES),
  ward: z.string().trim().min(1),
  addressLine: z.string().trim().min(1),
  note: z.string().trim().optional(),
  items: z.array(checkoutItemSchema).min(1),
});

export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;
