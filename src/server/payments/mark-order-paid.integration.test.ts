import { beforeEach, describe, expect, it, vi } from "vitest";
import { BankTransactionStatus, OrderStatus } from "@/generated/prisma/enums";
import {
  markOrderPaidCore,
  markOrderPaidManuallyCore,
} from "@/server/payments/mark-order-paid";
import { resetDb, testPrisma } from "@/test/db";

async function createPendingOrderFixture() {
  const category = await testPrisma.category.create({
    data: { name: "Giày thanh toán", slug: `giay-thanh-toan-${crypto.randomUUID()}` },
  });
  const product = await testPrisma.product.create({
    data: {
      name: "Giày Atomic",
      nameNormalized: "giay atomic",
      slug: `giay-atomic-${crypto.randomUUID()}`,
      categoryId: category.id,
      basePrice: 200_000,
      variants: {
        create: [
          { size: "40", color: "Đen", sku: `ATOMIC-A-${crypto.randomUUID()}`, stock: 7 },
          { size: "41", color: "Trắng", sku: `ATOMIC-B-${crypto.randomUUID()}`, stock: 9 },
        ],
      },
    },
    include: { variants: true },
  });
  const [firstVariant, secondVariant] = product.variants;
  const order = await testPrisma.order.create({
    data: {
      orderCode: `LEAF${crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase()}`,
      email: "paid@example.com",
      customerName: "Nguyễn Thanh Toán",
      phone: "0900000000",
      province: "Hà Nội",
      ward: "Phường Ba Đình",
      addressLine: "1 Đường Thanh Toán",
      subtotal: 800_000,
      shippingFee: 30_000,
      total: 830_000,
      items: {
        create: [
          {
            variantId: firstVariant.id,
            productName: product.name,
            size: firstVariant.size,
            color: firstVariant.color,
            unitPrice: 200_000,
            quantity: 3,
          },
          {
            variantId: secondVariant.id,
            productName: product.name,
            size: secondVariant.size,
            color: secondVariant.color,
            unitPrice: 200_000,
            quantity: 1,
          },
        ],
      },
    },
  });
  const bankTransaction = await testPrisma.bankTransaction.create({
    data: {
      provider: "sepay",
      providerTransactionId: `BANK-${crypto.randomUUID()}`,
      gateway: "MBBank",
      accountNumber: "0000000000",
      transferType: "in",
      amount: order.total,
      content: order.orderCode,
      occurredAt: new Date("2026-07-25T04:00:00.000Z"),
      rawPayload: { id: "bank-event" },
    },
  });

  return { order, firstVariant, secondVariant, bankTransaction };
}

async function createSharedStockFixture() {
  const category = await testPrisma.category.create({
    data: { name: "Giày race", slug: `giay-race-${crypto.randomUUID()}` },
  });
  const product = await testPrisma.product.create({
    data: {
      name: "Giày Race",
      nameNormalized: "giay race",
      slug: `giay-race-product-${crypto.randomUUID()}`,
      categoryId: category.id,
      basePrice: 500_000,
      variants: {
        create: {
          size: "42",
          color: "Xanh",
          sku: `RACE-${crypto.randomUUID()}`,
          stock: 1,
        },
      },
    },
    include: { variants: true },
  });
  const variant = product.variants[0];

  async function createOrder(label: string) {
    return testPrisma.order.create({
      data: {
        orderCode: `LEAF${label}${crypto.randomUUID().replaceAll("-", "").slice(0, 5).toUpperCase()}`,
        email: `${label.toLowerCase()}@example.com`,
        customerName: `Khách ${label}`,
        phone: "0900000000",
        province: "Hà Nội",
        ward: "Phường Ba Đình",
        addressLine: `1 Đường ${label}`,
        subtotal: 500_000,
        shippingFee: 0,
        total: 500_000,
        items: {
          create: {
            variantId: variant.id,
            productName: product.name,
            size: variant.size,
            color: variant.color,
            unitPrice: 500_000,
            quantity: 1,
          },
        },
      },
    });
  }

  const [firstOrder, secondOrder] = await Promise.all([
    createOrder("A"),
    createOrder("B"),
  ]);
  return { variant, firstOrder, secondOrder };
}

