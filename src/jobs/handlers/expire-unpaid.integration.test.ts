import { beforeEach, describe, expect, it } from "vitest";
import { OrderStatus } from "@/generated/prisma/client";
import { expireUnpaidOrders } from "@/jobs/handlers/expire-unpaid";
import { resetDb, testPrisma } from "@/test/db";

const NOW = new Date("2026-07-25T12:00:00.000Z");
const CUTOFF = new Date("2026-07-24T12:00:00.000Z");

async function makeOrder(input: {
  orderCode: string;
  status: OrderStatus;
  createdAt: Date;
}) {
  return testPrisma.order.create({
    data: {
      ...input,
      email: `${input.orderCode.toLowerCase()}@example.com`,
      customerName: "Khách thử nghiệm",
      phone: "0900000000",
      province: "Hà Nội",
      ward: "Ba Đình",
      addressLine: "1 Phố Thử Nghiệm",
      subtotal: 100_000,
      shippingFee: 30_000,
      total: 130_000,
    },
  });
}

async function makeVariant(stock: number) {
  const category = await testPrisma.category.create({
    data: { name: "Danh mục thử nghiệm", slug: "expire-unpaid-test" },
  });
  const product = await testPrisma.product.create({
    data: {
      name: "Sản phẩm thử nghiệm",
      nameNormalized: "san pham thu nghiem",
      slug: "expire-unpaid-test",
      categoryId: category.id,
      basePrice: 100_000,
      status: "ACTIVE",
    },
  });
  return testPrisma.variant.create({
    data: {
      productId: product.id,
      size: "40",
      color: "Đen",
      sku: "EXPIRE-UNPAID-TEST",
      stock,
    },
  });
}

describe("expireUnpaidOrders", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("chỉ expire PENDING_PAYMENT tạo trước cutoff 24 giờ; cutoff chính xác, trạng thái khác và stock không đổi", async () => {
    await Promise.all([
      makeOrder({
        orderCode: "OLD-PENDING",
        status: OrderStatus.PENDING_PAYMENT,
        createdAt: new Date(CUTOFF.getTime() - 1),
      }),
      makeOrder({
        orderCode: "AT-CUTOFF",
        status: OrderStatus.PENDING_PAYMENT,
        createdAt: CUTOFF,
      }),
      makeOrder({
        orderCode: "NEW-PENDING",
        status: OrderStatus.PENDING_PAYMENT,
        createdAt: new Date(CUTOFF.getTime() + 1),
      }),
      makeOrder({
        orderCode: "OLD-PAID",
        status: OrderStatus.PAID,
        createdAt: new Date(CUTOFF.getTime() - 1),
      }),
      makeOrder({
        orderCode: "OLD-CANCELLED",
        status: OrderStatus.CANCELLED,
        createdAt: new Date(CUTOFF.getTime() - 1),
      }),
    ]);
    const variant = await makeVariant(17);

    const count = await expireUnpaidOrders({ db: testPrisma }, { now: NOW });

    expect(count).toBe(1);
    const orders = await testPrisma.order.findMany({
      select: { orderCode: true, status: true },
      orderBy: { orderCode: "asc" },
    });
    expect(orders).toEqual([
      { orderCode: "AT-CUTOFF", status: OrderStatus.PENDING_PAYMENT },
      { orderCode: "NEW-PENDING", status: OrderStatus.PENDING_PAYMENT },
      { orderCode: "OLD-CANCELLED", status: OrderStatus.CANCELLED },
      { orderCode: "OLD-PAID", status: OrderStatus.PAID },
      { orderCode: "OLD-PENDING", status: OrderStatus.EXPIRED },
    ]);
    await expect(
      testPrisma.variant.findUniqueOrThrow({
        where: { id: variant.id },
        select: { stock: true },
      }),
    ).resolves.toEqual({ stock: 17 });
  });

  it("lần chạy lại không expire thêm đơn nào và trả về 0", async () => {
    await makeOrder({
      orderCode: "IDEMPOTENT",
      status: OrderStatus.PENDING_PAYMENT,
      createdAt: new Date(CUTOFF.getTime() - 1),
    });

    await expect(
      expireUnpaidOrders({ db: testPrisma }, { now: NOW }),
    ).resolves.toBe(1);
    await expect(
      expireUnpaidOrders({ db: testPrisma }, { now: NOW }),
    ).resolves.toBe(0);
  });
});
