import "dotenv/config";
import { PgBoss } from "pg-boss";

/**
 * `src/test/boss.ts` — helper test-only cho pg-boss, trỏ vào
 * `DATABASE_URL_TEST` (Postgres test thật, cùng DB với `testPrisma`, xem
 * `src/test/db.ts`). KHÔNG dùng cho code production.
 *
 * `__test__enableSpies: true` bật `boss.getSpy(...)` (Task 3 dùng để chờ
 * job chuyển state trong test worker). Task này chưa cần spy nhưng bật sẵn
 * để không phải tạo lại instance ở Task 3.
 */
export function createTestBoss(): PgBoss {
  const connectionString = process.env.DATABASE_URL_TEST;
  if (!connectionString) throw new Error("DATABASE_URL_TEST chưa được cấu hình");

  return new PgBoss({
    connectionString,
    schema: process.env.PGBOSS_SCHEMA_TEST ?? "pgboss",
    supervise: false,
    schedule: false,
    __test__enableSpies: true,
  });
}

/**
 * Xoá sạch job còn sót lại từ lần chạy test trước (mọi queue), để mỗi test
 * bắt đầu từ trạng thái sạch. KHÔNG gọi trong `resetDb()` (`src/test/db.ts`)
 * vì `resetDb()` chạy trước khi schema `pgboss` chắc chắn tồn tại — helper
 * này chỉ dùng sau khi `boss.start()` đã tạo schema.
 */
export async function resetQueues(boss: PgBoss): Promise<void> {
  await boss.deleteAllJobs();
}