describe("markOrderPaidCore", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("atomically marks a pending order paid, decrements exact stock, records payment and bank match, then enqueues once", async () => {
    const fixture = await createPendingOrderFixture();
    const enqueuePaymentConfirmed = vi.fn().mockResolvedValue(undefined);

    const result = await markOrderPaidCore(
      testPrisma,
      {
        orderId: fixture.order.id,
        provider: "sepay",
        transactionId: fixture.bankTransaction.providerTransactionId,
        amount: fixture.order.total,
        bankTransactionId: fixture.bankTransaction.id,
      },
      { enqueuePaymentConfirmed },
    );

    const [order, firstVariant, secondVariant, payments, bankTransaction] =
      await Promise.all([
        testPrisma.order.findUniqueOrThrow({ where: { id: fixture.order.id } }),
        testPrisma.variant.findUniqueOrThrow({ where: { id: fixture.firstVariant.id } }),
        testPrisma.variant.findUniqueOrThrow({ where: { id: fixture.secondVariant.id } }),
        testPrisma.payment.findMany({ where: { orderId: fixture.order.id } }),
        testPrisma.bankTransaction.findUniqueOrThrow({
          where: { id: fixture.bankTransaction.id },
        }),
      ]);

    expect(result).toEqual({ kind: "paid", orderCode: fixture.order.orderCode });
    expect(order.status).toBe(OrderStatus.PAID);
    expect(order.paidAt).toBeInstanceOf(Date);
    expect(firstVariant.stock).toBe(4);
    expect(secondVariant.stock).toBe(8);
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      orderId: fixture.order.id,
      provider: "sepay",
      transactionId: fixture.bankTransaction.providerTransactionId,
      amount: 830_000,
    });
    expect(bankTransaction).toMatchObject({
      status: BankTransactionStatus.MATCHED,
      orderId: fixture.order.id,
    });
    expect(bankTransaction.processedAt).toBeInstanceOf(Date);
    expect(enqueuePaymentConfirmed).toHaveBeenCalledTimes(1);
    expect(enqueuePaymentConfirmed).toHaveBeenCalledWith(expect.anything(), {
      orderCode: fixture.order.orderCode,
    });
  });

  it("rolls back order, stock, payment and bank match when enqueue fails", async () => {
    const fixture = await createPendingOrderFixture();
    const enqueuePaymentConfirmed = vi
      .fn()
      .mockRejectedValue(new Error("simulated queue outage"));

    await expect(
      markOrderPaidCore(
        testPrisma,
        {
          orderId: fixture.order.id,
          provider: "sepay",
          transactionId: fixture.bankTransaction.providerTransactionId,
          amount: fixture.order.total,
          bankTransactionId: fixture.bankTransaction.id,
        },
        { enqueuePaymentConfirmed },
      ),
    ).rejects.toThrow("simulated queue outage");

    const [order, firstVariant, secondVariant, paymentCount, bankTransaction] =
      await Promise.all([
        testPrisma.order.findUniqueOrThrow({ where: { id: fixture.order.id } }),
        testPrisma.variant.findUniqueOrThrow({ where: { id: fixture.firstVariant.id } }),
        testPrisma.variant.findUniqueOrThrow({ where: { id: fixture.secondVariant.id } }),
        testPrisma.payment.count({ where: { orderId: fixture.order.id } }),
        testPrisma.bankTransaction.findUniqueOrThrow({
          where: { id: fixture.bankTransaction.id },
        }),
      ]);

    expect(order).toMatchObject({ status: OrderStatus.PENDING_PAYMENT, paidAt: null });
    expect(firstVariant.stock).toBe(7);
    expect(secondVariant.stock).toBe(9);
    expect(paymentCount).toBe(0);
    expect(bankTransaction).toMatchObject({
      status: BankTransactionStatus.RECEIVED,
      orderId: null,
      processedAt: null,
    });
    expect(enqueuePaymentConfirmed).toHaveBeenCalledTimes(1);
  });

  it("does not overwrite a bank event that another terminal transition already won", async () => {
    const fixture = await createPendingOrderFixture();
    await testPrisma.bankTransaction.update({
      where: { id: fixture.bankTransaction.id },
      data: {
        status: BankTransactionStatus.REVIEW_REQUIRED,
        reviewReason: "ORDER_NOT_FOUND",
      },
    });
    const enqueuePaymentConfirmed = vi.fn().mockResolvedValue(undefined);

    await expect(
      markOrderPaidCore(
        testPrisma,
        {
          orderId: fixture.order.id,
          provider: "sepay",
          transactionId: fixture.bankTransaction.providerTransactionId,
          amount: fixture.order.total,
          bankTransactionId: fixture.bankTransaction.id,
        },
        { enqueuePaymentConfirmed },
      ),
    ).rejects.toMatchObject({
      name: "BankEventClaimError",
    });

    const [order, firstVariant, secondVariant, paymentCount, bankTransaction] =
      await Promise.all([
        testPrisma.order.findUniqueOrThrow({ where: { id: fixture.order.id } }),
        testPrisma.variant.findUniqueOrThrow({
          where: { id: fixture.firstVariant.id },
        }),
        testPrisma.variant.findUniqueOrThrow({
          where: { id: fixture.secondVariant.id },
        }),
        testPrisma.payment.count({ where: { orderId: fixture.order.id } }),
        testPrisma.bankTransaction.findUniqueOrThrow({
          where: { id: fixture.bankTransaction.id },
        }),
      ]);

    expect(order).toMatchObject({
      status: OrderStatus.PENDING_PAYMENT,
      paidAt: null,
    });
    expect(firstVariant.stock).toBe(7);
    expect(secondVariant.stock).toBe(9);
    expect(paymentCount).toBe(0);
    expect(bankTransaction).toMatchObject({
      status: BankTransactionStatus.REVIEW_REQUIRED,
      reviewReason: "ORDER_NOT_FOUND",
      orderId: null,
      processedAt: null,
    });
    expect(enqueuePaymentConfirmed).not.toHaveBeenCalled();
  });

  it("repeated manual confirmation returns duplicate with one decrement, payment and enqueue", async () => {
    const fixture = await createPendingOrderFixture();
    const enqueuePaymentConfirmed = vi.fn().mockResolvedValue(undefined);

    const first = await markOrderPaidManuallyCore(testPrisma, fixture.order.id, {
      enqueuePaymentConfirmed,
    });
    const second = await markOrderPaidManuallyCore(testPrisma, fixture.order.id, {
      enqueuePaymentConfirmed,
    });

    const [firstVariant, secondVariant, payments] = await Promise.all([
      testPrisma.variant.findUniqueOrThrow({ where: { id: fixture.firstVariant.id } }),
      testPrisma.variant.findUniqueOrThrow({ where: { id: fixture.secondVariant.id } }),
      testPrisma.payment.findMany({ where: { orderId: fixture.order.id } }),
    ]);

    expect(first).toEqual({ kind: "paid", orderCode: fixture.order.orderCode });
    expect(second).toEqual({ kind: "duplicate", orderCode: fixture.order.orderCode });
    expect(firstVariant.stock).toBe(4);
    expect(secondVariant.stock).toBe(8);
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      provider: "manual",
      transactionId: `manual:${fixture.order.id}`,
      amount: fixture.order.total,
    });
    expect(enqueuePaymentConfirmed).toHaveBeenCalledTimes(1);
  });

  it("two concurrent calls with the same transaction ID settle as paid and duplicate with one set of side effects", async () => {
    const fixture = await createPendingOrderFixture();
    const enqueuePaymentConfirmed = vi.fn().mockResolvedValue(undefined);
    const input = {
      orderId: fixture.order.id,
      provider: "sepay" as const,
      transactionId: "sepay:concurrent-duplicate",
      amount: fixture.order.total,
    };

    const results = await Promise.all([
      markOrderPaidCore(testPrisma, input, { enqueuePaymentConfirmed }),
      markOrderPaidCore(testPrisma, input, { enqueuePaymentConfirmed }),
    ]);

    expect(results.map((result) => result.kind).sort()).toEqual(["duplicate", "paid"]);
    expect(results.every((result) => result.orderCode === fixture.order.orderCode)).toBe(
      true,
    );
    expect(await testPrisma.payment.count({ where: { orderId: fixture.order.id } })).toBe(
      1,
    );
    expect(
      (await testPrisma.variant.findUniqueOrThrow({
        where: { id: fixture.firstVariant.id },
      })).stock,
    ).toBe(4);
    expect(enqueuePaymentConfirmed).toHaveBeenCalledTimes(1);
  });

  it("two orders competing for the last unit leave stock at zero and only one paid", async () => {
    const fixture = await createSharedStockFixture();
    const enqueuePaymentConfirmed = vi.fn().mockResolvedValue(undefined);

    const results = await Promise.allSettled([
      markOrderPaidCore(
        testPrisma,
        {
          orderId: fixture.firstOrder.id,
          provider: "sepay",
          transactionId: "sepay:last-unit-a",
          amount: fixture.firstOrder.total,
        },
        { enqueuePaymentConfirmed },
      ),
      markOrderPaidCore(
        testPrisma,
        {
          orderId: fixture.secondOrder.id,
          provider: "sepay",
          transactionId: "sepay:last-unit-b",
          amount: fixture.secondOrder.total,
        },
        { enqueuePaymentConfirmed },
      ),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    const [variant, orders, payments] = await Promise.all([
      testPrisma.variant.findUniqueOrThrow({ where: { id: fixture.variant.id } }),
      testPrisma.order.findMany({
        where: { id: { in: [fixture.firstOrder.id, fixture.secondOrder.id] } },
      }),
      testPrisma.payment.findMany({
        where: { orderId: { in: [fixture.firstOrder.id, fixture.secondOrder.id] } },
      }),
    ]);

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({
      name: "PaymentBusinessError",
      code: "INSUFFICIENT_STOCK",
    });
    expect(variant.stock).toBe(0);
    expect(orders.filter((order) => order.status === OrderStatus.PAID)).toHaveLength(1);
    expect(
      orders.filter((order) => order.status === OrderStatus.PENDING_PAYMENT),
    ).toHaveLength(1);
    expect(payments).toHaveLength(1);
    expect(enqueuePaymentConfirmed).toHaveBeenCalledTimes(1);
  });

  it("two transaction IDs racing for one order produce one payment and classify the loser as ORDER_NOT_PENDING, not duplicate", async () => {
    const fixture = await createPendingOrderFixture();
    const enqueuePaymentConfirmed = vi.fn().mockResolvedValue(undefined);

    const results = await Promise.allSettled([
      markOrderPaidCore(
        testPrisma,
        {
          orderId: fixture.order.id,
          provider: "sepay",
          transactionId: "sepay:one-order-a",
          amount: fixture.order.total,
        },
        { enqueuePaymentConfirmed },
      ),
      markOrderPaidCore(
        testPrisma,
        {
          orderId: fixture.order.id,
          provider: "sepay",
          transactionId: "sepay:one-order-b",
          amount: fixture.order.total,
        },
        { enqueuePaymentConfirmed },
      ),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(fulfilled[0].value).toEqual({
      kind: "paid",
      orderCode: fixture.order.orderCode,
    });
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({
      name: "PaymentBusinessError",
      code: "ORDER_NOT_PENDING",
    });
    expect(await testPrisma.payment.count({ where: { orderId: fixture.order.id } })).toBe(
      1,
    );
    expect(
      (await testPrisma.variant.findUniqueOrThrow({
        where: { id: fixture.firstVariant.id },
      })).stock,
    ).toBe(4);
    expect(enqueuePaymentConfirmed).toHaveBeenCalledTimes(1);
  });

  it("rejects a non-exact amount without changing order, stock, payment or enqueue", async () => {
    const fixture = await createPendingOrderFixture();
    const enqueuePaymentConfirmed = vi.fn().mockResolvedValue(undefined);

    await expect(
      markOrderPaidCore(
        testPrisma,
        {
          orderId: fixture.order.id,
          provider: "sepay",
          transactionId: "sepay:wrong-amount",
          amount: fixture.order.total + 1,
        },
        { enqueuePaymentConfirmed },
      ),
    ).rejects.toMatchObject({
      name: "PaymentBusinessError",
      code: "AMOUNT_MISMATCH",
    });

    const [order, firstVariant, paymentCount] = await Promise.all([
      testPrisma.order.findUniqueOrThrow({ where: { id: fixture.order.id } }),
      testPrisma.variant.findUniqueOrThrow({ where: { id: fixture.firstVariant.id } }),
      testPrisma.payment.count({ where: { orderId: fixture.order.id } }),
    ]);
    expect(order).toMatchObject({ status: OrderStatus.PENDING_PAYMENT, paidAt: null });
    expect(firstVariant.stock).toBe(7);
    expect(paymentCount).toBe(0);
    expect(enqueuePaymentConfirmed).not.toHaveBeenCalled();
  });

  it("rolls back an earlier decrement when a later order item has insufficient stock", async () => {
    const fixture = await createPendingOrderFixture();
    await testPrisma.variant.update({
      where: { id: fixture.secondVariant.id },
      data: { stock: 0 },
    });
    const enqueuePaymentConfirmed = vi.fn().mockResolvedValue(undefined);

    await expect(
      markOrderPaidCore(
        testPrisma,
        {
          orderId: fixture.order.id,
          provider: "sepay",
          transactionId: fixture.bankTransaction.providerTransactionId,
          amount: fixture.order.total,
          bankTransactionId: fixture.bankTransaction.id,
        },
        { enqueuePaymentConfirmed },
      ),
    ).rejects.toMatchObject({
      name: "PaymentBusinessError",
      code: "INSUFFICIENT_STOCK",
    });

    const [order, firstVariant, secondVariant, paymentCount, bankTransaction] =
      await Promise.all([
        testPrisma.order.findUniqueOrThrow({ where: { id: fixture.order.id } }),
        testPrisma.variant.findUniqueOrThrow({ where: { id: fixture.firstVariant.id } }),
        testPrisma.variant.findUniqueOrThrow({ where: { id: fixture.secondVariant.id } }),
        testPrisma.payment.count({ where: { orderId: fixture.order.id } }),
        testPrisma.bankTransaction.findUniqueOrThrow({
          where: { id: fixture.bankTransaction.id },
        }),
      ]);

    expect(order).toMatchObject({ status: OrderStatus.PENDING_PAYMENT, paidAt: null });
    expect(firstVariant.stock).toBe(7);
    expect(secondVariant.stock).toBe(0);
    expect(paymentCount).toBe(0);
    expect(bankTransaction).toMatchObject({
      status: BankTransactionStatus.RECEIVED,
      orderId: null,
      processedAt: null,
    });
    expect(enqueuePaymentConfirmed).not.toHaveBeenCalled();
  });
});
