import "dotenv/config";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Job, WorkOptions } from "pg-boss";
import { testPrisma, resetDb } from "@/test/db";
import { createOrderCore } from "@/server/orders";
import type { CreateOrderInput } from "@/lib/validation/checkout";
import type { Mailer, MailMessage } from "@/lib/mailer";
import {
  QUEUE_EXPIRE_UNPAID,
  QUEUE_SEND_ORDER_CONFIRMATION,
  QUEUE_SEND_PAYMENT_CONFIRMED,
  QUEUE_SEND_ZALO_ORDER_CREATED,
} from "@/jobs/queue";
import {
  registerExpireUnpaidWorker,
  registerOrderConfirmationWorker,
  registerPaymentConfirmedWorker,
  registerZaloOrderCreatedWorker,
  workerClientsFromEnv,
  requireAppBaseUrlForWorker,
  type WorkCapableBoss,
} from "@/worker/index";

/**
 * `src/worker/index.test.ts` — test HỢP ĐỒNG ĐĂNG KÝ của
 * `registerOrderConfirmationWorker()`, KHÔNG cần pg-boss thật (khác với
 * `src/jobs/worker.integration.test.ts` — test đó chạy end-to-end với pg-boss
 * thật nhưng KHÔNG bắt được regression "chỉ xử lý `jobs[0]`" vì pg-boss mặc
 * định `batchSize: 1` nên `for (const job of jobs)` và `jobs[0]` cho kết quả
 * giống hệt nhau khi hàng đợi chỉ giao 1 job/lần gọi — xem bình luận trong
 * file đó).
 *
 * Ở đây tiêm một `fakeBoss` TỐI THIỂU (chỉ có `work`, đúng
 * `WorkCapableBoss`) để BẮT ĐƯỢC handler thật mà
 * `registerOrderConfirmationWorker()` truyền cho `boss.work(...)`, rồi tự
 * gọi handler đó với MỘT MẢNG 2 job (giả lập batch — bất kể pg-boss thật có
 * bao giờ giao batch >1 hay không) và assert CẢ HAI job đều được xử lý. Test
 * này FAIL nếu handler bị "đơn giản hoá" thành chỉ xử lý `jobs[0]` — xem báo
 * cáo Task 3 (`/.superpowers/sdd/task-3-report.md`) để có bằng chứng thực
 * nghiệm (tạm sửa handler thành `jobs[0]`, chạy lại test này, thấy fail,
 * rồi phục hồi).
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
  if (!opts.skipZone) await makeShippingZone();
  const category = await makeCategory();
  const { variant } = await makeProductWithVariant({ categoryId: category.id });
  // F1 (final review Ngày 6): KHÔNG dùng deps mặc định của `createOrderCore`
  // (gọi `enqueueOrderConfirmation` thật → `getBoss()` → DATABASE_URL) — test
  // này chỉ cần đơn hàng làm fixture, việc enqueue/xử lý job thật do các test
  // dưới tự làm qua `boss`/`registerOrderConfirmationWorker` được tiêm riêng.
  return createOrderCore(
    testPrisma,
    baseInput({ items: [{ variantId: variant.id, quantity: 1 }] }),
    {
      enqueueOrderConfirmation: vi.fn().mockResolvedValue(undefined),
      enqueueZaloOrderCreatedNotifications: vi.fn().mockResolvedValue(undefined),
    },
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

function fakeZaloBot() {
  const messages: { chatId: string; text: string; parseMode?: "markdown" | "html" }[] = [];
  return {
    messages,
    sendMessage: vi.fn(async (message) => {
      messages.push(message);
    }),
  };
}

/** Job giả tối thiểu — chỉ điền field mà `handleSendOrderConfirmation` thực
 * sự đọc (`data`) + field bắt buộc theo type `Job<T>` của pg-boss. */
