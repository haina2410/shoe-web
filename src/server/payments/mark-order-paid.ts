import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import {
  BankTransactionStatus,
  OrderStatus,
  PaymentDirection,
} from "@/generated/prisma/enums";
import { enqueuePaymentConfirmed } from "@/jobs/queue";

export type PaymentBusinessErrorCode =
  | "ORDER_NOT_FOUND"
  | "AMOUNT_MISMATCH"
  | "ORDER_NOT_PENDING"
  | "INSUFFICIENT_STOCK";

export class PaymentBusinessError extends Error {
  constructor(public readonly code: PaymentBusinessErrorCode) {
    super(code);
    this.name = "PaymentBusinessError";
  }
}

export class BankEventClaimError extends Error {
  constructor() {
    super("Bank event is no longer claimable.");
    this.name = "BankEventClaimError";
  }
}

export type BankTransactionClaim = {
  id: string;
  expectedStatus: BankTransactionStatus;
};

export type MarkOrderPaidInput = {
  orderId: string;
  provider: "sepay" | "manual";
  transactionId: string;
  amount: number;
  bankTransaction?: BankTransactionClaim;
  recordedByUserId?: string | null;
};

export type MarkOrderPaidResult =
  | { kind: "paid"; orderCode: string }
  | { kind: "duplicate"; orderCode: string };

export type MarkOrderPaidDeps = {
  enqueuePaymentConfirmed: (
    tx: Prisma.TransactionClient,
    payload: { orderCode: string },
  ) => Promise<void>;
};

async function findDuplicatePayment(
  db: PrismaClient | Prisma.TransactionClient,
  transactionId: string,
): Promise<MarkOrderPaidResult | null> {
  const duplicate = await db.payment.findUnique({
    where: { transactionId },
    select: { order: { select: { orderCode: true } } },
  });
  return duplicate
    ? { kind: "duplicate", orderCode: duplicate.order.orderCode }
    : null;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function aggregateStockRequirements(
  items: ReadonlyArray<{ variantId: string; quantity: number }>,
): Array<{ variantId: string; quantity: number }> {
  const quantityByVariant = new Map<string, number>();
  for (const item of items) {
    quantityByVariant.set(
      item.variantId,
      (quantityByVariant.get(item.variantId) ?? 0) + item.quantity,
    );
  }

  return [...quantityByVariant]
    .map(([variantId, quantity]) => ({ variantId, quantity }))
    .sort((left, right) =>
      left.variantId < right.variantId
        ? -1
        : left.variantId > right.variantId
          ? 1
          : 0,
    );
}

export async function markOrderPaidCore(
  db: PrismaClient,
  input: MarkOrderPaidInput,
  deps: MarkOrderPaidDeps = { enqueuePaymentConfirmed },
): Promise<MarkOrderPaidResult> {
  try {
    return await db.$transaction(async (tx) => {
      const duplicate = await findDuplicatePayment(tx, input.transactionId);
      if (duplicate) return duplicate;

      const order = await tx.order.findUnique({
        where: { id: input.orderId },
        include: { items: true },
      });
      if (!order) throw new PaymentBusinessError("ORDER_NOT_FOUND");
      if (!Number.isInteger(input.amount) || input.amount !== order.total) {
        throw new PaymentBusinessError("AMOUNT_MISMATCH");
      }

      const now = new Date();
      if (input.bankTransaction) {
        const bankEventClaim = await tx.bankTransaction.updateMany({
          where: {
            id: input.bankTransaction.id,
            providerTransactionId: input.transactionId,
            status: input.bankTransaction.expectedStatus,
          },
          data: { updatedAt: now },
        });
        if (bankEventClaim.count !== 1) {
          throw new BankEventClaimError();
        }
      }

      const claimed = await tx.order.updateMany({
        where: { id: order.id, status: OrderStatus.PENDING_PAYMENT },
        data: { status: OrderStatus.PAID, paidAt: now },
      });
      if (claimed.count !== 1) {
        throw new PaymentBusinessError("ORDER_NOT_PENDING");
      }

      for (const item of aggregateStockRequirements(order.items)) {
        const decremented = await tx.variant.updateMany({
          where: { id: item.variantId, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } },
        });
        if (decremented.count !== 1) {
          throw new PaymentBusinessError("INSUFFICIENT_STOCK");
        }
      }

      await tx.payment.create({
        data: {
          orderId: order.id,
          provider: input.provider,
          transactionId: input.transactionId,
          amount: input.amount,
          direction: PaymentDirection.IN,
          recordedByUserId: input.recordedByUserId,
        },
      });

      if (input.bankTransaction) {
        await tx.bankTransaction.update({
          where: { id: input.bankTransaction.id },
          data: {
            status: BankTransactionStatus.MATCHED,
            orderId: order.id,
            processedAt: now,
            reviewReason: null,
          },
        });
      }

      await deps.enqueuePaymentConfirmed(tx, { orderCode: order.orderCode });

      return { kind: "paid", orderCode: order.orderCode };
    });
  } catch (error: unknown) {
    const lostOrderClaim =
      error instanceof PaymentBusinessError && error.code === "ORDER_NOT_PENDING";
    if (lostOrderClaim || isUniqueConstraintError(error)) {
      const duplicate = await findDuplicatePayment(db, input.transactionId);
      if (duplicate) return duplicate;
    }
    throw error;
  }
}

export async function markOrderPaidManuallyCore(
  db: PrismaClient,
  orderId: string,
  recordedByUserId: string,
  deps: MarkOrderPaidDeps = { enqueuePaymentConfirmed },
): Promise<MarkOrderPaidResult> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { total: true },
  });
  if (!order) throw new PaymentBusinessError("ORDER_NOT_FOUND");

  return markOrderPaidCore(
    db,
    {
      orderId,
      provider: "manual",
      transactionId: `manual:${orderId}`,
      amount: order.total,
      recordedByUserId,
    },
    deps,
  );
}
