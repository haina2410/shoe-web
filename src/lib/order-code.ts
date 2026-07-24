import { randomInt } from "node:crypto";

/** Bảng ký tự dùng để sinh mã đơn hàng — chữ hoa A-Z và số 0-9. */
const CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * Sinh mã đơn hàng dạng `LEAF-XXXXXX` với 6 ký tự ngẫu nhiên từ `[A-Z0-9]`.
 * Dùng `crypto.randomInt` (CSPRNG) thay vì `Math.random` để tránh trùng lặp
 * dự đoán được.
 */
export function generateOrderCode(): string {
  let suffix = "";
  for (let i = 0; i < 6; i += 1) {
    suffix += CODE_CHARS[randomInt(CODE_CHARS.length)];
  }
  return `LEAF-${suffix}`;
}