function fakeJob(orderCode: string): Job<unknown> {
  return {
    id: "job-" + Math.random().toString(36).slice(2, 8),
    name: QUEUE_SEND_ORDER_CONFIRMATION,
    data: { orderCode },
    expireInSeconds: 900,
    heartbeatSeconds: null,
    signal: new AbortController().signal,
  };
}

/** Fake boss TỐI THIỂU (đúng `WorkCapableBoss`) — chỉ bắt lại tham số truyền
 * cho `work(...)`, không chạy pg-boss thật (không kết nối DB queue). */
function createCapturingBoss(): WorkCapableBoss & {
  captured?: { name: string; options: WorkOptions; handler: (jobs: Job<unknown>[]) => Promise<void> };
} {
  const boss: ReturnType<typeof createCapturingBoss> = {
    async work(name, options, handler) {
      boss.captured = { name, options, handler };
      return "fake-work-id";
    },
  };
  return boss;
}

describe("registerOrderConfirmationWorker (hợp đồng đăng ký)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("đăng ký đúng tên queue send-order-confirmation", async () => {
    const boss = createCapturingBoss();
    const mailer = fakeMailer();

    await registerOrderConfirmationWorker(boss, { db: testPrisma, mailer });

    expect(boss.captured?.name).toBe(QUEUE_SEND_ORDER_CONFIRMATION);
  });

  it("handler xử lý CẢ HAI job trong 1 lần gọi (batch giả lập), không chỉ job đầu tiên", async () => {
    await makeShippingZone();
    const orderA = await makeOrder({ skipZone: true });
    const orderB = await makeOrder({ skipZone: true });

    const boss = createCapturingBoss();
    const mailer = fakeMailer();

    await registerOrderConfirmationWorker(boss, { db: testPrisma, mailer });
    const handler = boss.captured?.handler;
    expect(handler).toBeDefined();

    await handler!([fakeJob(orderA.orderCode), fakeJob(orderB.orderCode)]);

    expect(mailer.send).toHaveBeenCalledTimes(2);
    const recipients = mailer.messages.map((m) => m.subject);
    expect(recipients).toContain(`Đơn hàng ${orderA.orderCode} — leafshoes Việt Nam`);
    expect(recipients).toContain(`Đơn hàng ${orderB.orderCode} — leafshoes Việt Nam`);
  });

  it("job thất bại (mailer.send throw) → console.error 1 dòng chứa queue/jobId/orderCode (KHÔNG PII) VÀ vẫn rethrow cho pg-boss (F5)", async () => {
    const order = await makeOrder();
    const boss = createCapturingBoss();
    const mailer: Mailer & { messages: MailMessage[] } = {
      messages: [],
      send: vi.fn().mockRejectedValue(new Error("Gửi email thất bại (application_error): lỗi giả lập")),
    };
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await registerOrderConfirmationWorker(boss, { db: testPrisma, mailer });
    const handler = boss.captured?.handler;
    expect(handler).toBeDefined();

    await expect(handler!([fakeJob(order.orderCode)])).rejects.toThrow("lỗi giả lập");

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const logged = consoleErrorSpy.mock.calls[0].join(" ");
    expect(logged).toContain(QUEUE_SEND_ORDER_CONFIRMATION);
    expect(logged).toContain(order.orderCode);
    expect(logged).toContain("lỗi giả lập");
    // Không chứa PII của khách hàng (email dùng trong baseInput()).
    expect(logged).not.toContain("khach@example.com");

    consoleErrorSpy.mockRestore();
  });
});

