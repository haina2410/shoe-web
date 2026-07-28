"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getBoss } from "@/jobs/queue";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import {
  markOrderPaidManuallyCore,
  PaymentBusinessError,
  type PaymentBusinessErrorCode,
} from "@/server/payments/mark-order-paid";

export type ConfirmPaymentManuallyResult =
  | { ok: true }
  | { ok: false; error: string };

const orderIdSchema = z.string().trim().cuid();

const businessErrorMessage: Record<PaymentBusinessErrorCode, string> = {
  ORDER_NOT_FOUND: "Không tìm thấy đơn hàng.",
  ORDER_NOT_PENDING: "Đơn hàng không còn ở trạng thái chờ thanh toán.",
  INSUFFICIENT_STOCK: "Không đủ tồn kho để xác nhận thanh toán.",
  AMOUNT_MISMATCH: "Số tiền thanh toán không khớp với đơn hàng.",
};

const genericError =
  "Không thể xác nhận thanh toán lúc này. Vui lòng thử lại.";

/**
 * Xác nhận thủ công chỉ nhận mã định danh đơn hàng. Core tự đọc tổng tiền và
 * trạng thái từ DB; amount/status từ client không bao giờ đi vào transaction.
 */
export async function confirmPaymentManuallyAction(
  orderId: string,
): Promise<ConfirmPaymentManuallyResult> {
  const session = await requireAdmin();

  const parsed = orderIdSchema.safeParse(orderId);
  if (!parsed.success) {
    return { ok: false, error: "Mã đơn hàng không hợp lệ." };
  }

  let result: Awaited<ReturnType<typeof markOrderPaidManuallyCore>>;
  try {
    // Kết nối queue phải sẵn sàng trước khi core mở payment transaction, vì
    // job xác nhận email được ghi atomically trong chính transaction đó.
    await getBoss();
    result = await markOrderPaidManuallyCore(
      prisma,
      parsed.data,
      session.user.id,
    );
  } catch (error: unknown) {
    if (error instanceof PaymentBusinessError) {
      return { ok: false, error: businessErrorMessage[error.code] };
    }

    console.error(
      "[payments] operation=confirm-manual-payment category=infrastructure",
    );
    return { ok: false, error: genericError };
  }

  const paths = [
    "/admin/orders",
    `/admin/orders/${parsed.data}`,
    `/orders/${result.orderCode}`,
  ];
  for (const path of paths) {
    try {
      revalidatePath(path);
    } catch {
      console.error(
        "[payments] operation=confirm-manual-payment-revalidate category=infrastructure",
      );
    }
  }

  return { ok: true };
}
