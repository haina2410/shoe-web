/** Tham số cần để dựng URL ảnh QR động của VietQR (https://vietqr.io). */
export type VietQrImageParams = {
  bankCode: string;
  accountNo: string;
  accountName: string;
  amount: number;
  addInfo: string;
  /** Kiểu hiển thị QR, mặc định `"compact2"`. */
  template?: string;
};

/**
 * Dựng URL ảnh QR động của VietQR:
 * `https://img.vietqr.io/image/<bankCode>-<accountNo>-<template>.png?amount=<amount>&addInfo=<enc>&accountName=<enc>`
 *
 * `addInfo`/`accountName` được `encodeURIComponent` để an toàn với dấu tiếng
 * Việt và khoảng trắng. `amount` là số nguyên VND, giữ nguyên không format.
 */
export function buildVietQrImageUrl(p: VietQrImageParams): string {
  const template = p.template ?? "compact2";
  const addInfo = encodeURIComponent(p.addInfo);
  const accountName = encodeURIComponent(p.accountName);

  return (
    `https://img.vietqr.io/image/${p.bankCode}-${p.accountNo}-${template}.png` +
    `?amount=${p.amount}&addInfo=${addInfo}&accountName=${accountName}`
  );
}

/** Cấu hình tài khoản nhận tiền VietQR, đọc từ biến môi trường (server-only). */
export type VietQrConfig = {
  bankCode: string;
  accountNo: string;
  accountName: string;
  template?: string;
};

/**
 * Đọc cấu hình VietQR từ biến môi trường:
 * `VIETQR_BANK_CODE`, `VIETQR_ACCOUNT_NO`, `VIETQR_ACCOUNT_NAME` (bắt buộc),
 * `VIETQR_TEMPLATE` (tuỳ chọn). Chỉ dùng ở server (Server Action/Route Handler).
 *
 * Ném `Error` nêu rõ tên biến còn thiếu nếu cấu hình chưa đầy đủ.
 */
export function vietQrConfigFromEnv(): VietQrConfig {
  const bankCode = process.env.VIETQR_BANK_CODE;
  const accountNo = process.env.VIETQR_ACCOUNT_NO;
  const accountName = process.env.VIETQR_ACCOUNT_NAME;

  const missing: string[] = [];
  if (!bankCode) missing.push("VIETQR_BANK_CODE");
  if (!accountNo) missing.push("VIETQR_ACCOUNT_NO");
  if (!accountName) missing.push("VIETQR_ACCOUNT_NAME");

  if (missing.length > 0) {
    throw new Error(
      `Thiếu biến môi trường VietQR bắt buộc: ${missing.join(", ")}.`,
    );
  }

  return {
    bankCode: bankCode!,
    accountNo: accountNo!,
    accountName: accountName!,
    template: process.env.VIETQR_TEMPLATE,
  };
}
