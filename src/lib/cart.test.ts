import { createElement } from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { useCart } from "./cart";

/**
 * Reset store + localStorage thật (jsdom) trước mỗi test để các test độc
 * lập với nhau — `useCart` là singleton module-level nên state rò rỉ giữa
 * các test nếu không reset.
 */
beforeEach(() => {
  useCart.setState({ items: [], hasHydrated: true });
  window.localStorage.clear();
});

const baseItem = {
  variantId: "v-1",
  productId: "p-1",
  slug: "giay-a",
  name: "Giày A",
  size: "39",
  color: "Đen",
  unitPrice: 500000,
  imageUrl: null as string | null,
};

describe("useCart", () => {
  it("addItem thêm dòng mới với quantity mặc định = 1", () => {
    useCart.getState().addItem(baseItem);
    expect(useCart.getState().items).toEqual([{ ...baseItem, quantity: 1 }]);
  });

  it("addItem với quantity chỉ định dùng đúng quantity đó", () => {
    useCart.getState().addItem({ ...baseItem, quantity: 3 });
    expect(useCart.getState().items).toEqual([{ ...baseItem, quantity: 3 }]);
  });

  it("addItem cùng variantId → gộp, cộng dồn quantity thay vì tạo dòng mới", () => {
    useCart.getState().addItem(baseItem);
    useCart.getState().addItem({ ...baseItem, quantity: 2 });

    const items = useCart.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(3);
  });

  it("addItem variantId khác nhau → tạo 2 dòng riêng biệt", () => {
    useCart.getState().addItem(baseItem);
    useCart.getState().addItem({ ...baseItem, variantId: "v-2", size: "40" });

    expect(useCart.getState().items).toHaveLength(2);
  });

  it("setQuantity cập nhật đúng số lượng của dòng khớp variantId", () => {
    useCart.getState().addItem(baseItem);
    useCart.getState().setQuantity("v-1", 5);

    expect(useCart.getState().items[0].quantity).toBe(5);
  });

  it("setQuantity q<=0 xoá dòng khỏi giỏ", () => {
    useCart.getState().addItem(baseItem);
    useCart.getState().setQuantity("v-1", 0);

    expect(useCart.getState().items).toEqual([]);
  });

  it("setQuantity với số âm cũng xoá dòng", () => {
    useCart.getState().addItem(baseItem);
    useCart.getState().setQuantity("v-1", -2);

    expect(useCart.getState().items).toEqual([]);
  });

  it("removeItem xoá đúng dòng theo variantId, giữ nguyên dòng khác", () => {
    useCart.getState().addItem(baseItem);
    useCart.getState().addItem({ ...baseItem, variantId: "v-2", size: "40" });
    useCart.getState().removeItem("v-1");

    const items = useCart.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].variantId).toBe("v-2");
  });

  it("clear xoá toàn bộ giỏ hàng", () => {
    useCart.getState().addItem(baseItem);
    useCart.getState().addItem({ ...baseItem, variantId: "v-2" });
    useCart.getState().clear();

    expect(useCart.getState().items).toEqual([]);
  });

  it("subtotal (cartSubtotal trên items) tính đúng tổng tiền", () => {
    useCart.getState().addItem({ ...baseItem, unitPrice: 500000, quantity: 2 });
    useCart.getState().addItem({ ...baseItem, variantId: "v-2", unitPrice: 100000, quantity: 3 });

    const items = useCart.getState().items;
    const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    expect(subtotal).toBe(1_300_000);
  });
});

/**
 * Regression lock cho fix hydration mismatch (CRITICAL, review Day 5 Task 4).
 *
 * Dùng store THẬT (không mock `@/lib/cart`) qua `vi.resetModules()` + import
 * động, để mô phỏng đúng thời điểm module được đánh giá lần đầu trên client —
 * kể cả khi `localStorage` đã có sẵn dữ liệu giỏ hàng cũ từ phiên trước.
 *
 * Với `skipHydration: true`, store phải khởi tạo `{ hasHydrated: false, items:
 * [] }` NGAY LẬP TỨC sau khi import (không tự đọc localStorage lúc module
 * eval) — khớp với HTML server-render. Chỉ sau khi gọi `persist.rehydrate()`
 * (được trigger từ `useEffect`, tức là sau lần render đầu tiên trên client)
 * thì `items` mới được nạp và `hasHydrated` mới chuyển `false → true`.
 */
describe("hydration (skipHydration)", () => {
  it("skipHydration: sau import, store là {hasHydrated:false, items:[]} dù localStorage đã có dữ liệu cũ; rehydrate() mới nạp thật và chuyển hasHydrated → true", async () => {
    window.localStorage.setItem(
      "leafshoes-cart",
      JSON.stringify({
        state: { items: [{ ...baseItem, quantity: 4 }] },
        version: 0,
      }),
    );

    vi.resetModules();
    const freshModule = await import("./cart");
    const freshUseCart = freshModule.useCart;

    // Trạng thái ngay sau import (trước rehydrate) phải trung tính — giống
    // hệt server — dù localStorage đã có dữ liệu.
    expect(freshUseCart.getState().hasHydrated).toBe(false);
    expect(freshUseCart.getState().items).toEqual([]);

    await freshUseCart.persist.rehydrate();

    // Sau rehydrate: dữ liệu thật đã nạp, cờ đã chuyển true — chuyển thật
    // false → true, không phải set cứng.
    expect(freshUseCart.getState().hasHydrated).toBe(true);
    expect(freshUseCart.getState().items).toEqual([
      { ...baseItem, quantity: 4 },
    ]);
  });

  it("useCartHydrated(): lần render đầu tiên trả về false (khớp placeholder SSR), rồi chuyển true sau khi rehydrate xong", async () => {
    window.localStorage.setItem(
      "leafshoes-cart",
      JSON.stringify({
        state: { items: [{ ...baseItem, quantity: 1 }] },
        version: 0,
      }),
    );

    vi.resetModules();
    const freshModule = await import("./cart");
    const { useCartHydrated, useCart: freshUseCart } = freshModule;

    const seenValues: boolean[] = [];
    function TestComponent() {
      seenValues.push(useCartHydrated());
      return null;
    }

    render(createElement(TestComponent));

    // Render ĐẦU TIÊN (trước khi effect trigger rehydrate) phải là `false` —
    // khớp với HTML server-render, không có hydration mismatch.
    expect(seenValues[0]).toBe(false);
    // Sau khi effect chạy (client-only) và rehydrate hoàn tất, giá trị mới
    // nhất phải là `true`, và store đã nạp đúng dữ liệu persisted.
    expect(seenValues[seenValues.length - 1]).toBe(true);
    expect(freshUseCart.getState().items).toEqual([
      { ...baseItem, quantity: 1 },
    ]);
  });
});
