import { beforeEach, describe, expect, it } from "vitest";
import {
  OrderStatus,
  PaymentDirection,
} from "@/generated/prisma/enums";
import {
  RecordRefundError,
  recordRefundCore,
} from "@/server/payments/record-refund";
import { resetDb, testPrisma } from "@/test/db";

async function createRefundFixture(
  status: OrderStatus,
  incomingAmount: number | null = 100_000,
) {
  const suffix = crypto.randomUUID();
  const actor = await testPrisma.user.create({
    data: {
      id: `refund-actor-${suffix}`,
      name: "Nhân viên hoàn tiền",
      email: `refund-actor-${suffix}@example.com`,
      role: "staff",
    },
  });
  const category = await testPrisma.category.create({
    data: {
      name: `Danh mục hoàn tiền ${suffix}`,
      slug: `refund-category-${suffix}`,
    },
  });
  const product = await testPrisma.product.create({
    data: {
      name: "Giày Refund",
      nameNormalized: "giay refund",
      slug: `refund-product-${suffix}`,
      categoryId: category.id,
      basePrice: 100_000,
      variants: {
        create: {
          size: "42",
          color: "Đen",
          sku: `REFUND-${suffix}`,
          stock: 7,
        },
      },
    },
    include: { variants: true },
  });
  const variant = product.variants[0];
  const order = await testPrisma.order.create({
    data: {
      orderCode: `REF-${suffix.replaceAll("-", "").slice(0, 12).toUpperCase()}`,
      email: `customer-${suffix}@example.com`,
      customerName: "Khách hoàn tiền",
      phone: "0900000000",
      province: "Hà Nội",
      ward: "Phường Ba Đình",
      addressLine: "1 Đường Hoàn Tiền",
      subtotal: 100_000,
      shippingFee: 0,
      total: 100_000,
      status,
      items: {
        create: {
          variantId: variant.id,
          productName: product.name,
          size: variant.size,
          color: variant.color,
          unitPrice: 100_000,
          quantity: 1,
        },
      },
    },
  });
  if (incomingAmount !== null) {
    await testPrisma.payment.create({
      data: {
        orderId: order.id,
        provider: "sepay",
        transactionId: `IN-${suffix}`,
        amount: incomingAmount,
        direction: PaymentDirection.IN,
      },
    });
  }

  return { actor, order, variant };
}

