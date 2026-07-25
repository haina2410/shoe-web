import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { PgBoss } from "pg-boss";
import { testPrisma, resetDb } from "@/test/db";
import { createTestBoss, resetQueues } from "@/test/boss";
import { QUEUE_SEND_ORDER_CONFIRMATION, ensureQueues, enqueueOrderConfirmation } from "@/jobs/queue";
import { registerOrderConfirmationWorker } from "@/worker/index";
import { createOrderCore } from "@/server/orders";
import type { CreateOrderInput } from "@/lib/validation/checkout";
import type { Mailer, MailMessage } from "@/lib/mailer";

/**
 * `src/jobs/worker.integration.test.ts` — test tiến trình worker END-TO-END
 * với pg-boss THẬT (`createTestBoss()`, `__test__enableSpies: true`) + fake
 * mailer (không mạng): đăng ký `registerOrderConfirmationWorker()` — ĐÚNG hàm
 * export từ `src/worker/index.ts`, không phải bản tự viết lại — rồi
 * `enqueueOrderConfirmation` trong 1 `testPrisma.$transaction` — dùng SPY để
 * chờ job `completed` (không dùng `setTimeout` cố định).
 *
 * Import `@/worker/index` KHÔNG chạy `main()` thật (không gọi
 * `mailerFromEnv()`, không khởi động boss thật, không đăng ký signal
 * handler) — `src/worker/index.ts` chỉ chạy `main()` khi được thực thi trực
 * tiếp, xem guard `isDirectExecution` ở cuối file đó.
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

async function makeCategory(name = "Giày Sneaker", slug?: string) {
  // `slug` unique trên `Category` — sinh hậu tố ngẫu nhiên mặc định để test
  // gọi `makeCategory()` nhiều lần trong CÙNG 1 test (vd. test batch 2 job)
  // không đụng khoá trùng.
  return testPrisma.category.create({
    data: { name, slug: slug ?? "giay-sneaker-" + Math.random().toString(36).slice(2, 8) },
  });
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

async function makeOrder(opts: { skipZone?: boolean } = {}) {
  // `skipZone`: bỏ qua tạo zone/province khi test cần nhiều đơn hàng dùng
  // CHUNG 1 tỉnh (`TEST_PROVINCE` có ràng buộc unique trên `ProvinceZone`) —
  // gọi `makeShippingZone()` một lần bên ngoài rồi truyền `skipZone: true`
  // cho các `makeOrder()` tiếp theo để tránh lỗi trùng khoá.
  if (!opts.skipZone) await makeShippingZone();
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
    await registerOrderConfirmationWorker(boss, { db: testPrisma, mailer });
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

  it("batch 2 job (2 đơn hàng khác nhau) → CẢ HAI đều được xử lý, không chỉ job đầu tiên", async () => {
    // Bắt regression cụ thể mà finding review nêu ra: nếu ai đó "đơn giản
    // hoá" vòng lặp `for (const job of jobs)` thành chỉ xử lý `jobs[0]`, pg-boss
    // v12 vẫn trao cả mảng job cho handler nên lỗi này sẽ lọt qua nếu test chỉ
    // enqueue 1 job. Ở đây enqueue 2 đơn hàng khác nhau trong 1 transaction rồi
    // chờ CẢ HAI cùng 'completed'.
    await makeShippingZone();
    const orderA = await makeOrder({ skipZone: true });
    const orderB = await makeOrder({ skipZone: true });
    const spy = boss.getSpy<{ orderCode: string }>(QUEUE_SEND_ORDER_CONFIRMATION);

    await testPrisma.$transaction(async (tx) => {
      await enqueueOrderConfirmation(tx, { orderCode: orderA.orderCode }, boss);
      await enqueueOrderConfirmation(tx, { orderCode: orderB.orderCode }, boss);
    });

    const [completedA, completedB] = await Promise.all([
      spy.waitForJob((data) => data.orderCode === orderA.orderCode, "completed"),
      spy.waitForJob((data) => data.orderCode === orderB.orderCode, "completed"),
    ]);

    expect(completedA.state).toBe("completed");
    expect(completedB.state).toBe("completed");
    // `orderA`/`orderB` dùng chung email mẫu (`baseInput()` không override) nên
    // so sánh `to` không phân biệt được 2 đơn — so theo `subject` (chứa
    // `orderCode`, xem `src/emails/order-confirmation.render.ts`) để chắc chắn
    // CẢ HAI job (không chỉ 1) thực sự được xử lý riêng biệt.
    expect(mailer.send).toHaveBeenCalledTimes(2);
    const subjects = mailer.messages.map((m) => m.subject);
    expect(subjects).toContain(`Đơn hàng ${orderA.orderCode} — leafshoes Việt Nam`);
    expect(subjects).toContain(`Đơn hàng ${orderB.orderCode} — leafshoes Việt Nam`);
  });
});
