import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProductCard } from "./product-card";
import type { CatalogListItem } from "@/server/queries/catalog";

const baseItem: CatalogListItem = {
  id: "prod-1",
  slug: "giay-chay-bo-nam",
  name: "Giày chạy bộ nam",
  basePrice: 890000,
  imageUrl: "/uploads/giay-chay-bo-nam.jpg",
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
});
