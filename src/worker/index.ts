import "dotenv/config";
import { pathToFileURL } from "node:url";
import type { Job, WorkOptions } from "pg-boss";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { mailerFromEnv, type Mailer } from "@/lib/mailer";
import {
  createBoss,
  ensureQueues,
  QUEUE_SEND_ORDER_CONFIRMATION,
  QUEUE_SEND_PAYMENT_CONFIRMED,
} from "@/jobs/queue";
import { handleSendOrderConfirmation } from "@/jobs/handlers/send-order-confirmation";
import { handleSendPaymentConfirmed } from "@/jobs/handlers/send-payment-confirmed";
import { vietQrConfigFromEnv } from "@/lib/vietqr";

/**
 * `src/worker/index.ts` — tiến trình worker riêng (chạy `npm run worker`,
 * KHÔNG chạy trong tiến trình Next.js): khởi động pg-boss với giám sát BẬT
 * (`supervise: true, schedule: true` — khác instance phía app ở
 * `src/jobs/queue.ts#createBoss()` mặc định TẮT cả hai), rồi xử lý job
 * `send-order-confirmation` bằng `handleSendOrderConfirmation` (Task 3).
 *
 * Dùng alias `@/` như phần còn lại của code (đã kiểm chứng thực nghiệm:
 * `tsx` 4.23.1 trên Node 24 tự đọc `paths` trong `tsconfig.json` nên `@/*`
 * resolve đúng khi chạy trực tiếp bằng `tsx`, không cần tooling thêm — khác
 * với `prisma/seed.ts` (dùng import tương đối, quy ước cũ hơn/thận trọng
 * hơn). Xem báo cáo Task 3 để biết chi tiết cách kiểm chứng.
 *
 * `mailerFromEnv()` được gọi DUY NHẤT MỘT LẦN ở đây, lúc khởi động — fail
 * fast ngay nếu thiếu biến môi trường bắt buộc (`RESEND_API_KEY`,
 * `MAIL_FROM`), thay vì để lỗi rơi vào lúc xử lý job đầu tiên.
 *
 * F7 (final review Ngày 6): TRƯỚC ĐÂY chỉ `mailerFromEnv()` fail-fast —
 * `vietQrConfigFromEnv()` (đọc lúc xử lý job, `src/jobs/handlers/
 * send-order-confirmation.ts`) và `APP_BASE_URL` (mặc định âm thầm về
 * `http://localhost:3000` nếu thiếu) KHÔNG được kiểm tra lúc khởi động — một
 * worker cấu hình thiếu VietQR sẽ fail MỌI job thay vì từ chối khởi động, và
 * một worker thiếu `APP_BASE_URL` sẽ mail cho khách đường link chết. `main()`
 * giờ xác thực CẢ BA (mail, VietQR, `APP_BASE_URL`) TRƯỚC khi `boss.start()`
 * — sai biến môi trường nào cũng chặn worker khởi động, không log GIÁ TRỊ
 * biến môi trường (chỉ tên biến còn thiếu). `APP_BASE_URL` vẫn giữ mặc định
 * `localhost:3000` trong `send-order-confirmation.ts` cho các caller KHÁC
 * worker (vd. gọi trực tiếp trong test) — vì worker thật không bao giờ chạy
 * tới đó nếu thiếu biến (đã bị chặn ở đây).
 *
 * `registerOrderConfirmationWorker()` được export riêng (thay vì inline
 * trong `main()`) để test tích hợp (`src/jobs/worker.integration.test.ts`)
 * import và gọi ĐÚNG code đăng ký này — thay vì tự viết lại `boss.work(...)`
 * — nên một regression trong chính đoạn đăng ký (vd. đổi `for (const job of
 * jobs)` thành chỉ xử lý `jobs[0]`, hay truyền sai tên queue) sẽ bị test bắt.
 *
 * Module này gọi `main()` ở entrypoint, nhưng CHỈ khi được chạy trực tiếp
 * (`tsx src/worker/index.ts`) — xem guard `pathToFileURL` ở cuối file. Khi
 * test `import` module để lấy `registerOrderConfirmationWorker`, `main()`
 * KHÔNG được chạy: nếu chạy sẽ gọi `mailerFromEnv()` thật (fail vì thiếu
 * `RESEND_API_KEY`/`MAIL_FROM` trong môi trường test), khởi động một boss
 * thật, và đăng ký signal handler — tất cả đều là side effect không mong
 * muốn khi chỉ import để test. Khác với `prisma/seed.ts` (dùng
 * `process.argv[1].includes("seed")` — so khớp lỏng theo tên file, đủ dùng
 * vì tên file "seed" khó trùng ngẫu nhiên); ở đây dùng so khớp CHÍNH XÁC
 * bằng URL (`import.meta.url` so với `pathToFileURL(process.argv[1])`) vì
 * "index" là tên file phổ biến, so khớp lỏng theo tên dễ dương tính giả.
 */

