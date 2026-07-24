import { describe, it, expect } from "vitest";
import { PROVINCES, isKnownProvince } from "@/lib/provinces";

describe("PROVINCES", () => {
  it("có đúng 34 phần tử (6 TP trực thuộc TW + 28 tỉnh)", () => {
    expect(PROVINCES).toHaveLength(34);
  });

  it("không có phần tử trùng lặp", () => {
    expect(new Set(PROVINCES).size).toBe(PROVINCES.length);
  });

  it("chứa đúng chính tả 3 tỉnh dùng để khớp phí ship (Task 2 seed)", () => {
    expect(PROVINCES).toContain("TP. Hồ Chí Minh");
    expect(PROVINCES).toContain("Đồng Nai");
    expect(PROVINCES).toContain("Tây Ninh");
  });

  it("chứa Hà Nội, Huế, Cần Thơ (TP trực thuộc TW)", () => {
    expect(PROVINCES).toContain("Hà Nội");
    expect(PROVINCES).toContain("Huế");
    expect(PROVINCES).toContain("Cần Thơ");
  });
});

describe("isKnownProvince()", () => {
  it("trả true với tỉnh có trong danh sách", () => {
    expect(isKnownProvince("Hà Nội")).toBe(true);
    expect(isKnownProvince("Đồng Nai")).toBe(true);
  });

  it("trả false với tỉnh không có trong danh sách", () => {
    expect(isKnownProvince("Không Tồn Tại")).toBe(false);
    expect(isKnownProvince("")).toBe(false);
    expect(isKnownProvince("Hà nội")).toBe(false); // sai chính tả/hoa thường
  });
});
