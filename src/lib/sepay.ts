import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/** Payload SePay gửi tới endpoint webhook khi có giao dịch vào. */
export const sePayWebhookPayloadSchema = z.object({
  id: z.number().int().positive(),
  gateway: z.string().min(1),
  transactionDate: z.string().min(1),
  accountNumber: z.string().min(1),
  subAccount: z.string().nullable(),
  code: z.string().nullable(),
  content: z.string().min(1),
  transferType: z.literal("in"),
  description: z.string().min(1),
  transferAmount: z.number().int().positive(),
  accumulated: z.number(),
  referenceCode: z.string().min(1),
});

export type SePayWebhookPayload = z.infer<typeof sePayWebhookPayloadSchema>;

const SIGNATURE_HEX_LENGTH = 64;
const MAX_TIMESTAMP_AGE_MS = 300_000;

/**
 * Xác thực chữ ký HMAC-SHA256 của webhook SePay và cửa sổ thời gian 5 phút.
 * Hàm không log raw body, chữ ký, hoặc secret để tránh lộ dữ liệu nhạy cảm.
 */
export function verifySePaySignature(input: {
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  secret: string;
  now?: Date;
}): boolean {
  const { rawBody, signature, timestamp, secret, now = new Date() } = input;

  if (!secret || !signature || !timestamp) return false;
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
  if (!/^\d+$/.test(timestamp)) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds)) return false;

  const timestampMs = timestampSeconds * 1000;
  if (
    !Number.isSafeInteger(timestampMs) ||
    Math.abs(now.getTime() - timestampMs) > MAX_TIMESTAMP_AGE_MS
  ) {
    return false;
  }

  const provided = Buffer.from(signature, "hex");
  if (provided.length !== SIGNATURE_HEX_LENGTH / 2) return false;

  const signedMessage = `${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", secret).update(signedMessage).digest();

  return timingSafeEqual(expected, provided);
}

/** Trích mã đơn canonical từ trường `code` của SePay. */
export function orderCodeFromSePay(payload: SePayWebhookPayload): string | null {
  const code = payload.code?.trim().toUpperCase();
  return code || null;
}

/** Chuyển timestamp không timezone của SePay thành thời điểm Vietnam (+07:00). */
export function occurredAtFromSePay(transactionDate: string): Date {
  return new Date(`${transactionDate.replace(" ", "T")}+07:00`);
}
