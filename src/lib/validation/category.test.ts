import { describe, expect, it } from "vitest";
import { categoryInputSchema } from "./category";

describe("categoryInputSchema", () => {
  it("trims a valid category name", () => {
    expect(categoryInputSchema.parse({ name: "  Giày trẻ em  " })).toEqual({
      name: "Giày trẻ em",
    });
  });

  it("rejects an empty category name", () => {
    expect(categoryInputSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("rejects category names longer than 80 characters", () => {
    expect(categoryInputSchema.safeParse({ name: "a".repeat(81) }).success).toBe(
      false,
    );
  });
});
