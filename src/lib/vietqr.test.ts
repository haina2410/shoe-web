import { describe, it, expect, afterEach, vi } from "vitest";
import { buildVietQrImageUrl, vietQrConfigFromEnv } from "@/lib/vietqr";

describe("buildVietQrImageUrl()", () => {
  it("xây đúng cấu trúc URL với template mặc định 'compact2'", () => {
    const url = buildVietQrImageUrl({
      bankCode: "VCB",
      accountNo: "0123456789",
      accountName: "NGUYEN VAN A",
      amount: 630000,
      addInfo: "LEAFAB12CD",
    });

    expect(url).toBe(
      "https://img.vietqr.io/image/VCB-0123456789-compact2.png?amount=630000&addInfo=LEAFAB12CD&accountName=NGUYEN%20VAN%20A",
    );
  });

  it("cho phép override template", () => {
    const url = buildVietQrImageUrl({
      bankCode: "VCB",
      accountNo: "0123456789",
      accountName: "NGUYEN VAN A",
      amount: 100000,
      addInfo: "LEAFXYZ999",
      template: "qr_only",
    });

    expect(url).toContain("/image/VCB-0123456789-qr_only.png");
  });

  it("encode addInfo/accountName có dấu tiếng Việt và khoảng trắng", () => {
    const url = buildVietQrImageUrl({
      bankCode: "MB",
      accountNo: "999",
      accountName: "Trần Thị B",
      amount: 1000,
      addInfo: "Thanh toán đơn LEAFQWE123",
    });

    const parsed = new URL(url);
    expect(parsed.searchParams.get("addInfo")).toBe(
      "Thanh toán đơn LEAFQWE123",
    );
    expect(parsed.searchParams.get("accountName")).toBe("Trần Thị B");
  });

  it("amount là số nguyên giữ nguyên", () => {
    const url = buildVietQrImageUrl({
      bankCode: "VCB",
      accountNo: "1",
      accountName: "A",
      amount: 999999,
      addInfo: "x",
    });

    expect(new URL(url).searchParams.get("amount")).toBe("999999");
  });
});

describe("vietQrConfigFromEnv()", () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllEnvs();
  });

  it("đọc đủ biến môi trường bắt buộc", () => {
    process.env.VIETQR_BANK_CODE = "VCB";
    process.env.VIETQR_ACCOUNT_NO = "0123456789";
    process.env.VIETQR_ACCOUNT_NAME = "NGUYEN VAN A";
    delete process.env.VIETQR_TEMPLATE;

    expect(vietQrConfigFromEnv()).toEqual({
      bankCode: "VCB",
      accountNo: "0123456789",
      accountName: "NGUYEN VAN A",
      template: undefined,
    });
  });

  it("đọc VIETQR_TEMPLATE khi có", () => {
    process.env.VIETQR_BANK_CODE = "VCB";
    process.env.VIETQR_ACCOUNT_NO = "0123456789";
    process.env.VIETQR_ACCOUNT_NAME = "NGUYEN VAN A";
    process.env.VIETQR_TEMPLATE = "qr_only";

    expect(vietQrConfigFromEnv().template).toBe("qr_only");
  });

  it("throw thông báo rõ khi thiếu biến bắt buộc", () => {
    delete process.env.VIETQR_BANK_CODE;
    delete process.env.VIETQR_ACCOUNT_NO;
    delete process.env.VIETQR_ACCOUNT_NAME;

    expect(() => vietQrConfigFromEnv()).toThrow(/VIETQR_BANK_CODE/);
  });
});