describe("registerPaymentConfirmedWorker (hợp đồng đăng ký)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("đăng ký đúng queue send-payment-confirmed", async () => {
    const boss = createCapturingBoss();

    await registerPaymentConfirmedWorker(boss, {
      db: testPrisma,
      mailer: fakeMailer(),
    });

    expect(boss.captured?.name).toBe(QUEUE_SEND_PAYMENT_CONFIRMED);
  });

  it("handler xử lý toàn bộ job trong batch", async () => {
    await makeShippingZone();
    const orderA = await makeOrder({ skipZone: true });
    const orderB = await makeOrder({ skipZone: true });
    const boss = createCapturingBoss();
    const mailer = fakeMailer();

    await registerPaymentConfirmedWorker(boss, { db: testPrisma, mailer });
    await boss.captured?.handler([
      { ...fakeJob(orderA.orderCode), name: QUEUE_SEND_PAYMENT_CONFIRMED },
      { ...fakeJob(orderB.orderCode), name: QUEUE_SEND_PAYMENT_CONFIRMED },
    ]);

    expect(mailer.send).toHaveBeenCalledTimes(2);
    expect(mailer.messages.map((message) => message.subject)).toEqual(
      expect.arrayContaining([
        expect.stringContaining(orderA.orderCode),
        expect.stringContaining(orderB.orderCode),
      ]),
    );
  });

  it("lỗi handler → log không PII rồi rethrow", async () => {
    const order = await makeOrder();
    const boss = createCapturingBoss();
    const mailer: Mailer = {
      send: vi.fn().mockRejectedValue(new Error("lỗi gửi giả lập")),
    };
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await registerPaymentConfirmedWorker(boss, { db: testPrisma, mailer });
      const job = {
        ...fakeJob(order.orderCode),
        name: QUEUE_SEND_PAYMENT_CONFIRMED,
      };

      await expect(boss.captured?.handler([job])).rejects.toThrow(
        "lỗi gửi giả lập",
      );

      const logged = consoleErrorSpy.mock.calls.flat().join(" ");
      expect(logged).toContain(QUEUE_SEND_PAYMENT_CONFIRMED);
      expect(logged).toContain(order.orderCode);
      expect(logged).not.toContain(order.email);
      expect(logged).not.toContain(order.phone);
      expect(logged).not.toContain(order.addressLine);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});

