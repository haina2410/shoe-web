import { describe, it, expect } from "vitest";
import { cartSubtotal, orderTotal } from "@/lib/cart-math";

describe("cartSubtotal()", () => {
  it("tính tổng unitPrice * quantity cho nhiều dòng", () => {
    expect(
      cartSubtotal([
        { unitPrice: 250000, quantity: 2 },
        { unitPrice: 100000, quantity: 1 },
      ]),
    ).toBe(600000);
  });

  it("mảng rỗng trả 0", () => {
    expect(cartSubtotal([])).toBe(0);
  });

  it("1 dòng duy nhất", () => {
    expect(cartSubtotal([{ unitPrice: 500000, quantity: 3 }])).toBe(1500000);
  });
});

describe("orderTotal()", () => {
  it("cộng subtotal + shippingFee", () => {
    expect(orderTotal(600000, 30000)).toBe(630000);
  });

  it("shippingFee = 0 trả nguyên subtotal", () => {
    expect(orderTotal(600000, 0)).toBe(600000);
  });
});
