"use server";

import { prisma } from "@/lib/prisma";
import { createOrderInputSchema, type CreateOrderInput } from "@/lib/validation/checkout";
import { createOrderCore, OrderBusinessError } from "@/server/orders";
import { getBoss } from "@/jobs/queue";

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

const GENERIC_ERROR = "Không thể tạo đơn hàng, vui lòng thử lại.";

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

  // F3 (final review Ngày 6): "làm nóng" singleton pg-boss TRƯỚC KHI mở
  // transaction tạo đơn. Nếu để `enqueueOrderConfirmation` tự gọi `getBoss()`
  // (lười) TRONG `db.$transaction` của `createOrderCore`, lần checkout ĐẦU
  // TIÊN sau khi tiến trình khởi động (cold start) phải mở pool + có thể
  // tạo/migrate cả schema `pgboss` — tất cả trong ngân sách interactive
  // transaction mặc định của Prisma (`maxWait 2000ms / timeout 5000ms`), dễ
  // timeout. Gọi ở đây, NGOÀI transaction, để chi phí cold start không tính
  // vào ngân sách đó. `createOrderCore` cố tình GIỮ THUẦN (không tự import
  // `getBoss`/đọc env) nên việc "làm nóng" thuộc về lớp mỏng này.
  try {
    await getBoss();
  } catch (err) {
    console.error(
      "[checkout] getBoss() thất bại (không làm nóng được hàng đợi job trước khi tạo đơn):",
      err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    );
    return { ok: false, error: GENERIC_ERROR };
  }

  try {
    const order = await createOrderCore(prisma, parsed.data);
    return { ok: true, orderCode: order.orderCode };
  } catch (err) {
    // CHỈ trả nguyên văn thông báo cho lỗi NGHIỆP VỤ (`OrderBusinessError`,
    // ví dụ hết hàng) — mọi lỗi khác (DB mất kết nối, pg-boss enqueue lỗi...)
    // đều là lỗi hạ tầng, che bằng câu chung để không rò rỉ chi tiết nội bộ
    // ra client.
    if (err instanceof OrderBusinessError) {
      return { ok: false, error: err.message };
    }

    // F9 (final review Ngày 6): lỗi HẠ TẦNG trước đây bị nuốt hoàn toàn,
    // khiến một lần enqueue/DB lỗi vô hình với vận hành. Log CHỈ tên + thông
    // điệp lỗi — KHÔNG log `err` thô (có thể mang theo dữ liệu khác) và
    // TUYỆT ĐỐI không log `input`/`parsed.data` (chứa PII: email, số điện
    // thoại, địa chỉ khách).
    console.error(
      "[checkout] createOrderCore thất bại (lỗi hạ tầng, không phải nghiệp vụ):",
      err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    );
    return { ok: false, error: GENERIC_ERROR };
  }
}
