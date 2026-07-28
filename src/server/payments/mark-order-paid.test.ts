import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  BankTransactionStatus,
  PaymentDirection,
} from "@/generated/prisma/enums";
import { markOrderPaidCore } from "@/server/payments/mark-order-paid";

describe("markOrderPaidCore stock lock ordering", () => {
  it("aggregates duplicate variants and conditionally decrements in ascending variantId order", async () => {
    const variantUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = {
      payment: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "payment-1" }),
      },
      order: {
        findUnique: vi.fn().mockResolvedValue({
          id: "order-1",
          orderCode: "LEAFABC123",
          total: 500_000,
          items: [
            { variantId: "variant-z", quantity: 1 },
            { variantId: "variant-a", quantity: 2 },
            { variantId: "variant-z", quantity: 3 },
          ],
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      variant: {
        updateMany: variantUpdateMany,
      },
    };
    const db = {
      $transaction: vi.fn(
        async (
          callback: (tx: typeof transaction) => Promise<unknown>,
        ) => callback(transaction),
      ),
    } as unknown as PrismaClient;
    const enqueuePaymentConfirmed = vi.fn().mockResolvedValue(undefined);

    await markOrderPaidCore(
      db,
      {
        orderId: "order-1",
        provider: "sepay",
        transactionId: "provider-1",
        amount: 500_000,
      },
      { enqueuePaymentConfirmed },
    );

    expect(variantUpdateMany).toHaveBeenCalledTimes(2);
    expect(variantUpdateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "variant-a", stock: { gte: 2 } },
      data: { stock: { decrement: 2 } },
    });
    expect(variantUpdateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "variant-z", stock: { gte: 4 } },
      data: { stock: { decrement: 4 } },
    });
  });
});

describe("markOrderPaidCore bank-event settlement metadata", () => {
  it("claims a reviewed event at its supplied status and records the incoming actor-aware payment", async () => {
    const bankTransactionUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const bankTransactionUpdate = vi.fn().mockResolvedValue({ id: "event-1" });
    const paymentCreate = vi.fn().mockResolvedValue({ id: "payment-1" });
    const transaction = {
      payment: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: paymentCreate,
      },
      bankTransaction: {
        updateMany: bankTransactionUpdateMany,
        update: bankTransactionUpdate,
      },
      order: {
        findUnique: vi.fn().mockResolvedValue({
          id: "order-1",
          orderCode: "LEAFABC123",
          total: 500_000,
          items: [{ variantId: "variant-1", quantity: 1 }],
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      variant: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const db = {
      $transaction: vi.fn(
        async (
          callback: (tx: typeof transaction) => Promise<unknown>,
        ) => callback(transaction),
      ),
    } as unknown as PrismaClient;
    const enqueuePaymentConfirmed = vi.fn().mockResolvedValue(undefined);

    await markOrderPaidCore(
      db,
      {
        orderId: "order-1",
        provider: "manual",
        transactionId: "manual:order-1",
        amount: 500_000,
        bankTransaction: {
          id: "event-1",
          expectedStatus: BankTransactionStatus.REVIEW_REQUIRED,
        },
        recordedByUserId: "admin-1",
      },
      { enqueuePaymentConfirmed },
    );

    expect(bankTransactionUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "event-1",
        providerTransactionId: "manual:order-1",
        status: BankTransactionStatus.REVIEW_REQUIRED,
      },
      data: { updatedAt: expect.any(Date) },
    });
    expect(paymentCreate).toHaveBeenCalledWith({
      data: {
        orderId: "order-1",
        provider: "manual",
        transactionId: "manual:order-1",
        amount: 500_000,
        direction: PaymentDirection.IN,
        recordedByUserId: "admin-1",
      },
    });
    expect(bankTransactionUpdate).toHaveBeenCalledWith({
      where: { id: "event-1" },
      data: {
        status: BankTransactionStatus.MATCHED,
        orderId: "order-1",
        processedAt: expect.any(Date),
        reviewReason: null,
      },
    });
  });
});
