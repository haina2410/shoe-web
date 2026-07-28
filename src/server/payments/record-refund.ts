import type { PrismaClient } from "@/generated/prisma/client";
import {
  OrderStatus,
  PaymentDirection,
  type OrderStatus as OrderStatusValue,
} from "@/generated/prisma/enums";
import {
  summarizePaymentLedger,
  type PaymentLedgerSummary,
} from "@/lib/payment-ledger";

export type RecordRefundErrorCode =
  | "ORDER_NOT_FOUND"
  | "ORDER_NOT_REFUNDABLE"
  | "NO_INCOMING_PAYMENT"
  | "REFUND_EXCEEDS_RECEIVED";

export class RecordRefundError extends Error {
  constructor(public readonly code: RecordRefundErrorCode) {
    super(code);
    this.name = "RecordRefundError";
  }
}

const REFUNDABLE_STATUSES = new Set<OrderStatusValue>([
  OrderStatus.PAID,
  OrderStatus.FULFILLED,
  OrderStatus.COMPLETED,
]);

export async function recordRefundCore(
  db: PrismaClient,
  input: {
    orderId: string;
    amount: number;
    recordedByUserId: string;
    externalReference?: string;
    note?: string;
  },
): Promise<{
  orderCode: string;
  paymentId: string;
  summary: PaymentLedgerSummary;
}> {
  return db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "order" WHERE "id" = ${input.orderId} FOR UPDATE
    `;
    if (locked.length === 0) {
      throw new RecordRefundError("ORDER_NOT_FOUND");
    }

    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      select: { id: true, orderCode: true, status: true },
    });
    if (!order) {
      throw new RecordRefundError("ORDER_NOT_FOUND");
    }
    if (!REFUNDABLE_STATUSES.has(order.status)) {
      throw new RecordRefundError("ORDER_NOT_REFUNDABLE");
    }

    const payments = await tx.payment.findMany({
      where: { orderId: order.id },
      select: { direction: true, amount: true },
    });
    const currentSummary = summarizePaymentLedger(payments);
    if (currentSummary.totalIn === 0) {
      throw new RecordRefundError("NO_INCOMING_PAYMENT");
    }
    if (input.amount > currentSummary.netReceived) {
      throw new RecordRefundError("REFUND_EXCEEDS_RECEIVED");
    }

    const now = new Date();
    const refund = await tx.payment.create({
      data: {
        orderId: order.id,
        provider: "manual",
        transactionId: `manual-refund:${crypto.randomUUID()}`,
        amount: input.amount,
        direction: PaymentDirection.OUT,
        externalReference: input.externalReference || null,
        note: input.note || null,
        recordedByUserId: input.recordedByUserId,
        matchedAt: now,
      },
      select: { id: true },
    });
    await tx.order.update({
      where: { id: order.id },
      data: { lastRefundAt: now },
    });

    return {
      orderCode: order.orderCode,
      paymentId: refund.id,
      summary: summarizePaymentLedger([
        ...payments,
        { direction: PaymentDirection.OUT, amount: input.amount },
      ]),
    };
  });
}
