import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { PgBoss } from "pg-boss";
import { testPrisma } from "@/test/db";
import { createTestBoss, resetQueues } from "@/test/boss";
import { createProductCore, updateProductCore } from "@/server/products";
import { handleDeleteProductImage } from "@/jobs/handlers/delete-product-image";
import type { CreateProductInput, UpdateProductInput } from "@/lib/validation/product";
import {
  QUEUE_EXPIRE_UNPAID,
  QUEUE_SEND_ORDER_CONFIRMATION,
  QUEUE_SEND_PAYMENT_CONFIRMED,
  QUEUE_SEND_ZALO_ORDER_CREATED,
  QUEUE_DELETE_PRODUCT_IMAGE,
  ensureQueues,
  ensureSchedules,
  enqueueOrderConfirmation,
  enqueuePaymentConfirmed,
  enqueueZaloOrderCreatedNotifications,
  enqueueDeleteProductImage,
} from "@/jobs/queue";

/**
 * `src/jobs/queue.integration.test.ts` — integration test cho hàng đợi
 * pg-boss (`src/jobs/queue.ts`), test bằng pg-boss THẬT trên `leafshoes_test`
 * (cùng DB với `testPrisma`, xem `src/test/db.ts` + `src/test/boss.ts`).
 *
 * Trọng tâm: test rollback (#2) là bằng chứng tính NGUYÊN TỬ giữa việc ghi
 * business data qua `testPrisma.$transaction` và việc enqueue job — job PHẢI
 * được ghi qua `fromPrisma(tx)` (chạy trong CÙNG transaction Postgres), nếu
 * không test này sẽ fail khi transaction rollback.
 */

let boss: PgBoss;

beforeAll(async () => {
  boss = createTestBoss();
  await boss.start();
  await ensureQueues(boss);
});

afterAll(async () => {
  await boss.stop();
});

beforeEach(async () => {
  await resetQueues(boss);
});

/**
 * `getQueueStats` giữ cache đếm theo thời gian (kể cả `{ force: true }` vẫn
 * có thể tái dùng kết quả tính trong ~1 phút gần nhất — xem comment trong
 * `pg-boss/dist/manager.js`), nên KHÔNG dùng để assert trong test chạy nhanh
 * liên tiếp. Dùng `findJobs` lọc theo `data.orderCode` (mỗi test 1 orderCode
 * riêng) — hàm này luôn query thẳng bảng job, không qua cache.
 */
async function findJobsByOrderCode(boss: PgBoss, orderCode: string) {
  return boss.findJobs<{ orderCode: string }>(QUEUE_SEND_ORDER_CONFIRMATION, {
    data: { orderCode },
  });
}

describe("enqueueOrderConfirmation", () => {
  it("transaction commit → job tồn tại trong queue với payload { orderCode } đúng", async () => {
    await testPrisma.$transaction(async (tx) => {
      await enqueueOrderConfirmation(tx, { orderCode: "LEAFCMIT01" }, boss);
    });

    const jobs = await findJobsByOrderCode(boss, "LEAFCMIT01");
    expect(jobs).toHaveLength(1);
    expect(jobs[0].data).toEqual({ orderCode: "LEAFCMIT01" });
  });

  it("transaction rollback (throw ở cuối) → KHÔNG có job nào được tạo (bằng chứng nguyên tử fromPrisma(tx))", async () => {
    await expect(
      testPrisma.$transaction(async (tx) => {
        await enqueueOrderConfirmation(tx, { orderCode: "LEAFROLL01" }, boss);
        throw new Error("Buộc rollback để kiểm tra tính nguyên tử");
      }),
    ).rejects.toThrow("Buộc rollback để kiểm tra tính nguyên tử");

    const jobs = await findJobsByOrderCode(boss, "LEAFROLL01");
    expect(jobs).toHaveLength(0);
  });

  it("payload thiếu orderCode → throw trước khi gọi boss.send (không tạo job nào trong queue)", async () => {
    await expect(
      testPrisma.$transaction(async (tx) => {
        // @ts-expect-error cố tình thiếu orderCode để kiểm tra validation
        await enqueueOrderConfirmation(tx, {}, boss);
      }),
    ).rejects.toThrow();

    const jobs = await boss.findJobs(QUEUE_SEND_ORDER_CONFIRMATION, {});
    expect(jobs).toHaveLength(0);
  });
});

describe("enqueuePaymentConfirmed", () => {
  it("transaction commit → job chỉ chứa { orderCode }", async () => {
    await testPrisma.$transaction(async (tx) => {
      await enqueuePaymentConfirmed(
        tx,
        {
          orderCode: "LEAFPCMIT1",
          // @ts-expect-error PII phải bị schema loại trước khi ghi job
          email: "must-not-persist@example.com",
        },
        boss,
      );
    });

    const jobs = await boss.findJobs<{ orderCode: string }>(
      QUEUE_SEND_PAYMENT_CONFIRMED,
      { data: { orderCode: "LEAFPCMIT1" } },
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0].data).toEqual({ orderCode: "LEAFPCMIT1" });
  });

  it("transaction rollback → không tạo job xác nhận thanh toán", async () => {
    await expect(
      testPrisma.$transaction(async (tx) => {
        await enqueuePaymentConfirmed(tx, { orderCode: "LEAFPROLL1" }, boss);
        throw new Error("Buộc rollback payment job");
      }),
    ).rejects.toThrow("Buộc rollback payment job");

    const jobs = await boss.findJobs<{ orderCode: string }>(
      QUEUE_SEND_PAYMENT_CONFIRMED,
      { data: { orderCode: "LEAFPROLL1" } },
    );
    expect(jobs).toHaveLength(0);
  });
});

