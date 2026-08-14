import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { Variant } from "@/generated/prisma/client";

const addItem = vi.fn();

vi.mock("@/lib/cart", () => ({
  useCart: (selector: (state: { addItem: typeof addItem }) => unknown) =>
    selector({ addItem }),
}));

// Import sau `vi.mock` để component nhận bản mock của "@/lib/cart".
const { VariantSelector } = await import("./variant-selector");

const productContext = {
  productId: "prod-1",
  slug: "giay-sneaker-la",
  name: "Giày Sneaker Lá",
  imageUrl: "https://example.com/a.jpg",
};

beforeEach(() => {
  addItem.mockClear();
});

function makeVariant(overrides: Partial<Variant>): Variant {
  return {
    id: "var-1",
    productId: "prod-1",
    size: "39",
    color: "Đen",
    sku: "SKU-1",
    priceOverride: null,
    stock: 0,
    ...overrides,
  };
}

// Bộ variant dùng chung cho các test: 39/Đen còn hàng, 39/Trắng hết hàng,
// 40/Đen KHÔNG tồn tại (không có variant nào khớp size=40,color=Đen).
const variants: Variant[] = [
  makeVariant({ id: "v-39-den", size: "39", color: "Đen", sku: "SKU-39-DEN", stock: 5 }),
  makeVariant({ id: "v-39-trang", size: "39", color: "Trắng", sku: "SKU-39-TRANG", stock: 0 }),
  makeVariant({
    id: "v-40-trang",
    size: "40",
    color: "Trắng",
    sku: "SKU-40-TRANG",
    stock: 3,
    priceOverride: 750000,
  }),
];

function ControlledVariantSelector({ imageUrl = productContext.imageUrl }) {
  const [selectedColor, setSelectedColor] = useState<string | null>(null);

  return (
    <VariantSelector
      variants={variants}
      basePrice={890000}
      {...productContext}
      imageUrl={imageUrl}
      selectedColor={selectedColor}
      onColorChange={setSelectedColor}
    />
  );
}

describe("VariantSelector", () => {
  it("trước khi chọn đủ size và màu → hướng dẫn chọn thay vì báo tổ hợp không tồn tại", () => {
    render(
      <ControlledVariantSelector />,
    );

    expect(
      screen.getByText("Chọn kích cỡ và màu sắc để xem tồn kho"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Không có lựa chọn này")).not.toBeInTheDocument();
  });

  it("chọn size+màu còn hàng → hiện đúng số lượng tồn kho", async () => {
    const user = userEvent.setup();
    render(
      <ControlledVariantSelector />,
    );

    await user.click(screen.getByRole("radio", { name: "39" }));
    await user.click(screen.getByRole("radio", { name: "Đen" }));

    expect(screen.getByText("Còn 5 sản phẩm")).toBeInTheDocument();
  });

  it("chọn tổ hợp hết hàng (stock = 0) → hiện 'Hết hàng' và nút thêm giỏ bị disable", async () => {
    const user = userEvent.setup();
    render(
      <ControlledVariantSelector />,
    );

    await user.click(screen.getByRole("radio", { name: "39" }));
    await user.click(screen.getByRole("radio", { name: "Trắng" }));

    expect(screen.getByText("Hết hàng")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /thêm vào giỏ/i })).toBeDisabled();
  });

  it("tổ hợp size+màu không tồn tại variant nào → không crash, báo không có lựa chọn", async () => {
    const user = userEvent.setup();
    render(
      <ControlledVariantSelector />,
    );

    // size 40 chỉ tồn tại với màu Trắng, không có 40/Đen.
    await user.click(screen.getByRole("radio", { name: "40" }));
    await user.click(screen.getByRole("radio", { name: "Đen" }));

    expect(screen.getByText("Không có lựa chọn này")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /thêm vào giỏ/i })).toBeDisabled();
  });

  it("hiển thị giá theo priceOverride của variant đang chọn khi có", async () => {
    const user = userEvent.setup();
    render(
      <ControlledVariantSelector />,
    );

    await user.click(screen.getByRole("radio", { name: "40" }));
    await user.click(screen.getByRole("radio", { name: "Trắng" }));

    expect(screen.getByText("750.000 ₫")).toBeInTheDocument();
  });

  it("nút thêm vào giỏ disabled khi chưa chọn đủ size+màu, hoặc tổ hợp hết hàng", async () => {
    const user = userEvent.setup();
    render(
      <ControlledVariantSelector />,
    );

    // Trước khi chọn gì, nút disabled.
    expect(screen.getByRole("button", { name: /thêm vào giỏ/i })).toBeDisabled();

    // 39/Trắng tồn tại nhưng hết hàng (stock = 0) → vẫn disabled.
    await user.click(screen.getByRole("radio", { name: "39" }));
    await user.click(screen.getByRole("radio", { name: "Trắng" }));
    expect(screen.getByRole("button", { name: /thêm vào giỏ/i })).toBeDisabled();

    expect(addItem).not.toHaveBeenCalled();
  });

  it("chọn variant còn hàng → nút thêm vào giỏ được bật, click gọi addItem với đúng dữ liệu", async () => {
    const user = userEvent.setup();
    render(
      <ControlledVariantSelector />,
    );

    await user.click(screen.getByRole("radio", { name: "39" }));
    await user.click(screen.getByRole("radio", { name: "Đen" }));

    const addButton = screen.getByRole("button", { name: /thêm vào giỏ/i });
    expect(addButton).toBeEnabled();

    await user.click(addButton);

    expect(addItem).toHaveBeenCalledTimes(1);
    expect(addItem).toHaveBeenCalledWith({
      variantId: "v-39-den",
      productId: "prod-1",
      slug: "giay-sneaker-la",
      name: "Giày Sneaker Lá",
      size: "39",
      color: "Đen",
      unitPrice: 890000,
      imageUrl: "https://example.com/a.jpg",
    });
  });

  it("dùng priceOverride của variant làm unitPrice khi thêm vào giỏ", async () => {
    const user = userEvent.setup();
    render(
      <ControlledVariantSelector />,
    );

    await user.click(screen.getByRole("radio", { name: "40" }));
    await user.click(screen.getByRole("radio", { name: "Trắng" }));
    await user.click(screen.getByRole("button", { name: /thêm vào giỏ/i }));

    expect(addItem).toHaveBeenCalledWith(
      expect.objectContaining({ variantId: "v-40-trang", unitPrice: 750000 }),
    );
  });

  it("sau khi thêm vào giỏ, hiện phản hồi liên kết tới trang giỏ hàng", async () => {
    const user = userEvent.setup();
    render(
      <ControlledVariantSelector />,
    );

    await user.click(screen.getByRole("radio", { name: "39" }));
    await user.click(screen.getByRole("radio", { name: "Đen" }));
    await user.click(screen.getByRole("button", { name: /thêm vào giỏ/i }));

    const cartLink = screen.getByRole("link", { name: /xem giỏ hàng/i });
    expect(cartLink).toHaveAttribute("href", "/cart");
  });

  it("gửi màu được chọn lên component cha", async () => {
    const user = userEvent.setup();
    const onColorChange = vi.fn();
    render(
      <VariantSelector
        variants={variants}
        basePrice={890000}
        {...productContext}
        selectedColor={null}
        onColorChange={onColorChange}
      />,
    );

    await user.click(screen.getByRole("radio", { name: "Trắng" }));

    expect(onColorChange).toHaveBeenCalledWith("Trắng");
  });
});
