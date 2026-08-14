import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) =>
    createElement("img", props),
}));

import { ProductGallery, type ProductImageSetView } from "./product-gallery";

const imageSets: ProductImageSetView[] = [
  {
    id: "set-black",
    color: "Đen",
    position: 0,
    isDefault: true,
    images: [
      { id: "black-1", url: "/black-1.webp", position: 0 },
      { id: "black-2", url: "/black-2.webp", position: 1 },
    ],
  },
  {
    id: "set-white",
    color: "Trắng",
    position: 1,
    isDefault: false,
    images: [
      { id: "white-1", url: "/white-1.webp", position: 0 },
      { id: "white-2", url: "/white-2.webp", position: 1 },
    ],
  },
];

describe("ProductGallery", () => {
  it("hiển thị bộ mặc định trước khi chọn màu", () => {
    render(
      <ProductGallery
        productName="Giày thử"
        imageSets={imageSets}
        selectedColor={null}
      />,
    );

    expect(screen.getByRole("img", { name: "Giày thử - Đen" })).toHaveAttribute(
      "src",
      "/black-1.webp",
    );
  });

  it("hiển thị bộ trùng màu và fallback về mặc định nếu thiếu", () => {
    const { rerender } = render(
      <ProductGallery
        productName="Giày thử"
        imageSets={imageSets}
        selectedColor="Trắng"
      />,
    );

    expect(screen.getByRole("img", { name: "Giày thử - Trắng" })).toHaveAttribute(
      "src",
      "/white-1.webp",
    );

    rerender(
      <ProductGallery
        productName="Giày thử"
        imageSets={imageSets}
        selectedColor="Xanh"
      />,
    );

    expect(screen.getByRole("img", { name: "Giày thử - Đen" })).toHaveAttribute(
      "src",
      "/black-1.webp",
    );
  });

  it("reset về ảnh đầu khi đổi bộ ảnh", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ProductGallery
        productName="Giày thử"
        imageSets={imageSets}
        selectedColor="Đen"
      />,
    );

    await user.click(
      screen.getAllByRole("button", { name: "Xem ảnh 2 của màu Đen" })[0],
    );
    expect(screen.getByRole("img", { name: "Giày thử - Đen" })).toHaveAttribute(
      "src",
      "/black-2.webp",
    );

    rerender(
      <ProductGallery
        productName="Giày thử"
        imageSets={imageSets}
        selectedColor="Trắng"
      />,
    );

    expect(screen.getByRole("img", { name: "Giày thử - Trắng" })).toHaveAttribute(
      "src",
      "/white-1.webp",
    );
    expect(
      screen.getAllByRole("button", { name: "Xem ảnh 1 của màu Trắng" })[0],
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("hiển thị fallback ổn định khi không có bộ ảnh", () => {
    render(
      <ProductGallery
        productName="Giày thử"
        imageSets={[]}
        selectedColor={null}
      />,
    );

    expect(screen.getByTestId("product-image-fallback")).toBeInTheDocument();
  });
});
