import { PaymentDirection, type PaymentDirection as PaymentDirectionValue } from "@/generated/prisma/enums";

export type RefundState = "NONE" | "PARTIAL" | "FULL";

export type PaymentLedgerSummary = {
  totalIn: number;
  totalOut: number;
  netReceived: number;
  refundState: RefundState;
};

export function summarizePaymentLedger(
  payments: ReadonlyArray<{
    direction: PaymentDirectionValue;
    amount: number;
  }>,
): PaymentLedgerSummary {
  let totalIn = 0;
  let totalOut = 0;

  for (const payment of payments) {
    if (!Number.isSafeInteger(payment.amount) || payment.amount <= 0) {
      throw new Error("Payment amounts must be positive integers");
    }

    if (payment.direction === PaymentDirection.IN) {
      totalIn += payment.amount;
    } else {
      totalOut += payment.amount;
    }
  }

  const netReceived = totalIn - totalOut;
  if (netReceived < 0) {
    throw new Error("Payment refunds cannot exceed received payments");
  }

  return {
    totalIn,
    totalOut,
    netReceived,
    refundState:
      totalOut === 0 ? "NONE" : netReceived === 0 ? "FULL" : "PARTIAL",
  };
}
