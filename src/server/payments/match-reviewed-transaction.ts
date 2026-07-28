import type { PrismaClient } from "@/generated/prisma/client";
import { BankTransactionStatus } from "@/generated/prisma/enums";
import {
  BankEventClaimError,
  markOrderPaidCore,
  PaymentBusinessError,
  type MarkOrderPaidDeps,
} from "@/server/payments/mark-order-paid";

export type MatchReviewedTransactionErrorCode =
  | "EVENT_NOT_FOUND"
  | "EVENT_NOT_REVIEWABLE"
  | "ORDER_NOT_FOUND"
  | "AMOUNT_MISMATCH"
  | "ORDER_NOT_PENDING"
  | "INSUFFICIENT_STOCK";

export class MatchReviewedTransactionError extends Error {
  constructor(public readonly code: MatchReviewedTransactionErrorCode) {
    super(code);
    this.name = "MatchReviewedTransactionError";
  }
}

type MatchReviewedTransactionResult = {
  orderId: string;
  orderCode: string;
};

async function findSafeMatchedResult(
  db: PrismaClient,
  bankTransactionId: string,
  requestedOrderCode: string,
): Promise<MatchReviewedTransactionResult | null> {
  const event = await db.bankTransaction.findUnique({
    where: { id: bankTransactionId },
    select: {
      status: true,
      order: { select: { id: true, orderCode: true } },
    },
  });

  if (
    event?.status !== BankTransactionStatus.MATCHED ||
    event.order?.orderCode !== requestedOrderCode
  ) {
    return null;
  }

  return {
    orderId: event.order.id,
    orderCode: event.order.orderCode,
  };
}

export async function matchReviewedTransactionCore(
  db: PrismaClient,
  input: {
    bankTransactionId: string;
    orderCode: string;
    recordedByUserId: string;
  },
  deps?: MarkOrderPaidDeps,
): Promise<MatchReviewedTransactionResult> {
  const orderCode = input.orderCode.trim().toUpperCase();
  const event = await db.bankTransaction.findUnique({
    where: { id: input.bankTransactionId },
    select: {
      id: true,
      provider: true,
      providerTransactionId: true,
      amount: true,
      status: true,
      order: { select: { id: true, orderCode: true } },
    },
  });

  if (!event) {
    throw new MatchReviewedTransactionError("EVENT_NOT_FOUND");
  }

  if (event.status === BankTransactionStatus.MATCHED) {
    if (event.order?.orderCode === orderCode) {
      return {
        orderId: event.order.id,
        orderCode: event.order.orderCode,
      };
    }
    throw new MatchReviewedTransactionError("EVENT_NOT_REVIEWABLE");
  }

  if (
    event.status !== BankTransactionStatus.REVIEW_REQUIRED ||
    event.provider !== "sepay"
  ) {
    throw new MatchReviewedTransactionError("EVENT_NOT_REVIEWABLE");
  }

  const order = await db.order.findUnique({
    where: { orderCode },
    select: { id: true },
  });
  if (!order) {
    throw new MatchReviewedTransactionError("ORDER_NOT_FOUND");
  }

  try {
    const result = await markOrderPaidCore(
      db,
      {
        orderId: order.id,
        provider: "sepay",
        transactionId: event.providerTransactionId,
        amount: event.amount,
        recordedByUserId: input.recordedByUserId,
        bankTransaction: {
          id: event.id,
          expectedStatus: BankTransactionStatus.REVIEW_REQUIRED,
        },
      },
      deps,
    );

    if (result.kind === "duplicate") {
      const matched = await findSafeMatchedResult(
        db,
        event.id,
        orderCode,
      );
      if (!matched) {
        throw new MatchReviewedTransactionError("EVENT_NOT_REVIEWABLE");
      }
      return matched;
    }

    return { orderId: order.id, orderCode: result.orderCode };
  } catch (error: unknown) {
    if (error instanceof PaymentBusinessError) {
      throw new MatchReviewedTransactionError(error.code);
    }

    if (error instanceof BankEventClaimError) {
      const matched = await findSafeMatchedResult(
        db,
        event.id,
        orderCode,
      );
      if (matched) return matched;
      throw new MatchReviewedTransactionError("EVENT_NOT_REVIEWABLE");
    }

    throw error;
  }
}
