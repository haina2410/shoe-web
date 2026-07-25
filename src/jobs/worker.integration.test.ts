import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { PgBoss } from "pg-boss";
import { testPrisma, resetDb } from "@/test/db";
import { createTestBoss, resetQueues } from "@/test/boss";
import { QUEUE_SEND_ORDER_CONFIRMATION, ensureQueues, enqueueOrderConfirmation } from "@/jobs/queue";
import { handleSendOrderConfirmation } from "@/jobs/handlers/send-order-confirmation";
import { createOrderCore } from "@/server/orders";
import type { CreateOrderInput } from "@/lib/validation/checkout";
import type { Mailer, MailMessage } from "@/lib/mailer";

/**
 * `src/jobs/worker.integration.test.ts` — test tiến trình worker END-TO-END
 * với pg-boss THẬT (`createTestBoss()`, `__test__enableSpies: true`) + fake
 * mailer (không mạng): đăng ký `handleSendOrderConfirmation` qua
 * `boss.work(...)` (cùng cách worker thật làm ở `src/worker/index.ts`), rồi
 * `enqueueOrderConfirmation` trong 1 `testPrisma.$transaction` — dùng SPY để
 * chờ job `completed` (không dùng `setTimeout` cố định).
 */

const ZONE_FEE = 30000;
const TEST_PROVINCE = "Hà Nội";

async function makeShippingZone(fee = ZONE_FEE, province = TEST_PROVINCE) {
  const zone = await testPrisma.shippingZone.create({
    data: { name: `Zone ${province}-${Math.random().toString(36).slice(2, 8)}`, fee, isDefault: false },
  });
  await testPrisma.provinceZone.create({
    data: { province, zoneId: zone.id },
  });
  return zone;
}

async function makeCategory(name = "Giày Sneaker", slug = "giay-sneaker") {
  return testPrisma.category.create({ data: { name, slug } });
}

async function makeProductWithVariant(opts: { categoryId: string }) {
  const product = await testPrisma.product.create({
    data: {
      name: "Giày Chạy Bộ Alpha",
      nameNormalized: "giay chay bo alpha",
      categoryId: opts.categoryId,
      basePrice: 300000,
      status: "ACTIVE",
      slug: "giay-" + Math.random().toString(36).slice(2, 10),
      variants: {
        create: [
          {
            size: "40",
            color: "Đen",
            sku: "SKU-" + Math.random().toString(36).slice(2, 10),
            priceOverride: null,
            stock: 10,
          },
        ],
      },
    },
    include: { variants: true },
  });
  return { product, variant: product.variants[0] };
}

function baseInput(overrides: Partial<CreateOrderInput> = {}): CreateOrderInput {
  return {
    customerName: "Nguyễn Văn A",
    email: "khach@example.com",
    phone: "0901234567",
    province: TEST_PROVINCE,
    ward: "Phường Ba Đình",
    addressLine: "123 Đường Láng",
    items: [],
    ...overrides,
  };
}

async function makeOrder() {
  await makeShippingZone();
  const category = await makeCategory();
  const { variant } = await makeProductWithVariant({ categoryId: category.id });
  return createOrderCore(
    testPrisma,
    baseInput({ items: [{ variantId: variant.id, quantity: 1 }] }),
  );
}

function fakeMailer(): Mailer & { messages: MailMessage[] } {
  const messages: MailMessage[] = [];
  return {
    messages,
    send: vi.fn(async (message: MailMessage) => {
      messages.push(message);
    }),
  };
}

describe("worker: send-order-confirmation", () => {
  let boss: PgBoss;
  let mailer: Mailer & { messages: MailMessage[] };

  beforeAll(async () => {
    boss = createTestBoss();
    await boss.start();
    await ensureQueues(boss);
  });

  afterAll(async () => {
    await boss.stop();
  });

  beforeEach(async () => {
    await resetDb();
    await resetQueues(boss);
    mailer = fakeMailer();
    await boss.offWork(QUEUE_SEND_ORDER_CONFIRMATION);
    await boss.work(QUEUE_SEND_ORDER_CONFIRMATION, {}, async (jobs) => {
      for (const job of jobs) {
        await handleSendOrderConfirmation({ db: testPrisma, mailer }, job.data);
      }
    });
  });

  it("enqueue trong transaction → worker xử lý job đến 'completed' → fake mailer nhận đúng 1 email", async () => {
    const order = await makeOrder();
    const spy = boss.getSpy<{ orderCode: string }>(QUEUE_SEND_ORDER_CONFIRMATION);

    await testPrisma.$transaction(async (tx) => {
      await enqueueOrderConfirmation(tx, { orderCode: order.orderCode }, boss);
    });

    const completed = await spy.waitForJob(
      (data) => data.orderCode === order.orderCode,
      "completed",
    );

    expect(completed.state).toBe("completed");
    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect(mailer.messages[0].to).toBe(order.email);
  });
});
