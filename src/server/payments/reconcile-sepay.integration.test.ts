import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BankTransactionStatus,
  OrderStatus,
  PaymentDirection,
} from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";
import type { SePayWebhookPayload } from "@/lib/sepay";
import {
  persistSePayEventCore,
  reconcilePersistedSePayEventCore,
  reconcileSePayCore,
} from "@/server/payments/reconcile-sepay";
import { resetDb, testPrisma } from "@/test/db";

let nextEventId = 910_000;

async function createOrderFixture() {
  const category = await testPrisma.category.create({
    data: {
      name: "Giày đối soát",
      slug: `giay-doi-soat-${crypto.randomUUID()}`,
    },
  });
  const product = await testPrisma.product.create({
    data: {
      name: "Giày SePay",
      nameNormalized: "giay sepay",
      slug: `giay-sepay-${crypto.randomUUID()}`,
      categoryId: category.id,
      basePrice: 200_000,
      variants: {
        create: [
          {
            size: "40",
            color: "Đen",
            sku: `SEPAY-A-${crypto.randomUUID()}`,
            stock: 5,
          },
          {
            size: "41",
            color: "Trắng",
            sku: `SEPAY-B-${crypto.randomUUID()}`,
            stock: 4,
          },
        ],
      },
    },
    include: { variants: true },
  });
  const [firstVariant, secondVariant] = product.variants;
  const order = await testPrisma.order.create({
    data: {
      orderCode: `LEAF${crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase()}`,
      email: "reconcile@example.com",
      customerName: "Nguyễn Đối Soát",
      phone: "0900000000",
      province: "Hà Nội",
      ward: "Phường Ba Đình",
      addressLine: "1 Đường Đối Soát",
      subtotal: 600_000,
      shippingFee: 30_000,
      total: 630_000,
      items: {
        create: [
          {
            variantId: firstVariant.id,
            productName: product.name,
            size: firstVariant.size,
            color: firstVariant.color,
            unitPrice: 200_000,
            quantity: 2,
          },
          {
            variantId: secondVariant.id,
            productName: product.name,
            size: secondVariant.size,
            color: secondVariant.color,
            unitPrice: 100_000,
            quantity: 2,
          },
        ],
      },
    },
  });

  return { order, firstVariant, secondVariant };
}

function payloadFor(
  orderCode: string | null,
  overrides: Partial<SePayWebhookPayload> = {},
): SePayWebhookPayload {
  const id = nextEventId++;
  return {
    id,
    gateway: "MBBank",
    transactionDate: "2026-07-25 14:30:45",
    accountNumber: "0000000000",
    subAccount: null,
    code: orderCode,
    content: orderCode ? `Thanh toan ${orderCode}` : "Thanh toan khong co ma",
    transferType: "in",
    description: `MBVCB.${id}`,
    transferAmount: 630_000,
    accumulated: 1_000_000,
    referenceCode: `FT${id}`,
    ...overrides,
  };
}

async function expectNoPaymentSideEffects(input: {
  orderId: string;
  firstVariantId: string;
  secondVariantId: string;
  orderStatus?: OrderStatus;
  firstStock?: number;
  secondStock?: number;
}) {
  const [order, firstVariant, secondVariant, paymentCount] = await Promise.all([
    testPrisma.order.findUniqueOrThrow({ where: { id: input.orderId } }),
    testPrisma.variant.findUniqueOrThrow({
      where: { id: input.firstVariantId },
    }),
    testPrisma.variant.findUniqueOrThrow({
      where: { id: input.secondVariantId },
    }),
    testPrisma.payment.count({ where: { orderId: input.orderId } }),
  ]);

  expect(order).toMatchObject({
    status: input.orderStatus ?? OrderStatus.PENDING_PAYMENT,
    paidAt: null,
  });
  expect(firstVariant.stock).toBe(input.firstStock ?? 5);
  expect(secondVariant.stock).toBe(input.secondStock ?? 4);
  expect(paymentCount).toBe(0);
}

