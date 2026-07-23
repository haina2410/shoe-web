import { describe, it, expect } from "vitest";
import { slugify, uniqueSlug } from "@/lib/slug";

describe("slugify()", () => {
  it("bỏ dấu tiếng Việt và lowercase", () => {
    expect(slugify("Giày Sục Nữ")).toBe("giay-suc-nu");
  });

  it("xử lý riêng đ/Đ → d (NFD không tự tách đ)", () => {
    expect(slugify("Dép Đi Trong Nhà")).toBe("dep-di-trong-nha");
  });

  it("thay ký tự không phải [a-z0-9] bằng '-', gộp nhiều '-', trim đầu/cuối", () => {
    expect(slugify("  Áo   Khoác!! ")).toBe("ao-khoac");
  });

  it("chuỗi rỗng → fallback 'san-pham'", () => {
    expect(slugify("")).toBe("san-pham");
  });

  it("chuỗi toàn ký tự lạ → fallback 'san-pham'", () => {
    expect(slugify("!!!@@@###")).toBe("san-pham");
  });

  it("giữ số", () => {
    expect(slugify("Áo Size 42")).toBe("ao-size-42");
  });
});

describe("uniqueSlug()", () => {
  function fakeExists(taken: Set<string>) {
    return async (slug: string): Promise<boolean> => taken.has(slug);
  }

  it("trả về base nếu chưa tồn tại", async () => {
    const taken = new Set<string>();
    await expect(uniqueSlug("giay-suc-nu", fakeExists(taken))).resolves.toBe(
      "giay-suc-nu",
    );
  });

  it("thử base-2 nếu base đã tồn tại", async () => {
    const taken = new Set(["giay-suc-nu"]);
    await expect(uniqueSlug("giay-suc-nu", fakeExists(taken))).resolves.toBe(
      "giay-suc-nu-2",
    );
  });

  it("thử tiếp base-3, base-4... tới khi free", async () => {
    const taken = new Set(["giay-suc-nu", "giay-suc-nu-2", "giay-suc-nu-3"]);
    await expect(uniqueSlug("giay-suc-nu", fakeExists(taken))).resolves.toBe(
      "giay-suc-nu-4",
    );
  });
});
