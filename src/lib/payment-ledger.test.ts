import { describe, expect, it } from "vitest";
import { PaymentDirection } from "@/generated/prisma/enums";
import { summarizePaymentLedger } from "./payment-ledger";

describe("summarizePaymentLedger", () => {
  it.each([
    [[], { totalIn: 0, totalOut: 0, netReceived: 0, refundState: "NONE" }],
    [
      [{ direction: PaymentDirection.IN, amount: 500_000 }],
      {
        totalIn: 500_000,
        totalOut: 0,
        netReceived: 500_000,
        refundState: "NONE",
      },
    ],
    [
      [
        { direction: PaymentDirection.IN, amount: 500_000 },
        { direction: PaymentDirection.OUT, amount: 100_000 },
        { direction: PaymentDirection.OUT, amount: 50_000 },
      ],
      {
        totalIn: 500_000,
        totalOut: 150_000,
        netReceived: 350_000,
        refundState: "PARTIAL",
      },
    ],
    [
      [
        { direction: PaymentDirection.IN, amount: 500_000 },
        { direction: PaymentDirection.OUT, amount: 500_000 },
      ],
      {
        totalIn: 500_000,
        totalOut: 500_000,
        netReceived: 0,
        refundState: "FULL",
      },
    ],
  ])("summarizes literal IN/OUT rows", (payments, expected) => {
    expect(summarizePaymentLedger(payments)).toEqual(expected);
  });

  it.each([0, -1, 10.5])("rejects a non-positive or non-integer amount: %s", (amount) => {
    expect(() =>
      summarizePaymentLedger([{ direction: PaymentDirection.IN, amount }]),
    ).toThrow();
  });

  it("rejects ledgers whose OUT total exceeds their IN total", () => {
    expect(() =>
      summarizePaymentLedger([
        { direction: PaymentDirection.IN, amount: 100_000 },
        { direction: PaymentDirection.OUT, amount: 100_001 },
      ]),
    ).toThrow();
  });
});
