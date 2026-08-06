import { describe, expect, it } from "vitest";
import { buildOrderLookupUrl } from "@/lib/order-url";

describe("buildOrderLookupUrl", () => {
  it("builds canonical lookup URLs with encoded order codes", () => {
    expect(buildOrderLookupUrl("https://leafshoes.vn", "LEAFABC123")).toBe(
      "https://leafshoes.vn/orders?orderCode=LEAFABC123",
    );
    expect(buildOrderLookupUrl("https://leafshoes.vn/app", "LEAF A&B")).toBe(
      "https://leafshoes.vn/orders?orderCode=LEAF+A%26B",
    );
  });
});
