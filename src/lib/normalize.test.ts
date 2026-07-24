import { describe, it, expect } from "vitest";
import { normalizeText } from "@/lib/normalize";

describe("normalizeText()", () => {
  it("bỏ dấu tiếng Việt, lowercase, GIỮ khoảng trắng giữa từ", () => {
    expect(normalizeText("Giày Chạy Bộ Êm")).toBe("giay chay bo em");
  });

  it("xử lý riêng đ/Đ → d (NFD không tự tách đ)", () => {
    expect(normalizeText("ĐÔ THỊ")).toBe("do thi");
  });

  it("gộp nhiều khoảng trắng liên tiếp thành 1, trim đầu/cuối", () => {
    expect(normalizeText("  Áo   Khoác  ")).toBe("ao khoac");
  });

  it("chuỗi rỗng → chuỗi rỗng", () => {
    expect(normalizeText("")).toBe("");
  });
});
