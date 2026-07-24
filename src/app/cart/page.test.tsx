import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CartItem } from "@/lib/cart";

const setQuantity = vi.fn();
const removeItem = vi.fn();

type MockCartState = {
  items: CartItem[];
  hasHydrated: boolean;
  setQuantity: typeof setQuantity;
  removeItem: typeof removeItem;
};

let mockState: MockCartState;

vi.mock("@/lib/cart", () => ({
  useCart: (selector: (state: MockCartState) => unknown) => selector(mockState),
}));

// Import sau `vi.mock` để component nhận bản mock của "@/lib/cart".
const { default: CartPage } = await import("./page");

const itemA: CartItem = {
  variantId: "v-1",
  productId: "p-1",
  slug: "giay-a",
  name: "Giày A",
  size: "39",
  color: "Đen",
  unitPrice: 500000,
  imageUrl: null,
  quantity: 2,
};

const itemB: CartItem = {
  variantId: "v-2",
  productId: "p-2",
  slug: "giay-b",
  name: "Giày B",
  size: "40",
  color: "Trắng",
  unitPrice: 300000,
  imageUrl: "https://example.com/b.jpg",
  quantity: 1,
};

beforeEach(() => {
  setQuantity.mockClear();
  removeItem.mockClear();
  mockState = { items: [], hasHydrated: true, setQuantity, removeItem };
});

describe("CartPage", () => {
  it("chưa hydrate xong → không hiện 'Giỏ hàng trống' hay danh sách item (tránh sai lệch)", () => {
    mockState = { items: [itemA], hasHydrated: false, setQuantity, removeItem };
    render(<CartPage />);

    expect(screen.queryByText("Giỏ hàng trống")).not.toBeInTheDocument();
    expect(screen.queryByText("Giày A")).not.toBeInTheDocument();
  });

  it("đã hydrate, giỏ rỗng → hiện 'Giỏ hàng trống' + link tới /products", () => {
    mockState = { items: [], hasHydrated: true, setQuantity, removeItem };
    render(<CartPage />);

    expect(screen.getByText("Giỏ hàng trống")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /sản phẩm/i });
    expect(link).toHaveAttribute("href", "/products");
  });

  it("render tên, size/màu, đơn giá của từng dòng", () => {
    mockState = { items: [itemA, itemB], hasHydrated: true, setQuantity, removeItem };
    render(<CartPage />);

    expect(screen.getByText("Giày A")).toBeInTheDocument();
    expect(screen.getByText("39 / Đen")).toBeInTheDocument();
    expect(screen.getByText("500.000 ₫")).toBeInTheDocument();

    expect(screen.getByText("Giày B")).toBeInTheDocument();
    expect(screen.getByText("40 / Trắng")).toBeInTheDocument();
    expect(screen.getByText("300.000 ₫")).toBeInTheDocument();
  });

  it("imageUrl null → hiện fallback lá, không render <img>", () => {
    mockState = { items: [itemA], hasHydrated: true, setQuantity, removeItem };
    render(<CartPage />);

    expect(screen.getByTestId("product-image-fallback")).toBeInTheDocument();
  });

  it("imageUrl có giá trị → render <img> với đúng src", () => {
    mockState = { items: [itemB], hasHydrated: true, setQuantity, removeItem };
    render(<CartPage />);

    expect(screen.getByRole("img", { name: "Giày B" })).toHaveAttribute(
      "src",
      "https://example.com/b.jpg",
    );
  });

  it("hiện đúng subtotal = cartSubtotal(items)", () => {
    mockState = { items: [itemA, itemB], hasHydrated: true, setQuantity, removeItem };
    render(<CartPage />);

    // 500000*2 + 300000*1 = 1300000
    expect(screen.getByText("1.300.000 ₫")).toBeInTheDocument();
  });

  it("bấm nút tăng số lượng → gọi setQuantity(variantId, quantity + 1)", async () => {
    const user = userEvent.setup();
    mockState = { items: [itemA], hasHydrated: true, setQuantity, removeItem };
    render(<CartPage />);

    await user.click(screen.getByRole("button", { name: /tăng số lượng/i }));

    expect(setQuantity).toHaveBeenCalledWith("v-1", 3);
  });

  it("bấm nút giảm số lượng → gọi setQuantity(variantId, quantity - 1)", async () => {
    const user = userEvent.setup();
    mockState = { items: [itemA], hasHydrated: true, setQuantity, removeItem };
    render(<CartPage />);

    await user.click(screen.getByRole("button", { name: /giảm số lượng/i }));

    expect(setQuantity).toHaveBeenCalledWith("v-1", 1);
  });

  it("sửa trực tiếp ô số lượng → gọi setQuantity với giá trị mới", () => {
    mockState = { items: [itemA], hasHydrated: true, setQuantity, removeItem };
    render(<CartPage />);

    const input = screen.getByRole("spinbutton", { name: /số lượng/i });
    fireEvent.change(input, { target: { value: "5" } });

    expect(setQuantity).toHaveBeenCalledWith("v-1", 5);
  });

  it("bấm nút xoá → gọi removeItem(variantId)", async () => {
    const user = userEvent.setup();
    mockState = { items: [itemA], hasHydrated: true, setQuantity, removeItem };
    render(<CartPage />);

    await user.click(screen.getByRole("button", { name: /xoá/i }));

    expect(removeItem).toHaveBeenCalledWith("v-1");
  });

  it("có nút/link 'Thanh toán' trỏ tới /checkout", () => {
    mockState = { items: [itemA], hasHydrated: true, setQuantity, removeItem };
    render(<CartPage />);

    const checkoutLink = screen.getByRole("link", { name: /thanh toán/i });
    expect(checkoutLink).toHaveAttribute("href", "/checkout");
  });
});
