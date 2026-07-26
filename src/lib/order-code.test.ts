import { describe, it, expect } from "vitest";
import { generateOrderCode } from "@/lib/order-code";

describe("generateOrderCode()", () => {
  it("khớp định dạng SePay LEAFXXXXXX liền nhau (6 ký tự [A-Z0-9])", () => {
    expect(generateOrderCode()).toMatch(/^LEAF[A-Z0-9]{6}$/);
  });

  it("sinh mã khác nhau qua nhiều lần gọi (không cố định)", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateOrderCode()));
    expect(codes.size).toBeGreaterThan(1);
  });

  it("mọi mã sinh ra đều khớp định dạng", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateOrderCode()).toMatch(/^LEAF[A-Z0-9]{6}$/);
    }
  });
});
