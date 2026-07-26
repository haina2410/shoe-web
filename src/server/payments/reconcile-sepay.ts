import {
  Prisma,
  type BankTransaction,
  type PrismaClient,
} from "@/generated/prisma/client";
import {
  BankTransactionStatus,
  OrderStatus,
} from "@/generated/prisma/enums";
import {
  occurredAtFromSePay,
  orderCodeFromSePay,
  type SePayWebhookPayload,
} from "@/lib/sepay";
import { enqueuePaymentConfirmed } from "@/jobs/queue";
import {
  BankEventClaimError,
  markOrderPaidCore,
  PaymentBusinessError,
  type MarkOrderPaidDeps,
} from "@/server/payments/mark-order-paid";

export type ReviewReason =
  | "MISSING_ORDER_CODE"
  | "ORDER_NOT_FOUND"
  | "AMOUNT_MISMATCH"
  | "ORDER_NOT_PENDING"
  | "INSUFFICIENT_STOCK";

export type ReconcileResult =
  | { kind: "matched" }
  | { kind: "duplicate" }
  | { kind: "review-required"; reason: ReviewReason };

export type ReconcileSePayDeps = MarkOrderPaidDeps;

function isUniqueConstraintError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function persistSePayEventCore(
  db: PrismaClient,
  payload: SePayWebhookPayload,
  rawPayload: Prisma.InputJsonValue = payload as Prisma.InputJsonObject,
): Promise<BankTransaction> {
  const providerTransactionId = String(payload.id);
  const paymentCode = orderCodeFromSePay(payload);

  try {
    return await db.bankTransaction.create({
      data: {
        provider: "sepay",
        providerTransactionId,
        gateway: payload.gateway,
        accountNumber: payload.accountNumber,
        transferType: payload.transferType,
        amount: payload.transferAmount,
        paymentCode,
        content: payload.content,
        referenceCode: payload.referenceCode,
        occurredAt: occurredAtFromSePay(payload.transactionDate),
        rawPayload,
      },
    });
  } catch (error: unknown) {
    if (!isUniqueConstraintError(error)) throw error;

    return db.bankTransaction.findUniqueOrThrow({
      where: { providerTransactionId },
    });
  }
}

async function markReviewRequired(
  db: PrismaClient,
  eventId: string,
  reason: ReviewReason,
): Promise<ReconcileResult> {
  const updated = await db.bankTransaction.updateMany({
    where: {
      id: eventId,
      status: BankTransactionStatus.RECEIVED,
    },
    data: {
      status: BankTransactionStatus.REVIEW_REQUIRED,
      reviewReason: reason,
    },
  });

  if (updated.count === 1) {
    return { kind: "review-required", reason };
  }

  const current = await db.bankTransaction.findUniqueOrThrow({
    where: { id: eventId },
    select: { status: true },
  });
  if (current.status !== BankTransactionStatus.RECEIVED) {
    return { kind: "duplicate" };
  }

  throw new Error("Không thể cập nhật trạng thái giao dịch ngân hàng.");
}

export async function reconcilePersistedSePayEventCore(
  db: PrismaClient,
  eventId: string,
  deps: ReconcileSePayDeps = { enqueuePaymentConfirmed },
): Promise<ReconcileResult> {
  const event = await db.bankTransaction.findUniqueOrThrow({
    where: { id: eventId },
  });

  if (event.status !== BankTransactionStatus.RECEIVED) {
    return { kind: "duplicate" };
  }

  const orderCode = event.paymentCode;
  if (!orderCode) {
    return markReviewRequired(db, event.id, "MISSING_ORDER_CODE");
  }

  const order = await db.order.findUnique({
    where: { orderCode },
    select: { id: true, total: true, status: true },
  });
  if (!order) {
    return markReviewRequired(db, event.id, "ORDER_NOT_FOUND");
  }
  if (order.total !== event.amount) {
    return markReviewRequired(db, event.id, "AMOUNT_MISMATCH");
  }
  if (order.status !== OrderStatus.PENDING_PAYMENT) {
    return markReviewRequired(db, event.id, "ORDER_NOT_PENDING");
  }

  try {
    const payment = await markOrderPaidCore(
      db,
      {
        orderId: order.id,
        provider: "sepay",
        transactionId: event.providerTransactionId,
        amount: event.amount,
        bankTransactionId: event.id,
      },
      deps,
    );

    return payment.kind === "paid"
      ? { kind: "matched" }
      : { kind: "duplicate" };
  } catch (error: unknown) {
    if (
      !(error instanceof PaymentBusinessError) &&
      !(error instanceof BankEventClaimError)
    ) {
      throw error;
    }

    const current = await db.bankTransaction.findUniqueOrThrow({
      where: { id: event.id },
      select: { status: true },
    });
    if (current.status !== BankTransactionStatus.RECEIVED) {
      return { kind: "duplicate" };
    }

    if (error instanceof BankEventClaimError) {
      throw error;
    }

    return markReviewRequired(db, event.id, error.code);
  }
}

export async function reconcileSePayCore(
  db: PrismaClient,
  payload: SePayWebhookPayload,
  deps: ReconcileSePayDeps = { enqueuePaymentConfirmed },
  rawPayload: Prisma.InputJsonValue = payload as Prisma.InputJsonObject,
): Promise<ReconcileResult> {
  const event = await persistSePayEventCore(db, payload, rawPayload);
  return reconcilePersistedSePayEventCore(db, event.id, deps);
}