describe("enqueueZaloOrderCreatedNotifications", () => {
  it("transaction commit creates one recipient-scoped job per configured recipient", async () => {
    await testPrisma.$transaction(async (tx) => {
      await enqueueZaloOrderCreatedNotifications(
        tx,
        { orderCode: "LEAFZAL001" },
        boss,
        [
          { key: "staff-hanoi", chatId: "1000001" },
          { key: "staff-saigon", chatId: "1000002" },
        ],
      );
    });

    const jobs = await boss.findJobs<{ orderCode: string; recipientKey: string }>(
      QUEUE_SEND_ZALO_ORDER_CREATED,
      { data: { orderCode: "LEAFZAL001" } },
    );
    expect(jobs).toHaveLength(2);
    expect(jobs.map((job) => job.data)).toEqual(
      expect.arrayContaining([
        { orderCode: "LEAFZAL001", recipientKey: "staff-hanoi" },
        { orderCode: "LEAFZAL001", recipientKey: "staff-saigon" },
      ]),
    );
  });

  it("transaction rollback leaves no recipient-scoped Zalo jobs", async () => {
    await expect(
      testPrisma.$transaction(async (tx) => {
        await enqueueZaloOrderCreatedNotifications(
          tx,
          { orderCode: "LEAFZAL002" },
          boss,
          [{ key: "staff-hanoi", chatId: "1000001" }],
        );
        throw new Error("rollback Zalo jobs");
      }),
    ).rejects.toThrow("rollback Zalo jobs");

    const jobs = await boss.findJobs(QUEUE_SEND_ZALO_ORDER_CREATED, {
      data: { orderCode: "LEAFZAL002" },
    });
    expect(jobs).toHaveLength(0);
  });
});

describe("enqueueDeleteProductImage", () => {
  const url = "/api/uploads/products/123e4567-e89b-12d3-a456-426614174000.webp";

  it("commits the cleanup hint with the caller transaction", async () => {
    await testPrisma.$transaction((tx) =>
      enqueueDeleteProductImage(tx, { url }, boss),
    );
    const jobs = await boss.findJobs(QUEUE_DELETE_PRODUCT_IMAGE, { data: { url } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].data).toEqual({ url });
  });

  it("rolls back a cleanup hint with the caller transaction", async () => {
    await expect(
      testPrisma.$transaction(async (tx) => {
        await enqueueDeleteProductImage(tx, { url }, boss);
        throw new Error("rollback image cleanup hint");
      }),
    ).rejects.toThrow("rollback image cleanup hint");
    expect(await boss.findJobs(QUEUE_DELETE_PRODUCT_IMAGE, { data: { url } })).toHaveLength(0);
  });
});