async function expectReview(
  payload: SePayWebhookPayload,
  reason:
    | "MISSING_ORDER_CODE"
    | "ORDER_NOT_FOUND"
    | "AMOUNT_MISMATCH"
    | "ORDER_NOT_PENDING"
    | "INSUFFICIENT_STOCK",
) {
  const event = await testPrisma.bankTransaction.findUniqueOrThrow({
    where: { providerTransactionId: String(payload.id) },
  });
  expect(event).toMatchObject({
    provider: "sepay",
    status: BankTransactionStatus.REVIEW_REQUIRED,
    reviewReason: reason,
    orderId: null,
    processedAt: null,
  });
}

describe("reconcileSePayCore", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("persists an exact code and amount, then atomically pays the order", async () => {
    const fixture = await createOrderFixture();
    const payload = payloadFor(fixture.order.orderCode);
    const enqueuePaymentConfirmed = vi.fn().mockResolvedValue(undefined);

    const result = await reconcileSePayCore(testPrisma, payload, {
      enqueuePaymentConfirmed,
    });

    const [event, order, firstVariant, secondVariant, payments] =
      await Promise.all([
        testPrisma.bankTransaction.findUniqueOrThrow({
          where: { providerTransactionId: String(payload.id) },
        }),
        testPrisma.order.findUniqueOrThrow({ where: { id: fixture.order.id } }),
        testPrisma.variant.findUniqueOrThrow({
          where: { id: fixture.firstVariant.id },
        }),
        testPrisma.variant.findUniqueOrThrow({
          where: { id: fixture.secondVariant.id },
        }),
        testPrisma.payment.findMany({ where: { orderId: fixture.order.id } }),
      ]);

    expect(result).toEqual({ kind: "matched" });
    expect(event).toMatchObject({
      provider: "sepay",
      providerTransactionId: String(payload.id),
      paymentCode: fixture.order.orderCode,
      gateway: payload.gateway,
      accountNumber: payload.accountNumber,
      transferType: "in",
      amount: payload.transferAmount,
      content: payload.content,
      referenceCode: payload.referenceCode,
      status: BankTransactionStatus.MATCHED,
      orderId: fixture.order.id,
      rawPayload: payload,
    });
    expect(event.occurredAt.toISOString()).toBe("2026-07-25T07:30:45.000Z");
    expect(event.processedAt).toBeInstanceOf(Date);
    expect(order).toMatchObject({ status: OrderStatus.PAID });
    expect(order.paidAt).toBeInstanceOf(Date);
    expect(firstVariant.stock).toBe(3);
    expect(secondVariant.stock).toBe(2);
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      provider: "sepay",
      transactionId: String(payload.id),
      amount: payload.transferAmount,
      direction: PaymentDirection.IN,
      recordedByUserId: null,
    });
    expect(enqueuePaymentConfirmed).toHaveBeenCalledTimes(1);
  });

  it("persists a missing order code for review without payment side effects", async () => {
    const fixture = await createOrderFixture();
    const payload = payloadFor(null);
    const enqueuePaymentConfirmed = vi.fn().mockResolvedValue(undefined);

    const result = await reconcileSePayCore(testPrisma, payload, {
      enqueuePaymentConfirmed,
    });

    expect(result).toEqual({
      kind: "review-required",
      reason: "MISSING_ORDER_CODE",
    });
    await expectReview(payload, "MISSING_ORDER_CODE");
    await expectNoPaymentSideEffects({
      orderId: fixture.order.id,
      firstVariantId: fixture.firstVariant.id,
      secondVariantId: fixture.secondVariant.id,
    });
    expect(enqueuePaymentConfirmed).not.toHaveBeenCalled();
  });

  it("persists an unknown order for review without payment side effects", async () => {
    const fixture = await createOrderFixture();
    const payload = payloadFor("LEAFZZZZZZ");
    const enqueuePaymentConfirmed = vi.fn().mockResolvedValue(undefined);

    const result = await reconcileSePayCore(testPrisma, payload, {
      enqueuePaymentConfirmed,
    });

    expect(result).toEqual({
      kind: "review-required",
      reason: "ORDER_NOT_FOUND",
    });
    await expectReview(payload, "ORDER_NOT_FOUND");
    await expectNoPaymentSideEffects({
      orderId: fixture.order.id,
      firstVariantId: fixture.firstVariant.id,
      secondVariantId: fixture.secondVariant.id,
    });
    expect(enqueuePaymentConfirmed).not.toHaveBeenCalled();
  });

  it("persists an amount mismatch for review without payment side effects", async () => {
    const fixture = await createOrderFixture();
    const payload = payloadFor(fixture.order.orderCode, {
      transferAmount: fixture.order.total + 1,
    });
    const enqueuePaymentConfirmed = vi.fn().mockResolvedValue(undefined);

    const result = await reconcileSePayCore(testPrisma, payload, {
      enqueuePaymentConfirmed,
    });

    expect(result).toEqual({
      kind: "review-required",
      reason: "AMOUNT_MISMATCH",
    });
    await expectReview(payload, "AMOUNT_MISMATCH");
    await expectNoPaymentSideEffects({
      orderId: fixture.order.id,
      firstVariantId: fixture.firstVariant.id,
      secondVariantId: fixture.secondVariant.id,
    });
    expect(enqueuePaymentConfirmed).not.toHaveBeenCalled();
  });

  it("persists a non-pending order for review without changing it", async () => {
    const fixture = await createOrderFixture();
    await testPrisma.order.update({
      where: { id: fixture.order.id },
      data: { status: OrderStatus.CANCELLED },
    });
    const payload = payloadFor(fixture.order.orderCode);
    const enqueuePaymentConfirmed = vi.fn().mockResolvedValue(undefined);

    const result = await reconcileSePayCore(testPrisma, payload, {
      enqueuePaymentConfirmed,
    });

    expect(result).toEqual({
      kind: "review-required",
      reason: "ORDER_NOT_PENDING",
    });
    await expectReview(payload, "ORDER_NOT_PENDING");
    await expectNoPaymentSideEffects({
      orderId: fixture.order.id,
      firstVariantId: fixture.firstVariant.id,
      secondVariantId: fixture.secondVariant.id,
      orderStatus: OrderStatus.CANCELLED,
    });
    expect(enqueuePaymentConfirmed).not.toHaveBeenCalled();
  });

  it("rolls back an earlier decrement before marking insufficient stock for review", async () => {
    const fixture = await createOrderFixture();
    await testPrisma.variant.update({
      where: { id: fixture.secondVariant.id },
      data: { stock: 1 },
    });
    const payload = payloadFor(fixture.order.orderCode);
    const enqueuePaymentConfirmed = vi.fn().mockResolvedValue(undefined);

    const result = await reconcileSePayCore(testPrisma, payload, {
      enqueuePaymentConfirmed,
    });

    expect(result).toEqual({
      kind: "review-required",
      reason: "INSUFFICIENT_STOCK",
    });
    await expectReview(payload, "INSUFFICIENT_STOCK");
    await expectNoPaymentSideEffects({
      orderId: fixture.order.id,
      firstVariantId: fixture.firstVariant.id,
      secondVariantId: fixture.secondVariant.id,
      secondStock: 1,
    });
    expect(enqueuePaymentConfirmed).not.toHaveBeenCalled();
  });

  it("resumes reconciliation when a duplicate event is still RECEIVED", async () => {
    const fixture = await createOrderFixture();
    const payload = payloadFor(fixture.order.orderCode);
    await testPrisma.bankTransaction.create({
      data: {
        provider: "sepay",
        providerTransactionId: String(payload.id),
        gateway: payload.gateway,
        accountNumber: payload.accountNumber,
        transferType: payload.transferType,
        amount: payload.transferAmount,
        paymentCode: fixture.order.orderCode,
        content: payload.content,
        referenceCode: payload.referenceCode,
        occurredAt: new Date("2026-07-25T07:30:45.000Z"),
        rawPayload: payload,
      },
    });
    const enqueuePaymentConfirmed = vi.fn().mockResolvedValue(undefined);

    const result = await reconcileSePayCore(testPrisma, payload, {
      enqueuePaymentConfirmed,
    });

    expect(result).toEqual({ kind: "matched" });
    expect(
      await testPrisma.bankTransaction.count({
        where: { providerTransactionId: String(payload.id) },
      }),
    ).toBe(1);
    expect(
      await testPrisma.bankTransaction.findUniqueOrThrow({
        where: { providerTransactionId: String(payload.id) },
      }),
    ).toMatchObject({
      status: BankTransactionStatus.MATCHED,
      orderId: fixture.order.id,
    });
    expect(enqueuePaymentConfirmed).toHaveBeenCalledTimes(1);
  });

  it("retries a RECEIVED event from persisted code and amount, ignoring a changed later body", async () => {
    const fixture = await createOrderFixture();
    const originalPayload = payloadFor(fixture.order.orderCode);
    const failedEnqueue = vi
      .fn()
      .mockRejectedValue(new Error("simulated queue write failure"));

    await expect(
      reconcileSePayCore(testPrisma, originalPayload, {
        enqueuePaymentConfirmed: failedEnqueue,
      }),
    ).rejects.toThrow("simulated queue write failure");

    const changedRetryBody: SePayWebhookPayload = {
      ...originalPayload,
      code: "LEAFZZZZZZ",
      transferAmount: originalPayload.transferAmount + 1,
      content: "later request body must not become canonical",
    };
    const enqueuePaymentConfirmed = vi.fn().mockResolvedValue(undefined);

    const result = await reconcileSePayCore(
      testPrisma,
      changedRetryBody,
      { enqueuePaymentConfirmed },
    );

    expect(result).toEqual({ kind: "matched" });
    const event = await testPrisma.bankTransaction.findUniqueOrThrow({
      where: { providerTransactionId: String(originalPayload.id) },
    });
    expect(event).toMatchObject({
      paymentCode: fixture.order.orderCode,
      amount: originalPayload.transferAmount,
      content: originalPayload.content,
      status: BankTransactionStatus.MATCHED,
      orderId: fixture.order.id,
    });
    expect(enqueuePaymentConfirmed).toHaveBeenCalledTimes(1);
  });

  it("classifies simultaneous deliveries of one provider event as matched and duplicate", async () => {
    const fixture = await createOrderFixture();
    const payload = payloadFor(fixture.order.orderCode);
    const enqueuePaymentConfirmed = vi.fn().mockResolvedValue(undefined);

    const results = await Promise.all([
      reconcileSePayCore(testPrisma, payload, { enqueuePaymentConfirmed }),
      reconcileSePayCore(testPrisma, payload, { enqueuePaymentConfirmed }),
    ]);

    expect(results.map((result) => result.kind).sort()).toEqual([
      "duplicate",
      "matched",
    ]);
    const [eventCount, paymentCount, firstVariant, secondVariant] =
      await Promise.all([
        testPrisma.bankTransaction.count({
          where: { providerTransactionId: String(payload.id) },
        }),
        testPrisma.payment.count({ where: { orderId: fixture.order.id } }),
        testPrisma.variant.findUniqueOrThrow({
          where: { id: fixture.firstVariant.id },
        }),
        testPrisma.variant.findUniqueOrThrow({
          where: { id: fixture.secondVariant.id },
        }),
      ]);
    expect(eventCount).toBe(1);
    expect(paymentCount).toBe(1);
    expect(firstVariant.stock).toBe(3);
    expect(secondVariant.stock).toBe(2);
    expect(enqueuePaymentConfirmed).toHaveBeenCalledTimes(1);
  });

  it("classifies a concurrent terminal bank-event winner without payment side effects", async () => {
    const fixture = await createOrderFixture();
    const payload = payloadFor(fixture.order.orderCode);
    const event = await persistSePayEventCore(testPrisma, payload);
    let transitioned = false;
    const controlledDb = new Proxy(testPrisma, {
      get(target, property, receiver) {
        if (property === "order") {
          return new Proxy(target.order, {
            get(orderDelegate, orderProperty, orderReceiver) {
              if (orderProperty !== "findUnique") {
                return Reflect.get(
                  orderDelegate,
                  orderProperty,
                  orderReceiver,
                );
              }
              return async (...args: Parameters<typeof orderDelegate.findUnique>) => {
                const order = await orderDelegate.findUnique(...args);
                if (!transitioned) {
                  transitioned = true;
                  await testPrisma.bankTransaction.update({
                    where: { id: event.id },
                    data: {
                      status: BankTransactionStatus.REVIEW_REQUIRED,
                      reviewReason: "ORDER_NOT_FOUND",
                    },
                  });
                }
                return order;
              };
            },
          });
        }

        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as PrismaClient;
    const enqueuePaymentConfirmed = vi.fn().mockResolvedValue(undefined);

    const result = await reconcilePersistedSePayEventCore(
      controlledDb,
      event.id,
      { enqueuePaymentConfirmed },
    );

    expect(result).toEqual({ kind: "duplicate" });
    await expectNoPaymentSideEffects({
      orderId: fixture.order.id,
      firstVariantId: fixture.firstVariant.id,
      secondVariantId: fixture.secondVariant.id,
    });
    await expect(
      testPrisma.bankTransaction.findUniqueOrThrow({
        where: { id: event.id },
        select: { status: true, reviewReason: true },
      }),
    ).resolves.toEqual({
      status: BankTransactionStatus.REVIEW_REQUIRED,
      reviewReason: "ORDER_NOT_FOUND",
    });
    expect(enqueuePaymentConfirmed).not.toHaveBeenCalled();
  });

  it.each([
    BankTransactionStatus.MATCHED,
    BankTransactionStatus.REVIEW_REQUIRED,
  ])("returns duplicate without side effects for terminal status %s", async (status) => {
    const fixture = await createOrderFixture();
    const payload = payloadFor(fixture.order.orderCode);
    await testPrisma.bankTransaction.create({
      data: {
        provider: "sepay",
        providerTransactionId: String(payload.id),
        gateway: payload.gateway,
        accountNumber: payload.accountNumber,
        transferType: payload.transferType,
        amount: payload.transferAmount,
        paymentCode: fixture.order.orderCode,
        content: payload.content,
        referenceCode: payload.referenceCode,
        occurredAt: new Date("2026-07-25T07:30:45.000Z"),
        rawPayload: payload,
        status,
        reviewReason:
          status === BankTransactionStatus.REVIEW_REQUIRED
            ? "ORDER_NOT_FOUND"
            : null,
      },
    });
    const enqueuePaymentConfirmed = vi.fn().mockResolvedValue(undefined);

    const result = await reconcileSePayCore(testPrisma, payload, {
      enqueuePaymentConfirmed,
    });

    expect(result).toEqual({ kind: "duplicate" });
    await expectNoPaymentSideEffects({
      orderId: fixture.order.id,
      firstVariantId: fixture.firstVariant.id,
      secondVariantId: fixture.secondVariant.id,
    });
    expect(enqueuePaymentConfirmed).not.toHaveBeenCalled();
  });

  it("rethrows a queue failure after rollback and leaves the event RECEIVED", async () => {
    const fixture = await createOrderFixture();
    const payload = payloadFor(fixture.order.orderCode);
    const enqueuePaymentConfirmed = vi
      .fn()
      .mockRejectedValue(new Error("simulated queue outage"));

    await expect(
      reconcileSePayCore(testPrisma, payload, { enqueuePaymentConfirmed }),
    ).rejects.toThrow("simulated queue outage");

    expect(
      await testPrisma.bankTransaction.findUniqueOrThrow({
        where: { providerTransactionId: String(payload.id) },
      }),
    ).toMatchObject({
      status: BankTransactionStatus.RECEIVED,
      reviewReason: null,
      orderId: null,
      processedAt: null,
    });
    await expectNoPaymentSideEffects({
      orderId: fixture.order.id,
      firstVariantId: fixture.firstVariant.id,
      secondVariantId: fixture.secondVariant.id,
    });
    expect(enqueuePaymentConfirmed).toHaveBeenCalledTimes(1);
  });
});
