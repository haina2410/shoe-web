import { describe, expect, it } from "vitest";
import { OrderStatus } from "@/generated/prisma/enums";
import { parseAdminOrderFilters } from "@/server/queries/admin-orders";

describe("parseAdminOrderFilters", () => {
  it("keeps only exact generated order status values", () => {
    expect(
      parseAdminOrderFilters({ status: OrderStatus.PAID }),
    ).toMatchObject({ status: OrderStatus.PAID });
    expect(parseAdminOrderFilters({ status: "paid" }).status).toBeUndefined();
    expect(parseAdminOrderFilters({ status: "UNKNOWN" }).status).toBeUndefined();
    expect(
      parseAdminOrderFilters({ status: [OrderStatus.PAID] }).status,
    ).toBeUndefined();
  });

  it("keeps only the with refund filter", () => {
    expect(parseAdminOrderFilters({ refund: "with" }).refund).toBe("with");
    expect(parseAdminOrderFilters({ refund: "all" }).refund).toBe("all");
    expect(parseAdminOrderFilters({ refund: "WITH" }).refund).toBe("all");
    expect(parseAdminOrderFilters({ refund: ["with"] }).refund).toBe("all");
  });

  it("rejects array query values to the empty default", () => {
    expect(parseAdminOrderFilters({ query: ["LEAF001"] }).query).toBe("");
  });

  it("trims, uppercases, and caps a scalar query at 32 characters", () => {
    expect(
      parseAdminOrderFilters({ query: "  leafabcd1234  " }).query,
    ).toBe("LEAFABCD1234");
    expect(
      parseAdminOrderFilters({ query: `  ${"a".repeat(40)}  ` }).query,
    ).toBe("A".repeat(32));
  });

  it("uses an empty query for blank or missing input", () => {
    expect(parseAdminOrderFilters({ query: "   " }).query).toBe("");
    expect(parseAdminOrderFilters({}).query).toBe("");
  });
});
