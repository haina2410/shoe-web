import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { PgBoss } from "pg-boss";
import { testPrisma } from "@/test/db";
import { createTestBoss, resetQueues } from "@/test/boss";
import {
  QUEUE_SEND_ORDER_CONFIRMATION,
  ensureQueues,
  enqueueOrderConfirmation,
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

describe("ensureQueues", () => {
  it("gọi 2 lần liên tiếp không lỗi (idempotent)", async () => {
    await expect(ensureQueues(boss)).resolves.not.toThrow();
    await expect(ensureQueues(boss)).resolves.not.toThrow();
  });
});
