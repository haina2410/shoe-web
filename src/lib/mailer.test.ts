import { describe, it, expect, afterEach, vi } from "vitest";
import { createResendMailer, mailerFromEnv } from "@/lib/mailer";

/** Client Resend giả tối thiểu để test không cần mạng (không `vi.mock` toàn module). */
function fakeClient(result: {
  data?: unknown;
  error?: { message: string; statusCode: number | null; name: string } | null;
}) {
  return {
    emails: {
      send: vi.fn().mockResolvedValue({
        data: result.data ?? null,
        error: result.error ?? null,
      }),
    },
  };
}

describe("createResendMailer()", () => {
  it("gọi resend.emails.send với đúng from/to/subject/html/text", async () => {
    const client = fakeClient({ data: { id: "email_123" } });
    const mailer = createResendMailer(
      { apiKey: "re_test_key", from: "no-reply@leafshoes.vn" },
      { client },
    );

    await mailer.send({
      to: "khach@example.com",
      subject: "Đơn hàng LEAF-AB12CD — leafshoes Việt Nam",
      html: "<p>Xin chào</p>",
      text: "Xin chào",
    });

    expect(client.emails.send).toHaveBeenCalledWith({
      from: "no-reply@leafshoes.vn",
      to: "khach@example.com",
      subject: "Đơn hàng LEAF-AB12CD — leafshoes Việt Nam",
      html: "<p>Xin chào</p>",
      text: "Xin chào",
    });
  });

  it("truyền replyTo cho resend.emails.send khi có cấu hình", async () => {
    const client = fakeClient({ data: { id: "email_123" } });
    const mailer = createResendMailer(
      {
        apiKey: "re_test_key",
        from: "no-reply@leafshoes.vn",
        replyTo: "shop@example.com",
      },
      { client },
    );

    await mailer.send({
      to: "khach@example.com",
      subject: "s",
      html: "<p>h</p>",
      text: "t",
    });

    expect(client.emails.send).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: "shop@example.com" }),
    );
  });

  it("không gửi khoá replyTo khi không cấu hình", async () => {
    const client = fakeClient({ data: { id: "email_123" } });
    const mailer = createResendMailer(
      { apiKey: "re_test_key", from: "no-reply@leafshoes.vn" },
      { client },
    );

    await mailer.send({
      to: "khach@example.com",
      subject: "s",
      html: "<p>h</p>",
      text: "t",
    });

    const payload = client.emails.send.mock.calls[0][0];
    expect(payload).not.toHaveProperty("replyTo");
  });

  it("toOverride ghi đè địa chỉ to (dùng cho sandbox dev)", async () => {
    const client = fakeClient({ data: { id: "email_123" } });
    const mailer = createResendMailer(
      {
        apiKey: "re_test_key",
        from: "no-reply@leafshoes.vn",
        toOverride: "dev-sandbox@leafshoes.vn",
      },
      { client },
    );

    await mailer.send({
      to: "khach@example.com",
      subject: "s",
      html: "<p>h</p>",
      text: "t",
    });

    expect(client.emails.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "dev-sandbox@leafshoes.vn" }),
    );
  });

  it("khi resend trả về { error }, throw Error để pg-boss retry, không lộ email trong thông báo", async () => {
    const customerEmail = "khach-nhay-cam@example.com";
    const client = fakeClient({
      error: { message: "Invalid recipient", statusCode: 422, name: "validation_error" },
    });
    const mailer = createResendMailer(
      { apiKey: "re_test_key", from: "no-reply@leafshoes.vn" },
      { client },
    );

    const message = {
      to: customerEmail,
      subject: "s",
      html: "<p>h</p>",
      text: "t",
    };

    await expect(mailer.send(message)).rejects.toThrow();

    let thrown: unknown;
    try {
      await mailer.send(message);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).not.toContain(customerEmail);
  });

  it("thông điệp lỗi THÔ của Resend chứa địa chỉ email (vd. lỗi sandbox/validation) → KHÔNG xuất hiện nguyên văn trong Error ném ra, nhưng vẫn giữ error.name để debug (F6)", async () => {
    // Mô phỏng đúng hình dạng lỗi sandbox Resend thật: thông điệp ECHO lại
    // địa chỉ (không phải field `to` tách riêng — nằm ngay trong `message`).
    const client = fakeClient({
      error: {
        message:
          "You can only send testing emails to your own email address (chu-tai-khoan@vidu.dev). To send emails to other recipients, please verify a domain.",
        statusCode: 403,
        name: "validation_error",
      },
    });
    const mailer = createResendMailer(
      { apiKey: "re_test_key", from: "no-reply@leafshoes.vn" },
      { client },
    );

    let thrown: unknown;
    try {
      await mailer.send({
        to: "khach@example.com",
        subject: "s",
        html: "<p>h</p>",
        text: "t",
      });
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(Error);
    const thrownMessage = (thrown as Error).message;
    expect(thrownMessage).not.toContain("chu-tai-khoan@vidu.dev");
    expect(thrownMessage).not.toMatch(/[\w.+-]+@[\w-]+\.[\w-]+/); // không còn dạng email nào
    expect(thrownMessage).toContain("validation_error"); // vẫn giữ LOẠI lỗi để debug
  });
});

describe("mailerFromEnv()", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throw khi thiếu RESEND_API_KEY", () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("MAIL_FROM", "no-reply@leafshoes.vn");

    expect(() => mailerFromEnv()).toThrow(/RESEND_API_KEY/);
  });

  it("throw khi thiếu MAIL_FROM", () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("MAIL_FROM", "");

    expect(() => mailerFromEnv()).toThrow(/MAIL_FROM/);
  });

  it("tạo được mailer khi có đủ RESEND_API_KEY/MAIL_FROM", () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("MAIL_FROM", "no-reply@leafshoes.vn");
    vi.stubEnv("MAIL_TO_OVERRIDE", "");

    expect(() => mailerFromEnv()).not.toThrow();
  });

  it("vẫn tạo được mailer khi thiếu MAIL_REPLY_TO (tuỳ chọn)", () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("MAIL_FROM", "no-reply@leafshoes.vn");
    vi.stubEnv("MAIL_REPLY_TO", "");

    expect(() => mailerFromEnv()).not.toThrow();
  });

  it("đọc MAIL_REPLY_TO và truyền vào resend.emails.send khi có cấu hình", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("MAIL_FROM", "no-reply@leafshoes.vn");
    vi.stubEnv("MAIL_REPLY_TO", "shop@example.com");

    const client = fakeClient({ data: { id: "email_123" } });
    const mailer = mailerFromEnv({ client });

    await mailer.send({ to: "khach@example.com", subject: "s", html: "<p>h</p>", text: "t" });

    expect(client.emails.send).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: "shop@example.com" }),
    );
  });
});
