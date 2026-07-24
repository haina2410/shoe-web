"use server";

import { prisma } from "@/lib/prisma";
import { createOrderInputSchema, type CreateOrderInput } from "@/lib/validation/checkout";
import { createOrderCore } from "@/server/orders";

/**
 * `src/server/actions/checkout.ts` — Server Action (`"use server"`), lớp
 * MỎNG bọc ngoài `src/server/orders.ts` (hàm core thuần).
 *
 * KHÁC với các action admin (`src/server/actions/products.ts`): đây là
 * checkout GUEST/công khai — KHÔNG `requireAdmin()`, KHÔNG `can()` (không có
 * khái niệm chủ sở hữu/role ở bước đặt hàng), và KHÔNG `redirect()` — client
 * tự điều hướng sau khi nhận `orderCode` thành công (để có thể tự xoá giỏ
 * hàng ở localStorage trước khi chuyển trang).
 *
 * Theo `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`:
 * Server Action là entry point POST không tin cậy, nên input LUÔN được
 * `safeParse` bằng zod ở đây, kể cả khi TypeScript đã gõ kiểu ở caller.
 *
 * KHÔNG bao giờ log input hay bất kỳ field nào của nó ra console — input
 * chứa PII của khách (email, số điện thoại, địa chỉ).
 */

export type CreateOrderResult =
  | { ok: true; orderCode: string }
  | { ok: false; error: string };

export async function createOrderAction(
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  const parsed = createOrderInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }

  try {
    const order = await createOrderCore(prisma, parsed.data);
    return { ok: true, orderCode: order.orderCode };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Không thể tạo đơn hàng.",
    };
  }
}
