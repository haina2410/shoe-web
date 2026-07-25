import { PgBoss, fromPrisma } from "pg-boss";
import type { PrismaTransactionLike } from "pg-boss";
import { z } from "zod";

/**
 * `src/jobs/queue.ts` — hàng đợi pg-boss phía app (chỉ ghi job). Worker xử lý
 * job (đọc + gửi mail) thuộc Task 3/4, KHÔNG nằm trong file này.
 */

/** Tên queue gửi email xác nhận đơn hàng. */
export const QUEUE_SEND_ORDER_CONFIRMATION = "send-order-confirmation";

/**
 * Payload job gửi email xác nhận đơn hàng. CHỈ chứa `orderCode` — KHÔNG được
 * chứa PII (email/SĐT/địa chỉ khách) vì payload này lưu thẳng trong bảng
 * `pgboss.job`. Worker (Task 3) tự tra `orderCode` → `Order` để lấy dữ liệu
 * cần thiết khi gửi mail.
 */
export const orderConfirmationJobSchema = z.object({
  orderCode: z.string().min(1),
});

export type OrderConfirmationJob = z.infer<typeof orderConfirmationJobSchema>;

/**
 * Tạo instance `PgBoss` mới (không cache). Dùng `createBoss()` khi cần một
 * instance tường minh (ví dụ test); code app nên dùng `getBoss()`.
 *
 * `supervise: false, schedule: false` mặc định vì instance phía app chỉ ghi
 * job (`send`/`enqueue`) trong transaction, không giám sát hàng đợi hay chạy
 * cron — việc đó thuộc về worker (Task 3), instance riêng.
 */
export function createBoss(options?: {
  connectionString?: string;
  supervise?: boolean;
  schedule?: boolean;
}): PgBoss {
  const connectionString = options?.connectionString ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL chưa được cấu hình");

  return new PgBoss({
    connectionString,
    schema: process.env.PGBOSS_SCHEMA ?? "pgboss",
    supervise: options?.supervise ?? false,
    schedule: options?.schedule ?? false,
  });
}

/**
 * Tạo (nếu chưa có) mọi queue mà app cần gửi job vào. `boss.createQueue` là
 * `INSERT ... ON CONFLICT DO NOTHING` phía pg-boss nên gọi nhiều lần an toàn
 * (idempotent) — phù hợp gọi lại mỗi lần khởi động app.
 */
export async function ensureQueues(boss: PgBoss): Promise<void> {
  await boss.createQueue(QUEUE_SEND_ORDER_CONFIRMATION);
}

const globalForBoss = globalThis as unknown as { bossPromise?: Promise<PgBoss> };

/**
 * Singleton phía app: `start()` rồi `ensureQueues()` một lần, cache PROMISE
 * trên `globalThis` (mirror `src/lib/prisma.ts`, dùng `globalThis` để HMR ở
 * dev không tạo nhiều pool) để nhiều lời gọi `getBoss()` đồng thời — kể cả
 * trước khi lần khởi tạo đầu tiên `start()` xong — đều dùng chung MỘT
 * instance/pool thay vì mỗi lời gọi tạo một cái mới.
 */
export async function getBoss(): Promise<PgBoss> {
  globalForBoss.bossPromise ??= (async () => {
    const boss = createBoss();
    await boss.start();
    await ensureQueues(boss);
    return boss;
  })();

  return globalForBoss.bossPromise;
}

/**
 * Ghi job gửi email xác nhận đơn hàng, TRONG CÙNG transaction Postgres với
 * `tx` (qua `fromPrisma(tx)`) — nếu `tx` rollback thì job cũng rollback theo,
 * đảm bảo không bao giờ có job mồ côi cho một đơn hàng chưa thực sự được tạo.
 *
 * `boss` là tham số tiêm tuỳ chọn (dùng cho test); mặc định lấy từ
 * `getBoss()` (singleton phía app).
 */
export async function enqueueOrderConfirmation(
  tx: PrismaTransactionLike,
  payload: OrderConfirmationJob,
  boss?: PgBoss,
): Promise<void> {
  const data = orderConfirmationJobSchema.parse(payload);
  const bossInstance = boss ?? (await getBoss());

  await bossInstance.send(QUEUE_SEND_ORDER_CONFIRMATION, data, {
    db: fromPrisma(tx),
  });
}
