import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { useCart } from "@/lib/cart";
import { CartHydrator } from "./cart-hydrator";

/**
 * Regression lock cho fix follow-up Day 5 Task 4 (rehydrate app-wide).
 *
 * `CartHydrator` phải gọi `useCart.persist.rehydrate()` ngay sau mount (bên
 * trong `useEffect`), bất kể route nào mount nó — đây là component được mount
 * 1 lần ở root layout để trang chi tiết sản phẩm (vốn không tự gọi
 * `useCartHydrated()`) cũng không còn nguy cơ addToCart trên store `items:
 * []` rồi ghi đè giỏ hàng cũ trong localStorage.
 */
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CartHydrator", () => {
  it("gọi useCart.persist.rehydrate() khi mount", () => {
    const rehydrateSpy = vi
      .spyOn(useCart.persist, "rehydrate")
      .mockResolvedValue(undefined);

    render(<CartHydrator />);

    expect(rehydrateSpy).toHaveBeenCalledTimes(1);
  });

  it("render ra null (không có UI, không gate nội dung nào)", () => {
    vi.spyOn(useCart.persist, "rehydrate").mockResolvedValue(undefined);

    const { container } = render(<CartHydrator />);

    expect(container.firstChild).toBeNull();
  });
});
