import { beforeEach, describe, expect, it } from "vitest";
import {
  OrderStatus,
  PaymentDirection,
} from "@/generated/prisma/enums";
import {
  UpdateOrderStatusError,
  updateOrderStatusCore,
} from "@/server/orders/update-status";
import { resetDb, testPrisma } from "@/test/db";

async function createOrderFixture(status: OrderStatus, label: string) {
  return testPrisma.order.create({
    data: {
      orderCode: `LEAF-${label}-${crypto.randomUUID()}`,
      email: `${label.toLowerCase()}@example.com`,
      customerName: `Khách ${label}`,
      phone: "0900000000",
      province: "Hà Nội",
      ward: "Phường Ba Đình",
      addressLine: `1 Đường ${label}`,
      subtotal: 500_000,
      shippingFee: 0,
      total: 500_000,
      status,
    },
  });
}

describe("updateOrderStatusCore", () => {
  let pendingOrder: Awaited<ReturnType<typeof createOrderFixture>>;
  let paidOrder: Awaited<ReturnType<typeof createOrderFixture>>;
  let fulfilledOrder: Awaited<ReturnType<typeof createOrderFixture>>;
  let cancelledOrder: Awaited<ReturnType<typeof createOrderFixture>>;

  beforeEach(async () => {
    await resetDb();
    const orders = await Promise.all([
      createOrderFixture(OrderStatus.PENDING_PAYMENT, "PENDING"),
      createOrderFixture(OrderStatus.PAID, "PAID"),
      createOrderFixture(OrderStatus.FULFILLED, "FULFILLED"),
      createOrderFixture(OrderStatus.COMPLETED, "COMPLETED"),
      createOrderFixture(OrderStatus.CANCELLED, "CANCELLED"),
      createOrderFixture(OrderStatus.EXPIRED, "EXPIRED"),
    ]);
    pendingOrder = orders[0];
    paidOrder = orders[1];
    fulfilledOrder = orders[2];
    cancelledOrder = orders[4];
  });

  it("cancels a pending-payment order", async () => {
    const result = await updateOrderStatusCore(testPrisma, {
      orderId: pendingOrder.id,
      targetStatus: OrderStatus.CANCELLED,
    });

    expect(result).toEqual({
      orderCode: pendingOrder.orderCode,
      status: OrderStatus.CANCELLED,
    });
    await expect(
      testPrisma.order.findUniqueOrThrow({ where: { id: pendingOrder.id } }),
    ).resolves.toMatchObject({ status: OrderStatus.CANCELLED });
  });

  it("fulfills a paid order with positive net received", async () => {
    await testPrisma.payment.create({
      data: {
        orderId: paidOrder.id,
        provider: "manual",
        transactionId: `IN-${crypto.randomUUID()}`,
        amount: 500_000,
        direction: PaymentDirection.IN,
      },
    });

    await expect(
      updateOrderStatusCore(testPrisma, {
        orderId: paidOrder.id,
        targetStatus: OrderStatus.FULFILLED,
      }),
    ).resolves.toEqual({
      orderCode: paidOrder.orderCode,
      status: OrderStatus.FULFILLED,
    });
  });

  it("completes a fulfilled order", async () => {
    await expect(
      updateOrderStatusCore(testPrisma, {
        orderId: fulfilledOrder.id,
        targetStatus: OrderStatus.COMPLETED,
      }),
    ).resolves.toEqual({
      orderCode: fulfilledOrder.orderCode,
      status: OrderStatus.COMPLETED,
    });
  });

  it("rejects skipping from paid directly to completed", async () => {
    await expect(
      updateOrderStatusCore(testPrisma, {
        orderId: paidOrder.id,
        targetStatus: OrderStatus.COMPLETED,
      }),
    ).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    } satisfies Partial<UpdateOrderStatusError>);

    await expect(
      testPrisma.order.findUniqueOrThrow({ where: { id: paidOrder.id } }),
    ).resolves.toMatchObject({ status: OrderStatus.PAID });
  });

  it("rejects restoring a cancelled order to paid", async () => {
    await expect(
      updateOrderStatusCore(testPrisma, {
        orderId: cancelledOrder.id,
        targetStatus: OrderStatus.PAID,
      }),
    ).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    } satisfies Partial<UpdateOrderStatusError>);

    await expect(
      testPrisma.order.findUniqueOrThrow({ where: { id: cancelledOrder.id } }),
    ).resolves.toMatchObject({ status: OrderStatus.CANCELLED });
  });

  it("blocks fulfillment after the received amount has been fully refunded", async () => {
    await testPrisma.payment.createMany({
      data: [
        {
          orderId: paidOrder.id,
          provider: "manual",
          transactionId: `IN-${crypto.randomUUID()}`,
          amount: 500_000,
          direction: PaymentDirection.IN,
        },
        {
          orderId: paidOrder.id,
          provider: "manual",
          transactionId: `OUT-${crypto.randomUUID()}`,
          amount: 500_000,
          direction: PaymentDirection.OUT,
        },
      ],
    });

    await expect(
      updateOrderStatusCore(testPrisma, {
        orderId: paidOrder.id,
        targetStatus: OrderStatus.FULFILLED,
      }),
    ).rejects.toMatchObject({
      code: "FULLY_REFUNDED",
    } satisfies Partial<UpdateOrderStatusError>);

    await expect(
      testPrisma.order.findUniqueOrThrow({ where: { id: paidOrder.id } }),
    ).resolves.toMatchObject({ status: OrderStatus.PAID });
  });
});
