import { describe, expect, it } from "vitest";
import { refundInputSchema } from "./refund";

const VALID_ORDER_ID = "cm12345678901234567890123";

describe("refundInputSchema", () => {
  it.each([1, 60_000, 500_000])(
    "accepts a positive integer VND amount: %s",
    (amount) => {
      expect(
        refundInputSchema.safeParse({
          orderId: VALID_ORDER_ID,
          amount,
        }).success,
      ).toBe(true);
    },
  );

  it.each([0, -1, 10.5, Number.NaN])(
    "rejects an invalid VND amount: %s",
    (amount) => {
      expect(
        refundInputSchema.safeParse({
          orderId: VALID_ORDER_ID,
          amount,
        }).success,
      ).toBe(false);
    },
  );

  it("rejects optional strings above their persisted length bounds", () => {
    expect(
      refundInputSchema.safeParse({
        orderId: VALID_ORDER_ID,
        amount: 1,
        externalReference: "R".repeat(121),
      }).success,
    ).toBe(false);
    expect(
      refundInputSchema.safeParse({
        orderId: VALID_ORDER_ID,
        amount: 1,
        note: "N".repeat(501),
      }).success,
    ).toBe(false);
  });

  it("trims optional strings and normalizes whitespace-only values away", () => {
    expect(
      refundInputSchema.parse({
        orderId: `  ${VALID_ORDER_ID}  `,
        amount: 60_000,
        externalReference: "  REF-123  ",
        note: "   ",
      }),
    ).toEqual({
      orderId: VALID_ORDER_ID,
      amount: 60_000,
      externalReference: "REF-123",
      note: undefined,
    });

    expect(
      refundInputSchema.parse({
        orderId: VALID_ORDER_ID,
        amount: 60_000,
        externalReference: "\n\t",
        note: "  Khách yêu cầu hoàn một phần.  ",
      }),
    ).toEqual({
      orderId: VALID_ORDER_ID,
      amount: 60_000,
      externalReference: undefined,
      note: "Khách yêu cầu hoàn một phần.",
    });
  });
});
