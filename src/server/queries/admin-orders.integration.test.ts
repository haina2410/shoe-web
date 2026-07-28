import { beforeEach, describe, expect, it } from "vitest";
import {
  OrderStatus,
  PaymentDirection,
} from "@/generated/prisma/enums";
import { listAdminOrders } from "@/server/queries/admin-orders";
import { resetDb, testPrisma } from "@/test/db";

async function createOrderFixture(input: {
  orderCode: string;
  status: OrderStatus;
  createdAt: Date;
  payments?: Array<{ direction: PaymentDirection; amount: number }>;
}) {
  const suffix = crypto.randomUUID();
  return testPrisma.order.create({
    data: {
      orderCode: input.orderCode,
      email: `${suffix}@example.com`,
      customerName: `Khách ${input.orderCode}`,
      phone: "0900000000",
      province: "Hà Nội",
      ward: "Ba Đình",
      addressLine: "1 Phố Đơn Hàng",
      subtotal: 100_000,
      shippingFee: 0,
      total: 100_000,
      status: input.status,
      createdAt: input.createdAt,
      payments: input.payments
        ? {
            create: input.payments.map((payment, index) => ({
              provider: "manual",
              transactionId: `${input.orderCode}-${index}-${suffix}`,
              amount: payment.amount,
              direction: payment.direction,
            })),
          }
        : undefined,
    },
  });
}

describe("listAdminOrders", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("filters by status, order code, and refunds while returning newest orders first", async () => {
    const noRefund = await createOrderFixture({
      orderCode: "LEAF-NO-REFUND",
      status: OrderStatus.PENDING_PAYMENT,
      createdAt: new Date("2026-07-20T08:00:00.000Z"),
    });
    const partialRefund = await createOrderFixture({
      orderCode: "LEAF-PARTIAL-REFUND",
      status: OrderStatus.PAID,
      createdAt: new Date("2026-07-21T08:00:00.000Z"),
      payments: [
        { direction: PaymentDirection.IN, amount: 100_000 },
        { direction: PaymentDirection.OUT, amount: 25_000 },
      ],
    });
    const fullRefund = await createOrderFixture({
      orderCode: "LEAF-FULL-REFUND",
      status: OrderStatus.FULFILLED,
      createdAt: new Date("2026-07-22T08:00:00.000Z"),
      payments: [
        { direction: PaymentDirection.IN, amount: 100_000 },
        { direction: PaymentDirection.OUT, amount: 100_000 },
      ],
    });

    const allOrders = await listAdminOrders(testPrisma, {
      refund: "all",
      query: "",
    });
    expect(allOrders.map((order) => order.id)).toEqual([
      fullRefund.id,
      partialRefund.id,
      noRefund.id,
    ]);
    expect(Object.keys(allOrders[0]).sort()).toEqual([
      "createdAt",
      "customerName",
      "id",
      "orderCode",
      "payments",
      "status",
      "total",
    ]);
    expect(allOrders[0]).toMatchObject({
      id: fullRefund.id,
      orderCode: "LEAF-FULL-REFUND",
      customerName: "Khách LEAF-FULL-REFUND",
      createdAt: new Date("2026-07-22T08:00:00.000Z"),
      total: 100_000,
      status: OrderStatus.FULFILLED,
      payments: expect.arrayContaining([
        { direction: PaymentDirection.IN, amount: 100_000 },
        { direction: PaymentDirection.OUT, amount: 100_000 },
      ]),
    });

    await expect(
      listAdminOrders(testPrisma, {
        status: OrderStatus.PAID,
        refund: "all",
        query: "",
      }),
    ).resolves.toMatchObject([{ id: partialRefund.id }]);
    await expect(
      listAdminOrders(testPrisma, {
        refund: "all",
        query: "LEAF-PARTIAL",
      }),
    ).resolves.toMatchObject([{ id: partialRefund.id }]);
    await expect(
      listAdminOrders(testPrisma, {
        refund: "with",
        query: "",
      }),
    ).resolves.toMatchObject([{ id: fullRefund.id }, { id: partialRefund.id }]);
  });
});
