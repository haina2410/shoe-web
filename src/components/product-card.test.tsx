import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProductCard } from "./product-card";
import type { CatalogListItem } from "@/server/queries/catalog";

vi.mock("next/image", () => ({
  default: ({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} {...props} />
  ),
}));

const baseItem: CatalogListItem = {
  id: "prod-1",
  slug: "giay-chay-bo-nam",
  name: "Giày chạy bộ nam",
  basePrice: 890000,
  imageUrl: "/uploads/giay-chay-bo-nam.jpg",
  imagePreviews: [
    { color: "Đen", url: "/uploads/giay-den.jpg" },
    { color: "Trắng", url: "/uploads/giay-trang.jpg" },
  ],
  colors: ["Đen", "Trắng"],
  sizes: ["40", "41"],
  totalStock: 12,
};

describe("ProductCard", () => {
  it("hiển thị tên sản phẩm", () => {
    render(<ProductCard product={baseItem} />);
    expect(screen.getByText("Giày chạy bộ nam")).toBeInTheDocument();
  });

  it("hiển thị giá đã format theo formatVnd", () => {
    render(<ProductCard product={baseItem} />);
    expect(screen.getByText("890.000 ₫")).toBeInTheDocument();
  });

  it("link trỏ đúng tới /products/<slug>", () => {
    render(<ProductCard product={baseItem} />);
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/products/giay-chay-bo-nam",
    );
  });

  it("render <img> khi có imageUrl", () => {
    render(<ProductCard product={baseItem} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "/uploads/giay-chay-bo-nam.jpg");
  });

  it("khi imageUrl là null → hiển thị fallback thay vì <img>", () => {
    render(<ProductCard product={{ ...baseItem, imageUrl: null }} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByTestId("product-image-fallback")).toBeInTheDocument();
  });

  it("chỉ hiện nhãn hết hàng khi tổng tồn kho bằng 0", () => {
    const { rerender } = render(
      <ProductCard product={{ ...baseItem, totalStock: 0 }} />,
    );
    expect(screen.getByText("Hết hàng")).toBeInTheDocument();

    rerender(<ProductCard product={{ ...baseItem, totalStock: 12 }} />);
    expect(screen.queryByText("Hết hàng")).not.toBeInTheDocument();
  });

  it("không hiển thị nội dung giảm giá khi dữ liệu không có khuyến mãi", () => {
    render(<ProductCard product={baseItem} />);
    expect(screen.queryByText(/giảm|%/i)).not.toBeInTheDocument();
  });

  it("hiển thị ảnh đại diện màu và thông tin biến thể", () => {
    render(<ProductCard product={baseItem} />);

    expect(screen.getByLabelText("2 màu")).toBeInTheDocument();
    expect(screen.getByText("Size 40, 41")).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(document.querySelectorAll('img[alt=""]')).toHaveLength(2);
  });
});