describe("product update image cleanup pipeline", () => {
  async function setup(urls: string[]) {
    const directory = await mkdtemp(path.join(tmpdir(), "image-cleanup-pipeline-"));
    vi.stubEnv("UPLOAD_DIR", directory);
    const folder = path.join(directory, "products");
    await mkdir(folder);
    for (const url of urls) await writeFile(path.join(folder, path.basename(url)), "image");
    const category = await testPrisma.category.create({
      data: { name: `Cleanup ${randomUUID()}`, slug: randomUUID() },
    });
    const input: CreateProductInput = {
      product: {
        name: `Cleanup product ${randomUUID()}`,
        categoryId: category.id,
        basePrice: 100,
        status: "DRAFT",
      },
      variants: [{ size: "40", color: "Black", sku: `CLEAN-${randomUUID()}`, stock: 2 }],
      imageSets: [{
        color: "Black",
        position: 0,
        isDefault: true,
        images: urls.map((url, position) => ({ url, position })),
      }],
    };
    const product = await createProductCore(testPrisma, input);
    const update: UpdateProductInput = {
      product: { ...input.product },
      variants: product.variants.map((variant) => ({
        id: variant.id,
        size: variant.size,
        color: variant.color,
        sku: variant.sku,
        stock: variant.stock,
        expectedStock: variant.stock,
        priceOverride: variant.priceOverride,
      })),
      imageSets: [],
    };
    return { directory, categoryId: category.id, productId: product.id, update };
  }

  async function cleanupFixture(fixture: Awaited<ReturnType<typeof setup>>) {
    await testPrisma.product.deleteMany({ where: { id: fixture.productId } });
    await testPrisma.category.deleteMany({ where: { id: fixture.categoryId } });
    await rm(fixture.directory, { recursive: true, force: true });
    vi.unstubAllEnvs();
  }

  it("commits removed-image jobs with product updates and deletes files asynchronously", async () => {
    const urls = [
      `/api/uploads/products/${randomUUID()}.webp`,
      `/api/uploads/products/${randomUUID()}.jpg`,
    ];
    const fixture = await setup(urls);
    try {
      await updateProductCore(testPrisma, fixture.productId, fixture.update, {
        enqueueDeleteProductImage: (tx, payload) => enqueueDeleteProductImage(tx, payload, boss),
      });
      for (const url of urls) {
        const jobs = await boss.findJobs(QUEUE_DELETE_PRODUCT_IMAGE, { data: { url } });
        expect(jobs).toHaveLength(1);
        await handleDeleteProductImage({ db: testPrisma }, jobs[0].data);
        await expect(lstat(path.join(fixture.directory, "products", path.basename(url)))).rejects.toMatchObject({ code: "ENOENT" });
      }
    } finally {
      await cleanupFixture(fixture);
    }
  });

  it("rolls back all jobs and image references if a batch enqueue fails", async () => {
    const urls = [
      `/api/uploads/products/${randomUUID()}.webp`,
      `/api/uploads/products/${randomUUID()}.jpg`,
    ];
    const fixture = await setup(urls);
    let calls = 0;
    try {
      await expect(
        updateProductCore(testPrisma, fixture.productId, fixture.update, {
          enqueueDeleteProductImage: async (tx, payload) => {
            calls += 1;
            if (calls === 2) throw new Error("second enqueue failed");
            await enqueueDeleteProductImage(tx, payload, boss);
          },
        }),
      ).rejects.toThrow("second enqueue failed");
      expect(await testPrisma.productImage.count({ where: { url: { in: urls } } })).toBe(2);
      for (const url of urls) {
        expect(await boss.findJobs(QUEUE_DELETE_PRODUCT_IMAGE, { data: { url } })).toHaveLength(0);
      }
    } finally {
      await cleanupFixture(fixture);
    }
  });
});

describe("ensureQueues", () => {
  it("gọi 2 lần liên tiếp không lỗi (idempotent)", async () => {
    await expect(ensureQueues(boss)).resolves.not.toThrow();
    await expect(ensureQueues(boss)).resolves.not.toThrow();
  });

  it("áp dụng retryLimit/retryDelay/retryBackoff đúng đặc tả chống mất email khi Resend lỗi tạm thời (F5)", async () => {
    await ensureQueues(boss);

    const queue = await boss.getQueue(QUEUE_SEND_ORDER_CONFIRMATION);

    expect(queue?.retryLimit).toBe(5);
    expect(queue?.retryDelay).toBe(60);
    expect(queue?.retryBackoff).toBe(true);

    const paymentQueue = await boss.getQueue(QUEUE_SEND_PAYMENT_CONFIRMED);
    expect(paymentQueue?.retryLimit).toBe(5);
    expect(paymentQueue?.retryDelay).toBe(60);
    expect(paymentQueue?.retryBackoff).toBe(true);

    expect(await boss.getQueue(QUEUE_EXPIRE_UNPAID)).not.toBeNull();
  });

  it("hội tụ về ĐÚNG options hiện tại kể cả khi queue đã tồn tại từ trước với options CŨ (updateQueue, không chỉ createQueue — F5)", async () => {
    // `createQueue` là INSERT ... ON CONFLICT DO NOTHING nên KHÔNG áp dụng
    // options cho một hàng đã tồn tại — mô phỏng đúng ca đó: đổi queue hiện
    // có về options "cũ" (giống một bản dev/test được tạo trước khi
    // QUEUE_RETRY_OPTIONS tồn tại) rồi gọi lại `ensureQueues()` — phải hội tụ
    // về đúng options mới.
    await boss.updateQueue(QUEUE_SEND_ORDER_CONFIRMATION, {
      retryLimit: 1,
      retryDelay: 0,
      retryBackoff: false,
    });

    const before = await boss.getQueue(QUEUE_SEND_ORDER_CONFIRMATION);
    expect(before?.retryLimit).toBe(1);
    expect(before?.retryBackoff).toBe(false);

    await ensureQueues(boss);

    const after = await boss.getQueue(QUEUE_SEND_ORDER_CONFIRMATION);
    expect(after?.retryLimit).toBe(5);
    expect(after?.retryDelay).toBe(60);
    expect(after?.retryBackoff).toBe(true);
  });
});

describe("ensureSchedules", () => {
  it("gọi lặp hội tụ về một schedule ổn định với cron */15, timezone UTC và key cố định", async () => {
    await ensureQueues(boss);
    await ensureSchedules(boss);
    await ensureSchedules(boss);

    const schedules = await boss.getSchedules(
      QUEUE_EXPIRE_UNPAID,
      "expire-unpaid-15m",
    );

    expect(schedules).toHaveLength(1);
    expect(schedules[0]).toMatchObject({
      name: QUEUE_EXPIRE_UNPAID,
      key: "expire-unpaid-15m",
      cron: "*/15 * * * *",
      timezone: "UTC",
      data: {},
    });
  });
});