/**
 * Interface tối thiểu mà `registerOrderConfirmationWorker` thực sự cần từ
 * `boss` — chỉ `work(...)`. Thu hẹp lại (thay vì nhận nguyên `PgBoss`) để
 * test hợp đồng đăng ký (`src/worker/index.test.ts`) có thể tiêm một fake
 * boss tối thiểu — không cần dựng cả `PgBoss` thật (kết nối DB) — mà vẫn gọi
 * ĐÚNG code đăng ký thật, bắt được đúng `name`/`options`/`handler` đã truyền
 * cho `boss.work(...)` rồi tự gọi `handler` với nhiều job để kiểm tra CẢ
 * MẢNG job được xử lý (không chỉ job đầu tiên). `PgBoss` thật thoả interface
 * này tự nhiên (chỉ thu hẹp, không đổi hành vi thật).
 */
export interface WorkCapableBoss {
  work(
    name: string,
    options: WorkOptions,
    handler: (jobs: Job<unknown>[]) => Promise<void>,
  ): Promise<string>;
}

/** Đọc `orderCode` từ payload job MỘT CÁCH AN TOÀN chỉ để LOG (F5) — không
 * validate đầy đủ bằng zod (việc đó là của `handleSendOrderConfirmation`),
 * chỉ cần best-effort để dòng log có ngữ cảnh; trả về `"?"` nếu payload không
 * đúng hình dạng mong đợi (vd. lỗi parse xảy ra TRƯỚC khi `orderCode` có ý
 * nghĩa). `orderCode` không phải PII — được phép xuất hiện trong log. */
function orderCodeForLog(data: unknown): string {
  if (data && typeof data === "object" && "orderCode" in data) {
    const value = (data as { orderCode?: unknown }).orderCode;
    if (typeof value === "string") return value;
  }
  return "?";
}

/**
 * Đăng ký worker xử lý job `send-order-confirmation`. Hàm THUẦN: chỉ gọi
 * `boss.work(...)`, không tạo boss, không đọc env, không đăng ký signal
 * handler — để test tích hợp tiêm `db`/`mailer` giả lập mà vẫn chạy đúng
 * code đăng ký thật.
 *
 * F5 (final review Ngày 6): job thất bại (throw) trước đây hoàn toàn ÂM
 * THẦM — `boss.on("error", ...)` chỉ bắt lỗi Ở CẤP pg-boss (kết nối, lỗi nội
 * bộ...), KHÔNG bắt lỗi từ job handler. Một job Resend 429/5xx lặp lại hết
 * `retryLimit` mà không ai biết. Bọc mỗi job trong try/catch: log MỘT dòng
 * KHÔNG PII (tên queue, jobId, `orderCode` — không phải PII, thông điệp lỗi
 * đã được `src/lib/mailer.ts` lọc email trước khi throw, xem F6) rồi RETHROW
 * để pg-boss vẫn coi job là fail (retry/dead-letter theo `QUEUE_RETRY_OPTIONS`,
 * `src/jobs/queue.ts`) — log chỉ để lộ ra ngoài, không thay đổi kết quả job.
 */
