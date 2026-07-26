import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
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