describe("registerZaloOrderCreatedWorker", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("registers the Zalo queue and handles every job in a batch", async () => {
    await makeShippingZone();
    const orderA = await makeOrder({ skipZone: true });
    const orderB = await makeOrder({ skipZone: true });
    const boss = createCapturingBoss();
    const bot = fakeZaloBot();

    await registerZaloOrderCreatedWorker(boss, {
      db: testPrisma,
      bot,
      recipients: [{ key: "staff-hanoi", chatId: "1000001" }],
    });

    expect(boss.captured?.name).toBe(QUEUE_SEND_ZALO_ORDER_CREATED);
    await boss.captured?.handler([
      { ...fakeJob(orderA.orderCode), name: QUEUE_SEND_ZALO_ORDER_CREATED, data: { orderCode: orderA.orderCode, recipientKey: "staff-hanoi" } },
      { ...fakeJob(orderB.orderCode), name: QUEUE_SEND_ZALO_ORDER_CREATED, data: { orderCode: orderB.orderCode, recipientKey: "staff-hanoi" } },
    ]);

    expect(bot.sendMessage).toHaveBeenCalledTimes(2);
    expect(bot.messages.map((message) => message.chatId)).toEqual(["1000001", "1000001"]);
  });

  it("logs only Zalo queue, job, and order identifiers then rethrows failures", async () => {
    const order = await makeOrder();
    const boss = createCapturingBoss();
    const bot = fakeZaloBot();
    bot.sendMessage.mockRejectedValue(
      new Error("customer@example.com 0901234567 123 Private Street"),
    );
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await registerZaloOrderCreatedWorker(boss, {
        db: testPrisma,
        bot,
        recipients: [{ key: "staff-hanoi", chatId: "1000001" }],
      });
      const job = {
        ...fakeJob(order.orderCode),
        id: "zalo-job-1",
        name: QUEUE_SEND_ZALO_ORDER_CREATED,
        data: { orderCode: order.orderCode, recipientKey: "staff-hanoi" },
      };

      await expect(boss.captured?.handler([job])).rejects.toThrow("customer@example.com");

      const logged = consoleErrorSpy.mock.calls.flat().join(" ");
      expect(logged).toContain(QUEUE_SEND_ZALO_ORDER_CREATED);
      expect(logged).toContain("zalo-job-1");
      expect(logged).toContain(order.orderCode);
      expect(logged).not.toContain("customer@example.com");
      expect(logged).not.toContain("0901234567");
      expect(logged).not.toContain("123 Private Street");
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});

describe("registerExpireUnpaidWorker (hợp đồng đăng ký)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("đăng ký đúng queue và xử lý toàn bộ batch bằng handler thật", async () => {
    await makeShippingZone();
    const orders = await Promise.all([
      makeOrder({ skipZone: true }),
      makeOrder({ skipZone: true }),
    ]);
    await testPrisma.order.updateMany({
      where: { id: { in: orders.map((order) => order.id) } },
      data: { createdAt: new Date("2026-07-23T00:00:00.000Z") },
    });
    const boss = createCapturingBoss();
    const updateManySpy = vi.spyOn(testPrisma.order, "updateMany");

    try {
      await registerExpireUnpaidWorker(boss, { db: testPrisma });
      expect(boss.captured?.name).toBe(QUEUE_EXPIRE_UNPAID);

      await boss.captured?.handler([
        { ...fakeJob("ignored-a"), name: QUEUE_EXPIRE_UNPAID, data: {} },
        { ...fakeJob("ignored-b"), name: QUEUE_EXPIRE_UNPAID, data: {} },
      ]);

      expect(updateManySpy).toHaveBeenCalledTimes(2);
      const expired = await testPrisma.order.count({
        where: { status: "EXPIRED" },
      });
      expect(expired).toBe(2);
    } finally {
      updateManySpy.mockRestore();
    }
  });

  it("lỗi handler chỉ log metadata job không PII rồi rethrow", async () => {
    const boss = createCapturingBoss();
    const updateManySpy = vi
      .spyOn(testPrisma.order, "updateMany")
      .mockRejectedValue(
        new Error("khach@example.com 0901234567 1 Phố Thử Nghiệm"),
      );
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await registerExpireUnpaidWorker(boss, { db: testPrisma });
      const job = {
        ...fakeJob("ignored"),
        id: "expire-job-1",
        name: QUEUE_EXPIRE_UNPAID,
        data: {
          email: "khach@example.com",
          phone: "0901234567",
          address: "1 Phố Thử Nghiệm",
        },
      };

      await expect(boss.captured?.handler([job])).rejects.toThrow(
        "khach@example.com",
      );

      const logged = consoleErrorSpy.mock.calls.flat().join(" ");
      expect(logged).toContain(QUEUE_EXPIRE_UNPAID);
      expect(logged).toContain("expire-job-1");
      expect(logged).not.toContain("khach@example.com");
      expect(logged).not.toContain("0901234567");
      expect(logged).not.toContain("1 Phố Thử Nghiệm");
    } finally {
      updateManySpy.mockRestore();
      consoleErrorSpy.mockRestore();
    }
  });
});

describe("requireAppBaseUrlForWorker() (F7)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("thiếu APP_BASE_URL → throw, nêu tên biến, KHÔNG dùng mặc định localhost", () => {
    vi.stubEnv("APP_BASE_URL", "");

    expect(() => requireAppBaseUrlForWorker()).toThrow(/APP_BASE_URL/);
  });

  it("có APP_BASE_URL → không throw", () => {
    vi.stubEnv("APP_BASE_URL", "https://leafshoes.vn");

    expect(() => requireAppBaseUrlForWorker()).not.toThrow();
  });
});

describe("workerClientsFromEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects a missing BOT_TOKEN during worker initialization", () => {
    vi.stubEnv("RESEND_API_KEY", "resend-test-key");
    vi.stubEnv("MAIL_FROM", "orders@example.com");
    vi.stubEnv("BOT_TOKEN", "");

    expect(() => workerClientsFromEnv()).toThrow(/BOT_TOKEN/);
  });
});
