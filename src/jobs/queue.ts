import { PgBoss, fromPrisma } from "pg-boss";
import type { PrismaTransactionLike } from "pg-boss";
import { z } from "zod";

/**
 * `src/jobs/queue.ts` — hàng đợi pg-boss phía app (chỉ ghi job). Worker xử lý
 * job (đọc + gửi mail) thuộc Task 3/4, KHÔNG nằm trong file này.
 */

/** Tên queue gửi email xác nhận đơn hàng. */
export const QUEUE_SEND_ORDER_CONFIRMATION = "send-order-confirmation";
export const QUEUE_SEND_PAYMENT_CONFIRMED = "send-payment-confirmed";
export const QUEUE_EXPIRE_UNPAID = "expire-unpaid";

const ORDER_CODE_PATTERN = /^LEAF[A-Z0-9]{6}$/;

/**
 * Payload job gửi email xác nhận đơn hàng. CHỈ chứa `orderCode` — KHÔNG được
 * chứa PII (email/SĐT/địa chỉ khách) vì payload này lưu thẳng trong bảng
 * `pgboss.job`. Worker (Task 3) tự tra `orderCode` → `Order` để lấy dữ liệu
 * cần thiết khi gửi mail.
 */
export const orderConfirmationJobSchema = z.object({
  orderCode: z.string().regex(ORDER_CODE_PATTERN),
});

export type OrderConfirmationJob = z.infer<typeof orderConfirmationJobSchema>;

/** Payload xác nhận thanh toán chỉ mang khoá tra cứu, tuyệt đối không có PII. */
export const paymentConfirmedJobSchema = z.object({
  orderCode: z.string().regex(ORDER_CODE_PATTERN),
});

export type PaymentConfirmedJob = z.infer<typeof paymentConfirmedJobSchema>;

/**
 * Tạo instance `PgBoss` mới (không cache). Dùng `createBoss()` khi cần một
 * instance tường minh (ví dụ test); code app nên dùng `getBoss()`.
 *
 * `supervise: false, schedule: false` mặc định vì instance phía app chỉ ghi
 * job (`send`/`enqueue`) trong transaction, không giám sát hàng đợi hay chạy
 * cron — việc đó thuộc về worker (Task 3), instance riêng.
 *
 * BẢO VỆ (F1, final review Ngày 6): khi KHÔNG truyền `connectionString` tường
 * minh — tức đang định dùng `DATABASE_URL` (database DÀNH CHO APP, không
 * phải test) — và `NODE_ENV === "test"`, ném lỗi ngay thay vì âm thầm mở kết
 * nối. Test chạy bằng `vitest` (mặc định tự set `NODE_ENV=test`) nhưng
 * `enqueueOrderConfirmation`/`createOrderCore` mặc định vẫn gọi
 * `getBoss()` → `createBoss()` KHÔNG tham số nếu test quên tiêm deps giả —
 * khi đó `boss.start()`/`ensureQueues()`/`send()` chạy thẳng vào
 * `leafshoes_development` (giá trị thật của `DATABASE_URL` lúc chạy test),
 * để lại schema `pgboss` + job rác trong DB PHÁT TRIỂN (đã xảy ra thật, xem
 * báo cáo review cuối Ngày 6). Guard này buộc mọi lời gọi `createBoss()`
 * trong test PHẢI tiêm `connectionString` tường minh (thường là
 * `createTestBoss()` ở `src/test/boss.ts`, trỏ `DATABASE_URL_TEST`) — không
 * ảnh hưởng `npm run dev`/`npm run build`/`npm run start`/`npm run worker`
 * (NODE_ENV ở các lệnh đó là `development`/`production`, không phải `test`).
 */
