import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CartItem } from "@/lib/cart";
import { PROVINCES } from "@/lib/provinces";

// `vi.mock(...)` bị hoist lên đầu file bởi vitest — mọi biến các factory bên
// dưới tham chiếu tới phải khai báo qua `vi.hoisted` để tránh lỗi
// "Cannot access '...' before initialization" (giống `checkout.test.ts`).
const { createOrderActionMock, pushMock, clearMock } = vi.hoisted(() => ({
  createOrderActionMock: vi.fn(),
  pushMock: vi.fn(),
  clearMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/server/actions/checkout", () => ({
  createOrderAction: createOrderActionMock,
}));

type MockCartState = {
  items: CartItem[];
  clear: typeof clearMock;
};

let mockState: MockCartState;

vi.mock("@/lib/cart", () => ({
  useCart: (selector: (state: MockCartState) => unknown) => selector(mockState),
  useCartHydrated: () => true,
}));

// Import SAU khi mock đã đăng ký để component nhận bản mock của "@/lib/cart".
const { default: CheckoutPage } = await import("./page");

const item: CartItem = {
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

beforeEach(() => {
  createOrderActionMock.mockClear();
  pushMock.mockClear();
  clearMock.mockClear();
  mockState = { items: [item], clear: clearMock };
});

describe("CheckoutPage", () => {
  it("<select> tỉnh/thành hiện đủ 34 option từ PROVINCES", () => {
    render(<CheckoutPage />);
    const select = screen.getByLabelText(/tỉnh\/thành/i);
    const options = within(select).getAllByRole("option");
    expect(options).toHaveLength(PROVINCES.length);
    expect(options.map((o) => o.textContent)).toEqual([...PROVINCES]);
  });

  it("giỏ hàng rỗng → hiện 'Giỏ hàng trống' + link /products, KHÔNG hiện form", () => {
    mockState = { items: [], clear: clearMock };
    render(<CheckoutPage />);

    expect(screen.getByText("Giỏ hàng trống")).toBeInTheDocument();
    expect(screen.queryByLabelText(/họ tên/i)).not.toBeInTheDocument();
    const link = screen.getByRole("link", { name: /sản phẩm/i });
    expect(link).toHaveAttribute("href", "/products");
  });

  it("submit form hợp lệ → gọi createOrderAction với items map đúng (chỉ variantId+quantity)", async () => {
    createOrderActionMock.mockResolvedValue({ ok: true, orderCode: "LEAFABC123" });
    const user = userEvent.setup();
    render(<CheckoutPage />);

    await user.type(screen.getByLabelText(/họ tên/i), "Nguyễn Văn A");
    await user.type(screen.getByLabelText(/^email$/i), "khach@example.com");
    await user.type(screen.getByLabelText(/số điện thoại/i), "0901234567");
    await user.selectOptions(screen.getByLabelText(/tỉnh\/thành/i), "Hà Nội");
    await user.type(screen.getByLabelText(/phường\/xã/i), "Phường Ba Đình");
    await user.type(screen.getByLabelText(/địa chỉ/i), "123 Đường Láng");

    await user.click(screen.getByRole("button", { name: /đặt hàng/i }));

    await waitFor(() => expect(createOrderActionMock).toHaveBeenCalledTimes(1));
    expect(createOrderActionMock).toHaveBeenCalledWith({
      customerName: "Nguyễn Văn A",
      email: "khach@example.com",
      phone: "0901234567",
      province: "Hà Nội",
      ward: "Phường Ba Đình",
      addressLine: "123 Đường Láng",
      note: undefined,
      items: [{ variantId: "v-1", quantity: 2 }],
    });
  });

  it("submit thành công → clear() giỏ hàng rồi điều hướng tới /orders/<orderCode>", async () => {
    createOrderActionMock.mockResolvedValue({ ok: true, orderCode: "LEAFABC123" });
    const user = userEvent.setup();
    render(<CheckoutPage />);

    await user.type(screen.getByLabelText(/họ tên/i), "Nguyễn Văn A");
    await user.type(screen.getByLabelText(/^email$/i), "khach@example.com");
    await user.type(screen.getByLabelText(/số điện thoại/i), "0901234567");
    await user.type(screen.getByLabelText(/phường\/xã/i), "Phường Ba Đình");
    await user.type(screen.getByLabelText(/địa chỉ/i), "123 Đường Láng");
    await user.click(screen.getByRole("button", { name: /đặt hàng/i }));

    await waitFor(() => expect(clearMock).toHaveBeenCalledTimes(1));
    expect(pushMock).toHaveBeenCalledWith("/orders/LEAFABC123");
  });

  it("submit thất bại (res.ok=false) → hiện lỗi tiếng Việt, KHÔNG clear() và KHÔNG điều hướng", async () => {
    createOrderActionMock.mockResolvedValue({
      ok: false,
      error: "Sản phẩm đã hết hàng.",
    });
    const user = userEvent.setup();
    render(<CheckoutPage />);

    await user.type(screen.getByLabelText(/họ tên/i), "Nguyễn Văn A");
    await user.type(screen.getByLabelText(/^email$/i), "khach@example.com");
    await user.type(screen.getByLabelText(/số điện thoại/i), "0901234567");
    await user.type(screen.getByLabelText(/phường\/xã/i), "Phường Ba Đình");
    await user.type(screen.getByLabelText(/địa chỉ/i), "123 Đường Láng");
    await user.click(screen.getByRole("button", { name: /đặt hàng/i }));

    expect(await screen.findByText("Sản phẩm đã hết hàng.")).toBeInTheDocument();
    expect(clearMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("hiện subtotal = cartSubtotal(items) trong tóm tắt đơn hàng", () => {
    const itemB: CartItem = {
      variantId: "v-2",
      productId: "p-2",
      slug: "giay-b",
      name: "Giày B",
      size: "40",
      color: "Trắng",
      unitPrice: 300000,
      imageUrl: null,
      quantity: 1,
    };
    mockState = { items: [item, itemB], clear: clearMock };
    render(<CheckoutPage />);

    // Tạm tính = 500000*2 + 300000*1 = 1.300.000, khác với mọi dòng lẻ
    // (1.000.000 và 300.000) — không nhập nhằng khi query bằng text.
    expect(screen.getByText("1.300.000 ₫")).toBeInTheDocument();
  });
});
