import { describe, it, expect } from "vitest";
import { roles } from "./permissions";

describe("RBAC roles", () => {
  it("định nghĩa role owner và staff", () => {
    expect(Object.keys(roles).sort()).toEqual(["owner", "staff"]);
  });
});
