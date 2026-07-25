import { Resend } from "resend";

/** Nội dung email cần gửi — không phụ thuộc nhà cung cấp cụ thể. */
export type MailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

/** Abstraction gửi mail — cho phép Task 2/3 (worker pg-boss) dùng mà không biết
 * chi tiết nhà cung cấp (Resend). */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/**
 * Phần bề mặt tối thiểu của `Resend` client mà mailer cần — cho phép tiêm
 * một client giả trong test (không cần `vi.mock` toàn module `resend`).
 * `Resend` thật thoả interface này (cấu trúc), nên không cần ép kiểu.
 */
interface ResendLikeClient {
  emails: {
    send(payload: {
      from: string;
      to: string;
      subject: string;
      html: string;
      text: string;
    }): Promise<{ data: unknown; error: { message: string } | null }>;
  };
}

/**
 * Tạo `Mailer` dùng Resend. `resend.emails.send` KHÔNG throw khi lỗi — trả về
 * `{ error }` — nên ở đây phải tự kiểm tra và `throw` để pg-boss (Task 2) có
 * thể retry job. Thông báo lỗi ném ra KHÔNG được chứa địa chỉ email (PII).
 */
export function createResendMailer(
  config: { apiKey: string; from: string; toOverride?: string },
  deps?: { client?: ResendLikeClient },
): Mailer {
  const client: ResendLikeClient = deps?.client ?? new Resend(config.apiKey);

  return {
    async send(message: MailMessage): Promise<void> {
      const to = config.toOverride ?? message.to;
      const { error } = await client.emails.send({
        from: config.from,
        to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });

      if (error) {
        throw new Error(`Gửi email thất bại: ${error.message}`);
      }
    },
  };
}

/**
 * Đọc cấu hình mailer từ biến môi trường: `RESEND_API_KEY`, `MAIL_FROM`
 * (bắt buộc), `MAIL_TO_OVERRIDE` (tuỳ chọn, dùng cho sandbox dev). Ném
 * `Error` nêu rõ tên biến còn thiếu nếu cấu hình chưa đầy đủ.
 */
export function mailerFromEnv(): Mailer {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;

  const missing: string[] = [];
  if (!apiKey) missing.push("RESEND_API_KEY");
  if (!from) missing.push("MAIL_FROM");

  if (missing.length > 0) {
    throw new Error(
      `Thiếu biến môi trường bắt buộc cho gửi email: ${missing.join(", ")}.`,
    );
  }

  return createResendMailer({
    apiKey: apiKey!,
    from: from!,
    toOverride: process.env.MAIL_TO_OVERRIDE || undefined,
  });
}
