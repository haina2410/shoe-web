import { Resend } from "resend";

/** Nội dung email cần gửi — không phụ thuộc nhà cung cấp cụ thể. */
export type MailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey?: string;
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
    send(
      payload: {
        from: string;
        to: string;
        subject: string;
        html: string;
        text: string;
        replyTo?: string;
      },
      options?: { idempotencyKey?: string },
    ): Promise<{ data: unknown; error: { message: string; name: string } | null }>;
  };
}

/**
 * Khớp một chuỗi trông giống địa chỉ email — dùng để LỌC KHỎI thông báo lỗi
 * trước khi ném ra (F6, final review Ngày 6). Thông báo lỗi thô của Resend
 * (sandbox/validation, vd. `"You can only send testing emails to your own
 * email address (ban@domain.com)."` hoặc `"Invalid `to` field: ..."`) có thể
 * ECHO lại địa chỉ người nhận/người gửi — và thông báo ném ra từ hàm này trở
 * thành `output` của job pg-boss, LƯU 14 NGÀY trong bảng `pgboss.job`, đúng
 * bảng mà quy tắc "không PII trong payload/job output" muốn bảo vệ.
 */
const EMAIL_LIKE_PATTERN = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

function scrubEmailAddresses(message: string): string {
  return message.replace(EMAIL_LIKE_PATTERN, "[đã ẩn địa chỉ email]");
}

/**
 * Tạo `Mailer` dùng Resend. `resend.emails.send` KHÔNG throw khi lỗi — trả về
 * `{ error }` — nên ở đây phải tự kiểm tra và `throw` để pg-boss (Task 2) có
 * thể retry job. Thông báo lỗi ném ra KHÔNG được chứa địa chỉ email (PII) —
 * `error.message` thô của Resend bị lọc qua `scrubEmailAddresses` trước khi
 * nội suy vào `Error`; `error.name` (loại lỗi Resend, vd `validation_error`)
 * được giữ nguyên vì đó là PHÂN LOẠI lỗi, không phải dữ liệu khách hàng — vẫn
 * đủ để debug là lỗi loại gì mà không cần thông điệp thô.
 */
export function createResendMailer(
  config: { apiKey: string; from: string; toOverride?: string; replyTo?: string },
  deps?: { client?: ResendLikeClient },
): Mailer {
  const client: ResendLikeClient = deps?.client ?? new Resend(config.apiKey);

  return {
    async send(message: MailMessage): Promise<void> {
      const to = config.toOverride ?? message.to;
      const payload = {
        from: config.from,
        to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(config.replyTo ? { replyTo: config.replyTo } : {}),
      };
      const { error } = message.idempotencyKey
        ? await client.emails.send(payload, {
            idempotencyKey: message.idempotencyKey,
          })
        : await client.emails.send(payload);

      if (error) {
        throw new Error(`Gửi email thất bại (${error.name}): ${scrubEmailAddresses(error.message)}`);
      }
    },
  };
}

/**
 * Đọc cấu hình mailer từ biến môi trường: `RESEND_API_KEY`, `MAIL_FROM`
 * (bắt buộc), `MAIL_TO_OVERRIDE` (tuỳ chọn, dùng cho sandbox dev),
 * `MAIL_REPLY_TO` (tuỳ chọn — hộp thư của shop nhận reply từ khách). Ném
 * `Error` nêu rõ tên biến còn thiếu nếu cấu hình chưa đầy đủ.
 */
export function mailerFromEnv(deps?: { client?: ResendLikeClient }): Mailer {
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

  return createResendMailer(
    {
      apiKey: apiKey!,
      from: from!,
      toOverride: process.env.MAIL_TO_OVERRIDE || undefined,
      replyTo: process.env.MAIL_REPLY_TO || undefined,
    },
    deps,
  );
}