export function createBoss(options?: {
  connectionString?: string;
  supervise?: boolean;
  schedule?: boolean;
}): PgBoss {
  if (options?.connectionString === undefined && process.env.NODE_ENV === "test") {
    throw new Error(
      "createBoss() bị chặn: đang chạy trong môi trường test (NODE_ENV=test) nhưng " +
        "không có `connectionString` tường minh nào được truyền vào — mặc định sẽ " +
        "dùng DATABASE_URL (database phát triển), có thể ghi schema `pgboss` và job " +
        "rác vào đó. Test PHẢI tiêm boss test tường minh (xem " +
        "`src/test/boss.ts#createTestBoss()`, trỏ DATABASE_URL_TEST) thay vì dựa vào " +
        "deps mặc định của `createOrderCore`/`enqueueOrderConfirmation`.",
    );
  }

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
 * Tuỳ chọn retry/backoff cho queue `send-order-confirmation` (F5, final
 * review Ngày 6): mặc định pg-boss (`retryLimit: 2, retryDelay: 0`, không
 * backoff) đốt hết số lần thử gần như NGAY LẬP TỨC — một lỗi 429/5xx tạm thời
 * từ Resend là mất luôn email xác nhận, không ai biết. `retryLimit: 5` +
 * `retryDelay: 60` (giây) + `retryBackoff: true` giãn cách các lần thử
 * (exponential, nền `retryDelay`) để có cơ hội chờ nhà cung cấp hồi phục.
 * `batchSize` CỐ Ý không set — giữ mặc định `1` (xem `registerOrderConfirmationWorker`,
 * `src/worker/index.ts`): batch nhiều job/lần gọi sẽ làm 1 job lỗi kéo theo
 * các job lành mạnh khác trong cùng lần fetch.
 */
const QUEUE_RETRY_OPTIONS = {
  retryLimit: 5,
  retryDelay: 60,
  retryBackoff: true,
} as const;

/**
 * Tạo (nếu chưa có) mọi queue mà app cần gửi job vào. `boss.createQueue` là
 * `INSERT ... ON CONFLICT DO NOTHING` phía pg-boss nên gọi nhiều lần an toàn
 * (idempotent) — phù hợp gọi lại mỗi lần khởi động app.
 *
 * `createQueue` KHÔNG áp dụng `options` cho một queue đã tồn tại từ trước
 * (vd. queue được tạo bởi một bản chạy dev/test cũ hơn, trước khi
 * `QUEUE_RETRY_OPTIONS` tồn tại) — `ON CONFLICT DO NOTHING` bỏ qua toàn bộ
 * câu lệnh, kể cả phần cập nhật cột options. Gọi thêm `boss.updateQueue` (một
 * `UPDATE` thật, không điều kiện tồn tại) ngay sau đó để MỌI lần khởi động —
 * kể cả vào một queue đã có sẵn với options cũ — đều hội tụ về đúng
 * `QUEUE_RETRY_OPTIONS` hiện tại (xem `src/jobs/queue.integration.test.ts`).
 */
export async function ensureQueues(boss: PgBoss): Promise<void> {
  await boss.createQueue(QUEUE_SEND_ORDER_CONFIRMATION, QUEUE_RETRY_OPTIONS);
  await boss.updateQueue(QUEUE_SEND_ORDER_CONFIRMATION, QUEUE_RETRY_OPTIONS);
  await boss.createQueue(QUEUE_SEND_PAYMENT_CONFIRMED, QUEUE_RETRY_OPTIONS);
  await boss.updateQueue(QUEUE_SEND_PAYMENT_CONFIRMED, QUEUE_RETRY_OPTIONS);
  await boss.createQueue(QUEUE_EXPIRE_UNPAID, QUEUE_RETRY_OPTIONS);
  await boss.updateQueue(QUEUE_EXPIRE_UNPAID, QUEUE_RETRY_OPTIONS);
}

/**
 * Đăng ký cron ổn định cho worker. Chỉ tiến trình worker gọi hàm này sau
 * `ensureQueues()`; singleton phía app giữ `schedule:false` và không gọi nó.
 */
export async function ensureSchedules(boss: PgBoss): Promise<void> {
  await boss.schedule(
    QUEUE_EXPIRE_UNPAID,
    "*/15 * * * *",
    {},
    { tz: "UTC", key: "expire-unpaid-15m" },
  );
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
    // `boss.start()` TỰ NÓ có thể throw (vd. role DB thiếu quyền CREATE trên
    // schema `pgboss` — cứng hoá production bình thường) — nhưng pg-boss mở
    // pool kết nối từ RẤT SỚM bên trong `start()` (xem `node_modules/pg-boss/
    // dist/index.js#start()`/`#doStart()`: cờ nội bộ `#stopped` được đặt
    // `false` TRƯỚC KHI bất kỳ subsystem nào chạy, chính là để `stop()` vẫn
    // dọn được dù `#doStart()` throw giữa chừng) — nên một `start()` thất bại
    // cũng để lại pool không ai còn tham chiếu nếu không `stop()` ở đây (F4,
    // final review Ngày 6). Gộp CẢ `start()` lẫn `ensureQueues()` vào cùng
    // một khối try để cả hai đường thất bại đều được dọn giống nhau. `stop()`
    // tự thất bại thì KHÔNG được che lỗi gốc — chỉ log rồi vẫn ném lỗi gốc.
    try {
      await boss.start();
      await ensureQueues(boss);
    } catch (error: unknown) {
      await boss.stop().catch((stopError: unknown) => {
        console.error(
          "[jobs] boss.stop() thất bại khi dọn dẹp sau lỗi khởi tạo:",
          stopError instanceof Error ? stopError.message : stopError,
        );
      });
      throw error;
    }
    return boss;
  })().catch((error: unknown) => {
    // Khởi tạo thất bại (vd. DB tạm thời không kết nối được lúc cold start)
    // → xoá cache để lần gọi getBoss() kế tiếp được retry, thay vì kẹt mãi
    // mãi với promise reject bị cache trên globalThis cho tới khi process
    // restart. Vẫn giữ hành vi "gộp" cho các caller đồng thời: những ai đã
    // đang chờ promise này (kể cả trước khi start() xong) đều nhận cùng một
    // rejection — chỉ các lời gọi getBoss() SAU khi promise đã settle mới
    // thấy cache trống và tạo instance mới.
    globalForBoss.bossPromise = undefined;
    throw error;
  });

  return globalForBoss.bossPromise;
}

