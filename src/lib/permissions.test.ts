import { describe, it, expect } from "vitest";
import { roles } from "./permissions";

describe("RBAC roles", () => {
  it("định nghĩa role owner và staff", () => {
    expect(Object.keys(roles).sort()).toEqual(["owner", "staff"]);
  });

  it("gives owners category mutations and staff read-only access", () => {
    expect(roles.owner.authorize({ category: ["create", "update", "delete"] }).success).toBe(true);
    expect(roles.staff.authorize({ category: ["read"] }).success).toBe(true);
    expect(roles.staff.authorize({ category: ["delete"] }).success).toBe(false);
  });
});
