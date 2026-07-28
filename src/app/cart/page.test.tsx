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
  useCartHydrated: () => mockState.hasHydrated,
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
    expect(
      screen.getByRole("status", { name: "Đang tải giỏ hàng" }),
    ).toBeInTheDocument();
  });

  it("đã hydrate, giỏ rỗng → hiện 'Giỏ hàng trống' + link tới /products", () => {
    mockState = { items: [], hasHydrated: true, setQuantity, removeItem };
    render(<CartPage />);

    expect(
      screen.getByRole("heading", { name: "Giỏ hàng trống" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/chọn một đôi giày/i)).toBeInTheDocument();
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

  it("sửa trực tiếp ô số lượng rồi rời khỏi ô (blur) → gọi setQuantity với giá trị mới", () => {
    mockState = { items: [itemA], hasHydrated: true, setQuantity, removeItem };
    render(<CartPage />);

    const input = screen.getByRole("spinbutton", { name: /số lượng/i });
    fireEvent.change(input, { target: { value: "5" } });
    // Chỉ gõ (chưa rời ô) KHÔNG được commit vào store ngay — tránh side
    // effect trên mỗi keystroke (xem test "xoá trắng..." bên dưới).
    expect(setQuantity).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(setQuantity).toHaveBeenCalledWith("v-1", 5);
  });

  it("xoá trắng ô số lượng (giữa lúc gõ) → KHÔNG gọi setQuantity, KHÔNG xoá dòng", () => {
    mockState = { items: [itemA], hasHydrated: true, setQuantity, removeItem };
    render(<CartPage />);

    const input = screen.getByRole("spinbutton", { name: /số lượng/i });
    fireEvent.change(input, { target: { value: "" } });

    expect(setQuantity).not.toHaveBeenCalled();
    expect(screen.getByText("Giày A")).toBeInTheDocument();
  });

  it("xoá trắng ô số lượng rồi blur → KHÔNG commit (0/NaN), ô reset về số lượng hiện tại trong store", () => {
    mockState = { items: [itemA], hasHydrated: true, setQuantity, removeItem };
    render(<CartPage />);

    const input = screen.getByRole<HTMLInputElement>("spinbutton", {
      name: /số lượng/i,
    });
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    expect(setQuantity).not.toHaveBeenCalled();
    expect(input.value).toBe("2");
  });

  it("gõ giá trị không hợp lệ (0) rồi blur → KHÔNG commit, ô reset về số lượng hiện tại", () => {
    mockState = { items: [itemA], hasHydrated: true, setQuantity, removeItem };
    render(<CartPage />);

    const input = screen.getByRole<HTMLInputElement>("spinbutton", {
      name: /số lượng/i,
    });
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.blur(input);

    expect(setQuantity).not.toHaveBeenCalled();
    expect(input.value).toBe("2");
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

  it("2 dòng CÙNG tên sản phẩm, khác size/màu → aria-label của nút tăng/giảm/xoá và ô số lượng phân biệt được theo (size, màu), không trùng accessible name", () => {
    const itemASameNameOtherVariant: typeof itemA = {
      ...itemA,
      variantId: "v-3",
      size: "41",
      color: "Xanh",
      quantity: 4,
    };
    mockState = {
      items: [itemA, itemASameNameOtherVariant],
      hasHydrated: true,
      setQuantity,
      removeItem,
    };
    render(<CartPage />);

    // Mỗi dòng phải có accessible name RIÊNG (khớp chính xác chuỗi mong đợi
    // bao gồm size/màu) — nếu 2 dòng trùng tên, getByRole với chuỗi đầy đủ
    // này sẽ throw "found multiple elements" thay vì tìm đúng 1 phần tử.
    expect(
      screen.getByRole("button", {
        name: `Tăng số lượng ${itemA.name} (${itemA.size}, ${itemA.color})`,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: `Tăng số lượng ${itemASameNameOtherVariant.name} (${itemASameNameOtherVariant.size}, ${itemASameNameOtherVariant.color})`,
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: `Giảm số lượng ${itemA.name} (${itemA.size}, ${itemA.color})`,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: `Giảm số lượng ${itemASameNameOtherVariant.name} (${itemASameNameOtherVariant.size}, ${itemASameNameOtherVariant.color})`,
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("spinbutton", {
        name: `Số lượng ${itemA.name} (${itemA.size}, ${itemA.color})`,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("spinbutton", {
        name: `Số lượng ${itemASameNameOtherVariant.name} (${itemASameNameOtherVariant.size}, ${itemASameNameOtherVariant.color})`,
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: `Xoá ${itemA.name} (${itemA.size}, ${itemA.color}) khỏi giỏ hàng`,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: `Xoá ${itemASameNameOtherVariant.name} (${itemASameNameOtherVariant.size}, ${itemASameNameOtherVariant.color}) khỏi giỏ hàng`,
      }),
    ).toBeInTheDocument();
  });
});
