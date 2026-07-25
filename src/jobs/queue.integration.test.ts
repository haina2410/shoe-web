import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { PgBoss } from "pg-boss";
import { testPrisma } from "@/test/db";
import { createTestBoss, resetQueues } from "@/test/boss";
import {
  QUEUE_EXPIRE_UNPAID,
  QUEUE_SEND_ORDER_CONFIRMATION,
  QUEUE_SEND_PAYMENT_CONFIRMED,
  ensureQueues,
  ensureSchedules,
  enqueueOrderConfirmation,
  enqueuePaymentConfirmed,
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
      await enqueueOrderConfirmation(tx, { orderCode: "LEAF-COMMIT1" }, boss);
    });

    const jobs = await findJobsByOrderCode(boss, "LEAF-COMMIT1");
    expect(jobs).toHaveLength(1);
    expect(jobs[0].data).toEqual({ orderCode: "LEAF-COMMIT1" });
  });

  it("transaction rollback (throw ở cuối) → KHÔNG có job nào được tạo (bằng chứng nguyên tử fromPrisma(tx))", async () => {
    await expect(
      testPrisma.$transaction(async (tx) => {
        await enqueueOrderConfirmation(tx, { orderCode: "LEAF-ROLLBACK1" }, boss);
        throw new Error("Buộc rollback để kiểm tra tính nguyên tử");
      }),
    ).rejects.toThrow("Buộc rollback để kiểm tra tính nguyên tử");

    const jobs = await findJobsByOrderCode(boss, "LEAF-ROLLBACK1");
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
          orderCode: "LEAF-PAIDCOMMIT",
          // @ts-expect-error PII phải bị schema loại trước khi ghi job
          email: "must-not-persist@example.com",
        },
        boss,
      );
    });

    const jobs = await boss.findJobs<{ orderCode: string }>(
      QUEUE_SEND_PAYMENT_CONFIRMED,
      { data: { orderCode: "LEAF-PAIDCOMMIT" } },
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0].data).toEqual({ orderCode: "LEAF-PAIDCOMMIT" });
  });

  it("transaction rollback → không tạo job xác nhận thanh toán", async () => {
    await expect(
      testPrisma.$transaction(async (tx) => {
        await enqueuePaymentConfirmed(tx, { orderCode: "LEAF-PAIDROLLBACK" }, boss);
        throw new Error("Buộc rollback payment job");
      }),
    ).rejects.toThrow("Buộc rollback payment job");

    const jobs = await boss.findJobs<{ orderCode: string }>(
      QUEUE_SEND_PAYMENT_CONFIRMED,
      { data: { orderCode: "LEAF-PAIDROLLBACK" } },
    );
    expect(jobs).toHaveLength(0);
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
