import { describe, it, expect, beforeEach } from "vitest";
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
