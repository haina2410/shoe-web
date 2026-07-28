"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getBoss } from "@/jobs/queue";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import {
  matchReviewedTransactionCore,
  MatchReviewedTransactionError,
  type MatchReviewedTransactionErrorCode,
} from "@/server/payments/match-reviewed-transaction";

export type MatchReviewedTransactionActionResult =
  | { ok: true }
  | { ok: false; error: string };

const bankTransactionIdSchema = z.string().trim().cuid();
const orderCodeSchema = z.string().regex(/^LEAF[A-Z0-9]{6}$/);

const businessErrorMessage: Record<
  MatchReviewedTransactionErrorCode,
  string
> = {
  EVENT_NOT_FOUND: "Không tìm thấy giao dịch ngân hàng.",
  EVENT_NOT_REVIEWABLE: "Giao dịch ngân hàng không còn chờ đối soát.",
  ORDER_NOT_FOUND: "Không tìm thấy đơn hàng.",
  AMOUNT_MISMATCH: "Số tiền giao dịch không khớp với đơn hàng.",
  ORDER_NOT_PENDING: "Đơn hàng không còn ở trạng thái chờ thanh toán.",
  INSUFFICIENT_STOCK: "Không đủ tồn kho để xác nhận thanh toán.",
};

const genericError =
  "Không thể ghép giao dịch lúc này. Vui lòng thử lại.";

export async function matchReviewedTransactionAction(input: {
  bankTransactionId: string;
  orderCode: string;
}): Promise<MatchReviewedTransactionActionResult> {
  const session = await requireAdmin();

  const parsedBankTransactionId = bankTransactionIdSchema.safeParse(
    input.bankTransactionId,
  );
  if (!parsedBankTransactionId.success) {
    return {
      ok: false,
      error: "Mã giao dịch ngân hàng không hợp lệ.",
    };
  }

  const normalizedOrderCode = input.orderCode.trim().toUpperCase();
  const parsedOrderCode = orderCodeSchema.safeParse(normalizedOrderCode);
  if (!parsedOrderCode.success) {
    return { ok: false, error: "Mã đơn hàng không hợp lệ." };
  }

  let result: Awaited<ReturnType<typeof matchReviewedTransactionCore>>;
  try {
    await getBoss();
    result = await matchReviewedTransactionCore(prisma, {
      bankTransactionId: parsedBankTransactionId.data,
      orderCode: parsedOrderCode.data,
      recordedByUserId: session.user.id,
    });
  } catch (error: unknown) {
    if (error instanceof MatchReviewedTransactionError) {
      return { ok: false, error: businessErrorMessage[error.code] };
    }

    console.error(
      "[payments] operation=match-reviewed-transaction category=infrastructure",
    );
    return { ok: false, error: genericError };
  }

  const paths = [
    "/admin/bank-transactions/review",
    "/admin/orders",
    `/admin/orders/${result.orderId}`,
    `/orders/${result.orderCode}`,
  ];
  for (const path of paths) {
    try {
      revalidatePath(path);
    } catch {
      console.error(
        "[payments] operation=match-reviewed-transaction-revalidate category=infrastructure",
      );
    }
  }

  return { ok: true };
}
