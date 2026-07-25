import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { mailerFromEnv } from "@/lib/mailer";
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
 */

async function main(): Promise<void> {
  const mailer = mailerFromEnv();

  const boss = createBoss({ supervise: true, schedule: true });

  boss.on("error", (error: Error) => {
    // Không log PII — chỉ log thông điệp lỗi từ pg-boss (không chứa dữ liệu job).
    console.error("[worker] pg-boss lỗi:", error.message);
  });

  await boss.start();
  await ensureQueues(boss);

  await boss.work(QUEUE_SEND_ORDER_CONFIRMATION, {}, async (jobs) => {
    for (const job of jobs) {
      await handleSendOrderConfirmation({ db: prisma, mailer }, job.data);
    }
  });

  console.log(`[worker] sẵn sàng, đang lắng nghe queue "${QUEUE_SEND_ORDER_CONFIRMATION}"...`);

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    console.log(`[worker] nhận tín hiệu ${signal}, đang dừng...`);
    await boss.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  console.error("[worker] khởi động thất bại:", error instanceof Error ? error.message : error);
  process.exit(1);
});