/**
 * Ghi job gửi email xác nhận đơn hàng, TRONG CÙNG transaction Postgres với
 * `tx` (qua `fromPrisma(tx)`) — nếu `tx` rollback thì job cũng rollback theo,
 * đảm bảo không bao giờ có job mồ côi cho một đơn hàng chưa thực sự được tạo.
 *
 * `boss` là tham số tiêm tuỳ chọn (dùng cho test); mặc định lấy từ
 * `getBoss()` (singleton phía app).
 *
 * `boss.send(...)` của pg-boss trả về `id` job khi ghi thành công, nhưng
 * resolve `null` khi INSERT ảnh hưởng 0 dòng (vd. hàng đợi chưa "nhìn thấy"
 * trong database của transaction đang chạy, cache queue không khớp, hoặc —
 * từ Ngày 7 — job trùng `singletonKey` bị coi là trùng lặp) — KHÔNG phải một
 * lỗi `throw`. Nếu bỏ qua giá trị trả về này, transaction vẫn commit đơn hàng
 * mà KHÔNG có job gửi email nào — đúng ca "đơn hàng bị âm thầm mất email xác
 * nhận" mà thiết kế này muốn cấm tuyệt đối (F2, final review Ngày 6). Vì vậy
 * PHẢI kiểm tra và `throw` khi `id` rỗng, để lỗi lan lên `createOrderCore` và
 * rollback toàn bộ transaction (không đơn, không job — nhất quán với mọi lỗi
 * enqueue khác).
 */
export async function enqueueOrderConfirmation(
  tx: PrismaTransactionLike,
  payload: OrderConfirmationJob,
  boss?: PgBoss,
): Promise<void> {
  const data = orderConfirmationJobSchema.parse(payload);
  const bossInstance = boss ?? (await getBoss());

  const jobId = await bossInstance.send(QUEUE_SEND_ORDER_CONFIRMATION, data, {
    db: fromPrisma(tx),
  });

  if (!jobId) {
    throw new Error(
      `Ghi job gửi email xác nhận đơn hàng thất bại (pg-boss trả về id rỗng cho orderCode: ${data.orderCode}) — không thể đảm bảo email sẽ được gửi.`,
    );
  }
}

/** Ghi job xác nhận thanh toán nguyên tử cùng transaction cập nhật đơn. */
export async function enqueuePaymentConfirmed(
  tx: PrismaTransactionLike,
  payload: PaymentConfirmedJob,
  boss?: PgBoss,
): Promise<void> {
  const data = paymentConfirmedJobSchema.parse(payload);
  const bossInstance = boss ?? (await getBoss());

  const jobId = await bossInstance.send(QUEUE_SEND_PAYMENT_CONFIRMED, data, {
    db: fromPrisma(tx),
  });
  if (!jobId) throw new Error("Ghi job xác nhận thanh toán thất bại.");
}
