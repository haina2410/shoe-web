import "dotenv/config";
import { pathToFileURL } from "node:url";
import type { PgBoss, Job, WorkOptions } from "pg-boss";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { mailerFromEnv, type Mailer } from "@/lib/mailer";
import { createBoss, ensureQueues, QUEUE_SEND_ORDER_CONFIRMATION } from "@/jobs/queue";
import { handleSendOrderConfirmation } from "@/jobs/handlers/send-order-confirmation";

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

/**
 * Đăng ký worker xử lý job `send-order-confirmation`. Hàm THUẦN: chỉ gọi
 * `boss.work(...)`, không tạo boss, không đọc env, không đăng ký signal
 * handler — để test tích hợp tiêm `db`/`mailer` giả lập mà vẫn chạy đúng
 * code đăng ký thật.
 */
export async function registerOrderConfirmationWorker(
  boss: WorkCapableBoss,
  deps: { db: PrismaClient; mailer: Mailer },
): Promise<void> {
  await boss.work(QUEUE_SEND_ORDER_CONFIRMATION, {}, async (jobs) => {
    for (const job of jobs) {
      await handleSendOrderConfirmation(deps, job.data);
    }
  });
}

async function main(): Promise<void> {
  const mailer = mailerFromEnv();

  const boss = createBoss({ supervise: true, schedule: true });

  boss.on("error", (error: Error) => {
    // Không log PII — chỉ log thông điệp lỗi từ pg-boss (không chứa dữ liệu job).
    console.error("[worker] pg-boss lỗi:", error.message);
  });

  await boss.start();
  await ensureQueues(boss);

  await registerOrderConfirmationWorker(boss, { db: prisma, mailer });

  console.log(`[worker] sẵn sàng, đang lắng nghe queue "${QUEUE_SEND_ORDER_CONFIRMATION}"...`);

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
