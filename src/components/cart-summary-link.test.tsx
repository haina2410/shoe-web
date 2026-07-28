import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CartItem } from "@/lib/cart";

type MockCartState = {
  hasHydrated: boolean;
  items: CartItem[];
};

let mockState: MockCartState;

vi.mock("@/lib/cart", () => ({
  useCart: (selector: (state: MockCartState) => unknown) => selector(mockState),
  useCartHydrated: () => mockState.hasHydrated,
}));

const { CartSummaryLink } = await import("./cart-summary-link");

const cartItem = (quantity: number): CartItem => ({
  variantId: `variant-${quantity}`,
  productId: "product-1",
  slug: "giay-chay-bo",
  name: "Giày chạy bộ",
  size: "40",
  color: "Đen",
  unitPrice: 500000,
  imageUrl: null,
  quantity,
});

beforeEach(() => {
  mockState = { hasHydrated: false, items: [] };
});

describe("CartSummaryLink", () => {
  it("trước hydration chỉ hiện nhãn ổn định, không lộ số lượng stale", () => {
    mockState = { hasHydrated: false, items: [cartItem(3)] };
    render(<CartSummaryLink />);

    expect(screen.getByRole("link", { name: "Giỏ hàng" })).toHaveTextContent(
      "Giỏ hàng",
    );
    expect(screen.queryByText("3")).not.toBeInTheDocument();
  });

  it("sau hydration hiển thị tổng số sản phẩm bằng text và accessible name", () => {
    mockState = { hasHydrated: true, items: [cartItem(2), cartItem(3)] };
    render(<CartSummaryLink />);

    expect(
      screen.getByRole("link", { name: "Giỏ hàng, 5 sản phẩm" }),
    ).toHaveTextContent("5");
  });
});
