import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const addItem = vi.fn();

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) =>
    createElement("img", props),
}));

vi.mock("@/lib/cart", () => ({
  useCart: (selector: (state: { addItem: typeof addItem }) => unknown) =>
    selector({ addItem }),
}));

import { ProductDetailExperience } from "./product-detail-experience";

const product = {
  id: "product-1",
  slug: "giay-thu",
  name: "Giày thử",
  description: "Êm nhẹ.",
  categoryName: "Sneaker",
  basePrice: 890000,
  variants: [
    {
      id: "black-variant",
      productId: "product-1",
      size: "39",
      color: "Đen",
      sku: "BLACK-39",
      priceOverride: null,
      stock: 3,
    },
    {
      id: "white-variant",
      productId: "product-1",
      size: "39",
      color: "Trắng",
      sku: "WHITE-39",
      priceOverride: null,
      stock: 3,
    },
    {
      id: "green-variant",
      productId: "product-1",
      size: "39",
      color: "Xanh",
      sku: "GREEN-39",
      priceOverride: null,
      stock: 3,
    },
  ],
  imageSets: [
    {
      id: "black-set",
      color: "Đen",
      position: 0,
      isDefault: true,
      images: [
        { id: "black-1", url: "/black-1.webp", position: 0 },
        { id: "black-2", url: "/black-2.webp", position: 1 },
      ],
    },
    {
      id: "white-set",
      color: "Trắng",
      position: 1,
      isDefault: false,
      images: [
        { id: "white-1", url: "/white-1.webp", position: 0 },
        { id: "white-2", url: "/white-2.webp", position: 1 },
      ],
    },
  ],
};

beforeEach(() => {
  addItem.mockClear();
});

describe("ProductDetailExperience", () => {
  it("đổi gallery theo màu và dùng ảnh đầu của bộ đó trong giỏ", async () => {
    const user = userEvent.setup();
    render(<ProductDetailExperience product={product} />);

    await user.click(screen.getByRole("radio", { name: "39" }));
    await user.click(screen.getByRole("radio", { name: "Trắng" }));
    expect(screen.getByRole("img", { name: "Giày thử - Trắng" })).toHaveAttribute(
      "src",
      "/white-1.webp",
    );

    await user.click(
      screen.getAllByRole("button", { name: "Xem ảnh 2 của màu Trắng" })[0],
    );
    expect(screen.getByRole("img", { name: "Giày thử - Trắng" })).toHaveAttribute(
      "src",
      "/white-2.webp",
    );
    await user.click(screen.getByRole("button", { name: "Thêm vào giỏ" }));

    expect(addItem).toHaveBeenCalledWith(
      expect.objectContaining({ color: "Trắng", imageUrl: "/white-1.webp" }),
    );
  });

  it("fallback về bộ mặc định khi màu không có bộ ảnh", async () => {
    const user = userEvent.setup();
    render(<ProductDetailExperience product={product} />);

    await user.click(screen.getByRole("radio", { name: "39" }));
    await user.click(screen.getByRole("radio", { name: "Xanh" }));
    expect(screen.getByRole("img", { name: "Giày thử - Đen" })).toHaveAttribute(
      "src",
      "/black-1.webp",
    );
    await user.click(screen.getByRole("button", { name: "Thêm vào giỏ" }));

    expect(addItem).toHaveBeenCalledWith(
      expect.objectContaining({ color: "Xanh", imageUrl: "/black-1.webp" }),
    );
  });
});
