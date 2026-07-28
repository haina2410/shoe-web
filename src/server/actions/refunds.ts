"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-guard";
import type { PaymentLedgerSummary } from "@/lib/payment-ledger";
import { prisma } from "@/lib/prisma";
import { refundInputSchema } from "@/lib/validation/refund";
import {
  RecordRefundError,
  recordRefundCore,
  type RecordRefundErrorCode,
} from "@/server/payments/record-refund";

export type RecordRefundActionResult =
  | { ok: true; summary: PaymentLedgerSummary }
  | { ok: false; error: string };

const businessErrorMessage: Record<RecordRefundErrorCode, string> = {
  ORDER_NOT_FOUND: "Không tìm thấy đơn hàng.",
  ORDER_NOT_REFUNDABLE:
    "Đơn hàng không thể hoàn tiền ở trạng thái hiện tại.",
  NO_INCOMING_PAYMENT: "Đơn hàng chưa có khoản thanh toán để hoàn tiền.",
  REFUND_EXCEEDS_RECEIVED: "Số tiền hoàn vượt quá số tiền đã nhận.",
};

const validationError = "Thông tin hoàn tiền không hợp lệ.";
const genericError =
  "Không thể ghi nhận hoàn tiền lúc này. Vui lòng thử lại.";

export async function recordRefundAction(input: {
  orderId: string;
  amount: number;
  externalReference?: string;
  note?: string;
}): Promise<RecordRefundActionResult> {
  const session = await requireAdmin();

  const parsed = refundInputSchema.safeParse({
    ...input,
    amount: Number(input.amount),
  });
  if (!parsed.success) {
    return { ok: false, error: validationError };
  }

  let result: Awaited<ReturnType<typeof recordRefundCore>>;
  try {
    result = await recordRefundCore(prisma, {
      ...parsed.data,
      recordedByUserId: session.user.id,
    });
  } catch (error: unknown) {
    if (error instanceof RecordRefundError) {
      return { ok: false, error: businessErrorMessage[error.code] };
    }

    console.error("[payments] operation=record-refund category=infrastructure");
    return { ok: false, error: genericError };
  }

  const paths = [
    "/admin/orders",
    `/admin/orders/${parsed.data.orderId}`,
    `/orders/${result.orderCode}`,
  ];
  for (const path of paths) {
    try {
      revalidatePath(path);
    } catch {
      console.error(
        "[payments] operation=record-refund-revalidate category=infrastructure",
      );
    }
  }

  return { ok: true, summary: result.summary };
}