describe("recordRefundCore", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("records multiple partial OUT rows while preserving order status and stock", async () => {
    const fixture = await createRefundFixture(OrderStatus.PAID);

    const first = await recordRefundCore(testPrisma, {
      orderId: fixture.order.id,
      amount: 30_000,
      recordedByUserId: fixture.actor.id,
    });
    const second = await recordRefundCore(testPrisma, {
      orderId: fixture.order.id,
      amount: 20_000,
      recordedByUserId: fixture.actor.id,
    });

    const [order, variant, refunds] = await Promise.all([
      testPrisma.order.findUniqueOrThrow({ where: { id: fixture.order.id } }),
      testPrisma.variant.findUniqueOrThrow({ where: { id: fixture.variant.id } }),
      testPrisma.payment.findMany({
        where: {
          orderId: fixture.order.id,
          direction: PaymentDirection.OUT,
        },
      }),
    ]);

    expect(first.summary).toEqual({
      totalIn: 100_000,
      totalOut: 30_000,
      netReceived: 70_000,
      refundState: "PARTIAL",
    });
    expect(second.summary).toEqual({
      totalIn: 100_000,
      totalOut: 50_000,
      netReceived: 50_000,
      refundState: "PARTIAL",
    });
    expect(refunds).toHaveLength(2);
    expect(
      refunds.map((payment) => payment.amount).sort((left, right) => left - right),
    ).toEqual([20_000, 30_000]);
    expect(order.status).toBe(OrderStatus.PAID);
    expect(order.lastRefundAt).toBeInstanceOf(Date);
    expect(variant.stock).toBe(7);
  });

  it("allows an exact final refund and reports a full refund", async () => {
    const fixture = await createRefundFixture(OrderStatus.FULFILLED);

    await expect(
      recordRefundCore(testPrisma, {
        orderId: fixture.order.id,
        amount: 100_000,
        recordedByUserId: fixture.actor.id,
      }),
    ).resolves.toMatchObject({
      orderCode: fixture.order.orderCode,
      summary: {
        totalIn: 100_000,
        totalOut: 100_000,
        netReceived: 0,
        refundState: "FULL",
      },
    });

    await expect(
      testPrisma.order.findUniqueOrThrow({ where: { id: fixture.order.id } }),
    ).resolves.toMatchObject({ status: OrderStatus.FULFILLED });
  });

  it("rolls back a cumulative refund above the received amount", async () => {
    const fixture = await createRefundFixture(OrderStatus.PAID);
    await recordRefundCore(testPrisma, {
      orderId: fixture.order.id,
      amount: 60_000,
      recordedByUserId: fixture.actor.id,
    });
    const beforeRejectedAttempt =
      await testPrisma.order.findUniqueOrThrow({
        where: { id: fixture.order.id },
        select: { lastRefundAt: true },
      });

    await expect(
      recordRefundCore(testPrisma, {
        orderId: fixture.order.id,
        amount: 40_001,
        recordedByUserId: fixture.actor.id,
      }),
    ).rejects.toMatchObject({
      code: "REFUND_EXCEEDS_RECEIVED",
    } satisfies Partial<RecordRefundError>);

    const [refunds, order] = await Promise.all([
      testPrisma.payment.findMany({
        where: {
          orderId: fixture.order.id,
          direction: PaymentDirection.OUT,
        },
      }),
      testPrisma.order.findUniqueOrThrow({ where: { id: fixture.order.id } }),
    ]);
    expect(refunds.map((payment) => payment.amount)).toEqual([60_000]);
    expect(order.lastRefundAt).toEqual(beforeRejectedAttempt.lastRefundAt);
  });

  it.each([
    OrderStatus.PENDING_PAYMENT,
    OrderStatus.CANCELLED,
    OrderStatus.EXPIRED,
  ])("rejects refunds for %s orders", async (status) => {
    const fixture = await createRefundFixture(status);

    await expect(
      recordRefundCore(testPrisma, {
        orderId: fixture.order.id,
        amount: 1,
        recordedByUserId: fixture.actor.id,
      }),
    ).rejects.toMatchObject({
      code: "ORDER_NOT_REFUNDABLE",
    } satisfies Partial<RecordRefundError>);

    expect(
      await testPrisma.payment.count({
        where: {
          orderId: fixture.order.id,
          direction: PaymentDirection.OUT,
        },
      }),
    ).toBe(0);
  });

  it("serializes concurrent refunds so only one 60k refund wins against 100k received", async () => {
    const fixture = await createRefundFixture(OrderStatus.PAID);
    const input = {
      orderId: fixture.order.id,
      amount: 60_000,
      recordedByUserId: fixture.actor.id,
    };

    const results = await Promise.allSettled([
      recordRefundCore(testPrisma, input),
      recordRefundCore(testPrisma, input),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({
      name: "RecordRefundError",
      code: "REFUND_EXCEEDS_RECEIVED",
    });

    const refunds = await testPrisma.payment.findMany({
      where: {
        orderId: fixture.order.id,
        direction: PaymentDirection.OUT,
      },
    });
    expect(refunds).toHaveLength(1);
    expect(refunds[0].amount).toBe(60_000);
  });

  it("persists manual refund provenance and optional metadata", async () => {
    const fixture = await createRefundFixture(OrderStatus.COMPLETED);

    const result = await recordRefundCore(testPrisma, {
      orderId: fixture.order.id,
      amount: 25_000,
      recordedByUserId: fixture.actor.id,
      externalReference: "GATEWAY-REF-123",
      note: "Khách yêu cầu đổi phương thức nhận tiền.",
    });

    const refund = await testPrisma.payment.findUniqueOrThrow({
      where: { id: result.paymentId },
    });
    expect(refund).toMatchObject({
      orderId: fixture.order.id,
      provider: "manual",
      amount: 25_000,
      direction: PaymentDirection.OUT,
      externalReference: "GATEWAY-REF-123",
      note: "Khách yêu cầu đổi phương thức nhận tiền.",
      recordedByUserId: fixture.actor.id,
    });
    expect(refund.transactionId).toMatch(/^manual-refund:[0-9a-f-]{36}$/);
    expect(refund.matchedAt).toBeInstanceOf(Date);
  });

  it("rejects an eligible order without an incoming payment", async () => {
    const fixture = await createRefundFixture(OrderStatus.PAID, null);

    await expect(
      recordRefundCore(testPrisma, {
        orderId: fixture.order.id,
        amount: 1,
        recordedByUserId: fixture.actor.id,
      }),
    ).rejects.toMatchObject({
      code: "NO_INCOMING_PAYMENT",
    } satisfies Partial<RecordRefundError>);
  });

  it("rejects a missing order", async () => {
    const fixture = await createRefundFixture(OrderStatus.PAID);

    await expect(
      recordRefundCore(testPrisma, {
        orderId: "cmissing0000000000000000000",
        amount: 1,
        recordedByUserId: fixture.actor.id,
      }),
    ).rejects.toMatchObject({
      code: "ORDER_NOT_FOUND",
    } satisfies Partial<RecordRefundError>);
  });
});
