import { describe, it, expect } from "vitest";
import { can, isAdminRole } from "@/lib/rbac";

describe("can()", () => {
  it("owner có full quyền product", () => {
    expect(can("owner", "product", "create")).toBe(true);
    expect(can("owner", "product", "delete")).toBe(true);
  });
  it("staff chỉ đọc product, không tạo/xoá", () => {
    expect(can("staff", "product", "read")).toBe(true);
    expect(can("staff", "product", "create")).toBe(false);
    expect(can("staff", "product", "delete")).toBe(false);
  });
  it("owner quản lý category còn staff chỉ đọc", () => {
    expect(can("owner", "category", "create")).toBe(true);
    expect(can("owner", "category", "update")).toBe(true);
    expect(can("owner", "category", "delete")).toBe(true);
    expect(can("staff", "category", "read")).toBe(true);
    expect(can("staff", "category", "create")).toBe(false);
  });
  it("staff đọc + cập nhật order", () => {
    expect(can("staff", "order", "read")).toBe(true);
    expect(can("staff", "order", "update")).toBe(true);
  });
  it("role không hợp lệ / null → false", () => {
    expect(can(null, "product", "read")).toBe(false);
    expect(can("ghost", "product", "read")).toBe(false);
  });
});

describe("isAdminRole()", () => {
  it("owner & staff là admin", () => {
    expect(isAdminRole("owner")).toBe(true);
    expect(isAdminRole("staff")).toBe(true);
  });
  it("khác → không phải admin", () => {
    expect(isAdminRole(null)).toBe(false);
    expect(isAdminRole("customer")).toBe(false);
  });
});