export async function registerOrderConfirmationWorker(
  boss: WorkCapableBoss,
  deps: { db: PrismaClient; mailer: Mailer },
): Promise<void> {
  await boss.work(QUEUE_SEND_ORDER_CONFIRMATION, {}, async (jobs) => {
    for (const job of jobs) {
      try {
        await handleSendOrderConfirmation(deps, job.data);
      } catch (error: unknown) {
        console.error(
          `[worker] job thất bại: queue=${QUEUE_SEND_ORDER_CONFIRMATION} jobId=${job.id} ` +
            `orderCode=${orderCodeForLog(job.data)} lỗi=${
              error instanceof Error ? `${error.name}: ${error.message}` : String(error)
            }`,
        );
        throw error;
      }
    }
  });
}

/** Đăng ký worker xác nhận thanh toán; xử lý mọi job trong batch. */
export async function registerPaymentConfirmedWorker(
  boss: WorkCapableBoss,
  deps: { db: PrismaClient; mailer: Mailer },
): Promise<void> {
  await boss.work(QUEUE_SEND_PAYMENT_CONFIRMED, {}, async (jobs) => {
    for (const job of jobs) {
      try {
        await handleSendPaymentConfirmed(deps, job.data);
      } catch (error: unknown) {
        // Không log message lỗi: dependency có thể vô tình nhúng PII vào đó.
        console.error(
          `[worker] job thất bại: queue=${QUEUE_SEND_PAYMENT_CONFIRMED} ` +
            `jobId=${job.id} orderCode=${orderCodeForLog(job.data)}`,
        );
        throw error;
      }
    }
  });
}

/**
 * Xác thực TOÀN BỘ biến môi trường mà worker cần, MỘT LẦN, TRƯỚC khi
 * `boss.start()`/nhận job (F7, final review Ngày 6) — sai cấu hình phải chặn
 * worker khởi động (fail fast), không phải làm fail từng job một (mail —
 * `mailerFromEnv()`) hay âm thầm dùng giá trị mặc định sai (VietQR —
 * `vietQrConfigFromEnv()` — và `APP_BASE_URL`, nếu thiếu sẽ mail khách một
 * đường link chết tới `localhost:3000`). CHỈ nêu TÊN biến còn thiếu trong
 * thông báo lỗi, không log GIÁ TRỊ biến môi trường.
 */
export function requireAppBaseUrlForWorker(): void {
  if (!process.env.APP_BASE_URL) {
    throw new Error(
      "Thiếu biến môi trường bắt buộc cho worker: APP_BASE_URL (worker KHÔNG " +
        "dùng mặc định localhost:3000 — thiếu biến này sẽ khiến email xác nhận " +
        "chứa đường link chết cho khách hàng).",
    );
  }
}

async function main(): Promise<void> {
  const mailer = mailerFromEnv();
  vietQrConfigFromEnv();
  requireAppBaseUrlForWorker();

  const boss = createBoss({ supervise: true, schedule: true });

  boss.on("error", (error: Error) => {
    // Không log PII — chỉ log thông điệp lỗi từ pg-boss (không chứa dữ liệu job).
    console.error("[worker] pg-boss lỗi:", error.message);
  });

  await boss.start();
  await ensureQueues(boss);

  await registerOrderConfirmationWorker(boss, { db: prisma, mailer });
  await registerPaymentConfirmedWorker(boss, { db: prisma, mailer });

  console.log(
    `[worker] sẵn sàng, đang lắng nghe queues "${QUEUE_SEND_ORDER_CONFIRMATION}", ` +
      `"${QUEUE_SEND_PAYMENT_CONFIRMED}"...`,
  );

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    console.log(`[worker] nhận tín hiệu ${signal}, đang dừng...`);
    try {
      await boss.stop();
      process.exit(0);
    } catch (error: unknown) {
      // Không nuốt lỗi vào unhandled rejection — log thông điệp (không PII:
      // chỉ lỗi từ pg-boss.stop(), không chứa dữ liệu job) rồi thoát khác 0
      // để tiến trình giám sát (systemd/pm2/...) biết shutdown thất bại.
      console.error("[worker] dừng thất bại:", error instanceof Error ? error.message : error);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

// Chỉ chạy `main()` khi file này được thực thi trực tiếp (`tsx
// src/worker/index.ts` / `npm run worker`), KHÔNG chạy khi bị import (vd. từ
// test tích hợp muốn dùng `registerOrderConfirmationWorker`).
const isDirectExecution =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  main().catch((error: unknown) => {
    console.error("[worker] khởi động thất bại:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
