import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Prisma,
  PrismaClient,
} from "@/generated/prisma/client";
import {
  BankTransactionStatus,
  OrderStatus,
  PaymentDirection,
} from "@/generated/prisma/enums";
import {
  matchReviewedTransactionCore,
  MatchReviewedTransactionError,
} from "@/server/payments/match-reviewed-transaction";
import { resetDb, testPrisma } from "@/test/db";

async function createReviewedFixture() {
  const category = await testPrisma.category.create({
    data: {
      name: "Giày ghép thủ công",
      slug: `giay-ghep-thu-cong-${crypto.randomUUID()}`,
    },
  });
  const product = await testPrisma.product.create({
    data: {
      name: "Giày Review",
      nameNormalized: "giay review",
      slug: `giay-review-${crypto.randomUUID()}`,
      categoryId: category.id,
      basePrice: 300_000,
      variants: {
        create: {
          size: "40",
          color: "Đen",
          sku: `REVIEW-${crypto.randomUUID()}`,
          stock: 4,
        },
      },
    },
    include: { variants: true },
  });
  const variant = product.variants[0];
  const order = await testPrisma.order.create({
    data: {
      orderCode: `LEAF${crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase()}`,
      email: "reviewed-match@example.com",
      customerName: "Nguyễn Ghép Lệnh",
      phone: "0900000000",
      province: "Hà Nội",
      ward: "Phường Ba Đình",
      addressLine: "1 Đường Ghép Lệnh",
      subtotal: 600_000,
      shippingFee: 30_000,
      total: 630_000,
      items: {
        create: {
          variantId: variant.id,
          productName: product.name,
          size: variant.size,
          color: variant.color,
          unitPrice: 300_000,
          quantity: 2,
        },
      },
    },
  });
  const event = await testPrisma.bankTransaction.create({
    data: {
      provider: "sepay",
      providerTransactionId: `REVIEW-${crypto.randomUUID()}`,
      gateway: "MBBank",
      accountNumber: "0000000000",
      transferType: "in",
      amount: order.total,
      paymentCode: "LEAFZZZZZZ",
      content: "Nội dung không chứa mã đúng",
      occurredAt: new Date("2026-07-28T04:00:00.000Z"),
      rawPayload: { id: "reviewed-event" },
      status: BankTransactionStatus.REVIEW_REQUIRED,
      reviewReason: "ORDER_NOT_FOUND",
    },
  });
  const actor = await testPrisma.user.create({
    data: {
      id: `user-${crypto.randomUUID()}`,
      name: "Nhân viên đối soát",
      email: `reviewer-${crypto.randomUUID()}@example.com`,
      role: "staff",
    },
  });

  return { actor, event, order, variant };
}

async function expectUnsettled(input: {
  eventId: string;
  orderId: string;
  variantId: string;
  stock?: number;
  orderStatus?: OrderStatus;
}) {
  const [event, order, variant, paymentCount] = await Promise.all([
    testPrisma.bankTransaction.findUniqueOrThrow({
      where: { id: input.eventId },
    }),
    testPrisma.order.findUniqueOrThrow({ where: { id: input.orderId } }),
    testPrisma.variant.findUniqueOrThrow({ where: { id: input.variantId } }),
    testPrisma.payment.count({ where: { orderId: input.orderId } }),
  ]);

  expect(event).toMatchObject({
    status: BankTransactionStatus.REVIEW_REQUIRED,
    reviewReason: "ORDER_NOT_FOUND",
    orderId: null,
    processedAt: null,
  });
  expect(order).toMatchObject({
    status: input.orderStatus ?? OrderStatus.PENDING_PAYMENT,
    paidAt: null,
  });
  expect(variant.stock).toBe(input.stock ?? 4);
  expect(paymentCount).toBe(0);
}

