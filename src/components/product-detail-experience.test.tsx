import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    sizes,
    className,
    onLoad,
  }: React.ImgHTMLAttributes<HTMLImageElement>) =>
    createElement("img", { src, alt, sizes, className, onLoad }),
}));

import { useCart } from "@/lib/cart";
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
  useCart.getState().clear();
});

describe("ProductDetailExperience", () => {
  it("mở trang chi tiết → chọn sẵn variant còn hàng đầu tiên, nút thêm giỏ bật sẵn", async () => {
    const user = userEvent.setup();
    render(<ProductDetailExperience product={product} />);

    expect(screen.getByRole("radio", { name: "39" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "Đen" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    const addButton = screen.getByRole("button", { name: "Thêm vào giỏ" });
    expect(addButton).toBeEnabled();
    await user.click(addButton);

    expect(useCart.getState().items).toEqual([
      expect.objectContaining({ variantId: "black-variant" }),
    ]);
  });

  it("bỏ qua variant hết hàng khi chọn sẵn", () => {
    render(
      <ProductDetailExperience
        product={{
          ...product,
          variants: [
            { ...product.variants[0], stock: 0 },
            { ...product.variants[1], stock: 0 },
            { ...product.variants[2], size: "40" },
          ],
        }}
      />,
    );

    expect(screen.getByRole("radio", { name: "40" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "Xanh" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("button", { name: "Thêm vào giỏ" })).toBeEnabled();
  });

  it("đổi gallery theo màu và dùng ảnh đầu của bộ đó trong giỏ", async () => {
    const user = userEvent.setup();
    render(<ProductDetailExperience product={product} />);

    await user.click(screen.getByRole("radio", { name: "39" }));
    await user.click(screen.getByRole("radio", { name: "Trắng" }));
    expect(
      screen.getByRole("img", { name: "Giày thử - Trắng" }),
    ).toHaveAttribute("src", "/white-1.webp");

    await user.click(
      screen.getAllByRole("button", { name: "Xem ảnh 2 của màu Trắng" })[0],
    );
    expect(
      screen.getByRole("img", { name: "Giày thử - Trắng" }),
    ).toHaveAttribute("src", "/white-2.webp");
    await user.click(screen.getByRole("button", { name: "Thêm vào giỏ" }));

    expect(useCart.getState().items).toEqual([
      expect.objectContaining({ color: "Trắng", imageUrl: "/white-1.webp" }),
    ]);
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

    expect(useCart.getState().items).toEqual([
      expect.objectContaining({ color: "Xanh", imageUrl: "/black-1.webp" }),
    ]);
  });

  it("hiện toàn bộ ảnh của mọi màu dù đã chọn màu", () => {
    render(<ProductDetailExperience product={product} />);

    for (const color of ["Đen", "Trắng"]) {
      for (const index of [1, 2]) {
        expect(
          screen.getAllByRole("button", {
            name: `Xem ảnh ${index} của màu ${color}`,
          }),
        ).toHaveLength(2);
      }
    }
  });

  it.each([0, 1])(
    "bấm thumbnail trong dải %i chọn đúng ảnh, màu và biến thể giỏ",
    async (strip) => {
      const user = userEvent.setup();
      render(
        <ProductDetailExperience
          product={{
            ...product,
            variants: [
              ...product.variants,
              { ...product.variants[0], id: "black-40", size: "40" },
              {
                ...product.variants[1],
                id: "white-40",
                size: "40",
                stock: 7,
                priceOverride: 750000,
              },
            ],
          }}
        />,
      );

      await user.click(screen.getByRole("radio", { name: "40" }));

      await user.click(
        screen.getAllByRole("button", { name: "Xem ảnh 2 của màu Trắng" })[
          strip
        ],
      );

      expect(
        screen.getByRole("img", { name: "Giày thử - Trắng" }),
      ).toHaveAttribute("src", "/white-2.webp");
      expect(screen.getByRole("radio", { name: "Trắng" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
      expect(screen.getByRole("radio", { name: "Đen" })).toHaveAttribute(
        "aria-checked",
        "false",
      );
      expect(screen.getByRole("radio", { name: "40" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
      expect(screen.getByText("750.000 ₫")).toBeInTheDocument();
      expect(screen.getByText("Còn 7 sản phẩm")).toBeInTheDocument();
      expect(
        screen.getAllByRole("button", { name: "Xem ảnh 2 của màu Trắng" })[
          strip
        ],
      ).toHaveAttribute("aria-pressed", "true");

      await user.click(screen.getByRole("button", { name: "Thêm vào giỏ" }));
      expect(useCart.getState().items).toEqual([
        expect.objectContaining({
          variantId: "white-40",
          color: "Trắng",
          size: "40",
          unitPrice: 750000,
          imageUrl: "/white-1.webp",
        }),
      ]);

      await user.click(
        screen.getAllByRole("button", { name: "Xem ảnh 2 của màu Đen" })[strip],
      );
      expect(
        screen.getByRole("img", { name: "Giày thử - Đen" }),
      ).toHaveAttribute("src", "/black-2.webp");
      expect(screen.getByRole("radio", { name: "Đen" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
      expect(
        screen.queryByRole("link", { name: /xem giỏ hàng/i }),
      ).not.toBeInTheDocument();
    },
  );

  it.each([
    { stock: 0, size: "39", status: "Hết hàng" },
    { stock: 3, size: "40", status: "Không có lựa chọn này" },
  ])(
    "chọn ảnh vẫn xem được khi tổ hợp màu và size báo '$status'",
    async ({ stock, size, status }) => {
      const user = userEvent.setup();
      render(
        <ProductDetailExperience
          product={{
            ...product,
            variants: product.variants.map((variant) =>
              variant.color === "Trắng" ? { ...variant, stock, size } : variant,
            ),
          }}
        />,
      );

      await user.click(
        screen.getAllByRole("button", { name: "Xem ảnh 2 của màu Trắng" })[0],
      );
      expect(
        screen.getByRole("img", { name: "Giày thử - Trắng" }),
      ).toHaveAttribute("src", "/white-2.webp");
      expect(screen.getByRole("radio", { name: "Trắng" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
      expect(screen.getByRole("radio", { name: "39" })).toHaveAttribute(
        "aria-checked",
        "true",
      );
      expect(screen.getByText(status)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Thêm vào giỏ" }),
      ).toBeDisabled();
      expect(useCart.getState().items).toEqual([]);
    },
  );
});
