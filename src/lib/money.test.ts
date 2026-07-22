import { describe, it, expect } from "vitest";
import { formatVnd } from "./money";

describe("formatVnd", () => {
  it("định dạng số nguyên VND với dấu chấm phân cách nghìn và ký hiệu ₫", () => {
    expect(formatVnd(250000)).toBe("250.000 ₫");
  });

  it("xử lý số 0", () => {
    expect(formatVnd(0)).toBe("0 ₫");
  });

  it("xử lý số lớn", () => {
    expect(formatVnd(1250000)).toBe("1.250.000 ₫");
  });
});