describe("matchReviewedTransactionCore", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("normalizes the requested code and atomically settles the reviewed event through the shared payment path", async () => {
    const fixture = await createReviewedFixture();
    const enqueuePaymentConfirmed = vi.fn().mockResolvedValue(undefined);

    const result = await matchReviewedTransactionCore(
      testPrisma,
      {
        bankTransactionId: fixture.event.id,
        orderCode: `  ${fixture.order.orderCode.toLowerCase()}  `,
        recordedByUserId: fixture.actor.id,
      },
      { enqueuePaymentConfirmed },
    );

    const [event, order, variant, payments] = await Promise.all([
      testPrisma.bankTransaction.findUniqueOrThrow({
        where: { id: fixture.event.id },
      }),
      testPrisma.order.findUniqueOrThrow({ where: { id: fixture.order.id } }),
      testPrisma.variant.findUniqueOrThrow({ where: { id: fixture.variant.id } }),
      testPrisma.payment.findMany({ where: { orderId: fixture.order.id } }),
    ]);

    expect(result).toEqual({
      orderId: fixture.order.id,
      orderCode: fixture.order.orderCode,
    });
    expect(event).toMatchObject({
      status: BankTransactionStatus.MATCHED,
      reviewReason: null,
      orderId: fixture.order.id,
    });
    expect(event.processedAt).toBeInstanceOf(Date);
    expect(order.status).toBe(OrderStatus.PAID);
    expect(order.paidAt).toBeInstanceOf(Date);
    expect(variant.stock).toBe(2);
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      provider: "sepay",
      transactionId: fixture.event.providerTransactionId,
      amount: fixture.event.amount,
      direction: PaymentDirection.IN,
      recordedByUserId: fixture.actor.id,
    });
    expect(enqueuePaymentConfirmed).toHaveBeenCalledTimes(1);
    expect(enqueuePaymentConfirmed).toHaveBeenCalledWith(expect.anything(), {
      orderCode: fixture.order.orderCode,
    });
  });

  it("returns EVENT_NOT_FOUND for an unknown bank transaction", async () => {
    const fixture = await createReviewedFixture();

    await expect(
      matchReviewedTransactionCore(testPrisma, {
        bankTransactionId: "cm12345678901234567890123",
        orderCode: fixture.order.orderCode,
        recordedByUserId: fixture.actor.id,
      }),
    ).rejects.toEqual(
      new MatchReviewedTransactionError("EVENT_NOT_FOUND"),
    );
  });

  it("returns ORDER_NOT_FOUND without changing the reviewed event", async () => {
    const fixture = await createReviewedFixture();

    await expect(
      matchReviewedTransactionCore(testPrisma, {
        bankTransactionId: fixture.event.id,
        orderCode: "LEAFABC123",
        recordedByUserId: fixture.actor.id,
      }),
    ).rejects.toEqual(
      new MatchReviewedTransactionError("ORDER_NOT_FOUND"),
    );

    await expectUnsettled({
      eventId: fixture.event.id,
      orderId: fixture.order.id,
      variantId: fixture.variant.id,
    });
  });

  it("maps an amount mismatch and keeps every payment side effect rolled back", async () => {
    const fixture = await createReviewedFixture();
    await testPrisma.bankTransaction.update({
      where: { id: fixture.event.id },
      data: { amount: fixture.order.total + 1 },
    });
    const enqueuePaymentConfirmed = vi.fn().mockResolvedValue(undefined);

    await expect(
      matchReviewedTransactionCore(
        testPrisma,
        {
          bankTransactionId: fixture.event.id,
          orderCode: fixture.order.orderCode,
          recordedByUserId: fixture.actor.id,
        },
        { enqueuePaymentConfirmed },
      ),
    ).rejects.toEqual(
      new MatchReviewedTransactionError("AMOUNT_MISMATCH"),
    );

    await expectUnsettled({
      eventId: fixture.event.id,
      orderId: fixture.order.id,
      variantId: fixture.variant.id,
    });
    expect(enqueuePaymentConfirmed).not.toHaveBeenCalled();
  });

  it("maps a non-pending order and leaves the event available for review", async () => {
    const fixture = await createReviewedFixture();
    await testPrisma.order.update({
      where: { id: fixture.order.id },
      data: { status: OrderStatus.CANCELLED },
    });

    await expect(
      matchReviewedTransactionCore(testPrisma, {
        bankTransactionId: fixture.event.id,
        orderCode: fixture.order.orderCode,
        recordedByUserId: fixture.actor.id,
      }),
    ).rejects.toEqual(
      new MatchReviewedTransactionError("ORDER_NOT_PENDING"),
    );

    await expectUnsettled({
      eventId: fixture.event.id,
      orderId: fixture.order.id,
      variantId: fixture.variant.id,
      orderStatus: OrderStatus.CANCELLED,
    });
  });

  it("rolls back the event claim when stock is insufficient", async () => {
    const fixture = await createReviewedFixture();
    await testPrisma.variant.update({
      where: { id: fixture.variant.id },
      data: { stock: 1 },
    });
    const enqueuePaymentConfirmed = vi.fn().mockResolvedValue(undefined);

    await expect(
      matchReviewedTransactionCore(
        testPrisma,
        {
          bankTransactionId: fixture.event.id,
          orderCode: fixture.order.orderCode,
          recordedByUserId: fixture.actor.id,
        },
        { enqueuePaymentConfirmed },
      ),
    ).rejects.toEqual(
      new MatchReviewedTransactionError("INSUFFICIENT_STOCK"),
    );

    await expectUnsettled({
      eventId: fixture.event.id,
      orderId: fixture.order.id,
      variantId: fixture.variant.id,
      stock: 1,
    });
    expect(enqueuePaymentConfirmed).not.toHaveBeenCalled();
  });

  it("rolls back event, order, stock, and payment when queue enqueue fails", async () => {
    const fixture = await createReviewedFixture();
    const enqueuePaymentConfirmed = vi
      .fn()
      .mockRejectedValue(new Error("simulated queue outage"));

    await expect(
      matchReviewedTransactionCore(
        testPrisma,
        {
          bankTransactionId: fixture.event.id,
          orderCode: fixture.order.orderCode,
          recordedByUserId: fixture.actor.id,
        },
        { enqueuePaymentConfirmed },
      ),
    ).rejects.toThrow("simulated queue outage");

    await expectUnsettled({
      eventId: fixture.event.id,
      orderId: fixture.order.id,
      variantId: fixture.variant.id,
    });
    expect(enqueuePaymentConfirmed).toHaveBeenCalledTimes(1);
  });

  it("maps a lost reviewed-event claim and rolls back all payment work", async () => {
    const fixture = await createReviewedFixture();
    const controlledDb = new Proxy(testPrisma, {
      get(target, property, receiver) {
        if (property !== "$transaction") {
          const value = Reflect.get(target, property, receiver);
          return typeof value === "function" ? value.bind(target) : value;
        }

        return (
          callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
        ) =>
          target.$transaction((tx) => {
            const controlledTx = new Proxy(tx, {
              get(txTarget, txProperty, txReceiver) {
                if (txProperty !== "bankTransaction") {
                  const value = Reflect.get(txTarget, txProperty, txReceiver);
                  return typeof value === "function"
                    ? value.bind(txTarget)
                    : value;
                }

                return new Proxy(txTarget.bankTransaction, {
                  get(delegate, delegateProperty, delegateReceiver) {
                    if (delegateProperty === "updateMany") {
                      return vi.fn().mockResolvedValue({ count: 0 });
                    }
                    const value = Reflect.get(
                      delegate,
                      delegateProperty,
                      delegateReceiver,
                    );
                    return typeof value === "function"
                      ? value.bind(delegate)
                      : value;
                  },
                });
              },
            }) as Prisma.TransactionClient;
            return callback(controlledTx);
          });
      },
    }) as PrismaClient;
    const enqueuePaymentConfirmed = vi.fn().mockResolvedValue(undefined);

    await expect(
      matchReviewedTransactionCore(
        controlledDb,
        {
          bankTransactionId: fixture.event.id,
          orderCode: fixture.order.orderCode,
          recordedByUserId: fixture.actor.id,
        },
        { enqueuePaymentConfirmed },
      ),
    ).rejects.toEqual(
      new MatchReviewedTransactionError("EVENT_NOT_REVIEWABLE"),
    );

    await expectUnsettled({
      eventId: fixture.event.id,
      orderId: fixture.order.id,
      variantId: fixture.variant.id,
    });
    expect(enqueuePaymentConfirmed).not.toHaveBeenCalled();
  });

  it("repeated matching of the same linked order is safe and settles only once", async () => {
    const fixture = await createReviewedFixture();
    const enqueuePaymentConfirmed = vi.fn().mockResolvedValue(undefined);
    const input = {
      bankTransactionId: fixture.event.id,
      orderCode: fixture.order.orderCode,
      recordedByUserId: fixture.actor.id,
    };

    const first = await matchReviewedTransactionCore(
      testPrisma,
      input,
      { enqueuePaymentConfirmed },
    );
    const second = await matchReviewedTransactionCore(
      testPrisma,
      input,
      { enqueuePaymentConfirmed },
    );

    expect(first).toEqual({
      orderId: fixture.order.id,
      orderCode: fixture.order.orderCode,
    });
    expect(second).toEqual(first);
    expect(
      await testPrisma.payment.count({
        where: { transactionId: fixture.event.providerTransactionId },
      }),
    ).toBe(1);
    expect(
      await testPrisma.variant.findUniqueOrThrow({
        where: { id: fixture.variant.id },
      }),
    ).toMatchObject({ stock: 2 });
    expect(enqueuePaymentConfirmed).toHaveBeenCalledTimes(1);
  });

  it("rejects an already matched event when the requested code is for another order", async () => {
    const fixture = await createReviewedFixture();
    await matchReviewedTransactionCore(testPrisma, {
      bankTransactionId: fixture.event.id,
      orderCode: fixture.order.orderCode,
      recordedByUserId: fixture.actor.id,
    }, {
      enqueuePaymentConfirmed: vi.fn().mockResolvedValue(undefined),
    });

    await expect(
      matchReviewedTransactionCore(testPrisma, {
        bankTransactionId: fixture.event.id,
        orderCode: "LEAFABC123",
        recordedByUserId: fixture.actor.id,
      }),
    ).rejects.toEqual(
      new MatchReviewedTransactionError("EVENT_NOT_REVIEWABLE"),
    );
  });
});
