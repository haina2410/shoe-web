import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { PgBoss } from "pg-boss";
import {
  OrderStatus,
  type Prisma,
  type PrismaClient,
} from "@/generated/prisma/client";
import { expireUnpaidOrders } from "@/jobs/handlers/expire-unpaid";
import {
  QUEUE_SEND_PAYMENT_CONFIRMED,
  enqueuePaymentConfirmed,
  ensureQueues,
} from "@/jobs/queue";
import { markOrderPaidCore } from "@/server/payments/mark-order-paid";
import { createTestBoss, resetQueues } from "@/test/boss";
import { resetDb, testPrisma } from "@/test/db";

const NOW = new Date("2026-07-25T12:00:00.000Z");
const CUTOFF = new Date("2026-07-24T12:00:00.000Z");
let boss: PgBoss;

beforeAll(async () => {
  boss = createTestBoss();
  await boss.start();
  await ensureQueues(boss);
});

afterAll(async () => {
  await boss.stop();
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

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

async function makeRaceFixture(orderCode: string) {
  const variant = await makeVariant(1);
  const order = await makeOrder({
    orderCode,
    status: OrderStatus.PENDING_PAYMENT,
    createdAt: new Date(CUTOFF.getTime() - 1),
  });
  await testPrisma.orderItem.create({
    data: {
      orderId: order.id,
      variantId: variant.id,
      productName: "Sản phẩm thử nghiệm",
      size: variant.size,
      color: variant.color,
      unitPrice: 100_000,
      quantity: 1,
    },
  });
  return { order, variant };
}

function dbWithOrderClaimBarrier(onAttempt: () => void): PrismaClient {
  return new Proxy(testPrisma, {
    get(target, property, receiver) {
      if (property === "$transaction") {
        return <T>(
          callback: (tx: Prisma.TransactionClient) => Promise<T>,
        ): Promise<T> =>
          target.$transaction(async (tx) => {
            const controlledOrder = new Proxy(tx.order, {
              get(orderDelegate, orderProperty, orderReceiver) {
                if (orderProperty === "updateMany") {
                  return (
                    args: Parameters<typeof orderDelegate.updateMany>[0],
                  ) => {
                    onAttempt();
                    return orderDelegate.updateMany(args);
                  };
                }
                return Reflect.get(
                  orderDelegate,
                  orderProperty,
                  orderReceiver,
                );
              },
            });
            const controlledTx = new Proxy(tx, {
              get(transaction, transactionProperty, transactionReceiver) {
                if (transactionProperty === "order") return controlledOrder;
                return Reflect.get(
                  transaction,
                  transactionProperty,
                  transactionReceiver,
                );
              },
            }) as Prisma.TransactionClient;
            return callback(controlledTx);
          });
      }

      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as PrismaClient;
}

async function findPaymentJobs(orderCode: string) {
  return boss.findJobs<{ orderCode: string }>(
    QUEUE_SEND_PAYMENT_CONFIRMED,
    { data: { orderCode } },
  );
}

describe("expireUnpaidOrders", () => {
  beforeEach(async () => {
    await resetDb();
    await resetQueues(boss);
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

describe("payment versus expiry race", () => {
  beforeEach(async () => {
    await resetDb();
    await resetQueues(boss);
  });

  it("expiry row-lock winner leaves EXPIRED with no payment, stock decrement, or email job", async () => {
    const fixture = await makeRaceFixture("LEAFEXPR01");
    const expiryLocked = deferred();
    const releaseExpiry = deferred();
    const paymentClaimAttempted = deferred();

    const expiryWinner = testPrisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id"
        FROM "order"
        WHERE "id" = ${fixture.order.id}
        FOR UPDATE
      `;
      expiryLocked.resolve();
      await releaseExpiry.promise;
      return tx.order.updateMany({
        where: {
          id: fixture.order.id,
          status: OrderStatus.PENDING_PAYMENT,
          createdAt: { lt: CUTOFF },
        },
        data: { status: OrderStatus.EXPIRED },
      });
    });
    await expiryLocked.promise;

    const payment = markOrderPaidCore(
      dbWithOrderClaimBarrier(paymentClaimAttempted.resolve),
      {
        orderId: fixture.order.id,
        provider: "sepay",
        transactionId: "race-expiry-wins",
        amount: fixture.order.total,
      },
      {
        enqueuePaymentConfirmed: (tx, payload) =>
          enqueuePaymentConfirmed(tx, payload, boss),
      },
    );
    await paymentClaimAttempted.promise;
    releaseExpiry.resolve();

    await expect(expiryWinner).resolves.toMatchObject({ count: 1 });
    await expect(payment).rejects.toMatchObject({
      name: "PaymentBusinessError",
      code: "ORDER_NOT_PENDING",
    });

    const [order, variant, paymentCount, jobs] = await Promise.all([
      testPrisma.order.findUniqueOrThrow({ where: { id: fixture.order.id } }),
      testPrisma.variant.findUniqueOrThrow({
        where: { id: fixture.variant.id },
      }),
      testPrisma.payment.count({ where: { orderId: fixture.order.id } }),
      findPaymentJobs(fixture.order.orderCode),
    ]);
    expect(order).toMatchObject({ status: OrderStatus.EXPIRED, paidAt: null });
    expect(variant.stock).toBe(1);
    expect(paymentCount).toBe(0);
    expect(jobs).toHaveLength(0);
  });

  it("payment row-lock winner creates one payment, decrement and email job while expiry affects zero rows", async () => {
    const fixture = await makeRaceFixture("LEAFPAYW01");
    const paymentAtEnqueue = deferred();
    const releasePayment = deferred();
    const expiryUpdateIssued = deferred();
    const enqueue = vi.fn(
      async (
        tx: Prisma.TransactionClient,
        payload: { orderCode: string },
      ) => {
        paymentAtEnqueue.resolve();
        await releasePayment.promise;
        await enqueuePaymentConfirmed(tx, payload, boss);
      },
    );

    const payment = markOrderPaidCore(
      testPrisma,
      {
        orderId: fixture.order.id,
        provider: "sepay",
        transactionId: "race-payment-wins",
        amount: fixture.order.total,
      },
      { enqueuePaymentConfirmed: enqueue },
    );
    await paymentAtEnqueue.promise;

    const expiryDb = {
      order: {
        updateMany: (
          args: Parameters<typeof testPrisma.order.updateMany>[0],
        ) => {
          const update = testPrisma.order.updateMany(args);
          expiryUpdateIssued.resolve();
          return update;
        },
      },
    } as unknown as PrismaClient;
    const expiry = expireUnpaidOrders(
      { db: expiryDb },
      { now: NOW, maxAgeHours: 24 },
    );
    await expiryUpdateIssued.promise;
    releasePayment.resolve();

    await expect(payment).resolves.toEqual({
      kind: "paid",
      orderCode: fixture.order.orderCode,
    });
    await expect(expiry).resolves.toBe(0);

    const [order, variant, payments, jobs] = await Promise.all([
      testPrisma.order.findUniqueOrThrow({ where: { id: fixture.order.id } }),
      testPrisma.variant.findUniqueOrThrow({
        where: { id: fixture.variant.id },
      }),
      testPrisma.payment.findMany({ where: { orderId: fixture.order.id } }),
      findPaymentJobs(fixture.order.orderCode),
    ]);
    expect(order.status).toBe(OrderStatus.PAID);
    expect(order.paidAt).toBeInstanceOf(Date);
    expect(variant.stock).toBe(0);
    expect(payments).toHaveLength(1);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].data).toEqual({ orderCode: fixture.order.orderCode });
  });
});
