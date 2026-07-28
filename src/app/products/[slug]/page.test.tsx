import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { getProductBySlugMock } = vi.hoisted(() => ({
  getProductBySlugMock: vi.fn(),
}));

vi.mock("@/server/queries/catalog", () => ({
  getProductBySlug: getProductBySlugMock,
}));

vi.mock("next/image", () => ({
  default: ({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} {...props} />
  ),
}));

vi.mock("@/components/variant-selector", () => ({
  VariantSelector: () => <div data-testid="variant-selector" />,
}));

const { default: ProductDetailPage } = await import("./page");

const product = {
  id: "product-1",
  slug: "giay-chay-bo-nam",
  name: "Giày chạy bộ nam",
  basePrice: 890000,
  description: "Êm nhẹ cho mỗi ngày.",
  images: [{ id: "image-1", productId: "product-1", url: "/products/run.png", position: 0 }],
  variants: [],
  category: { id: "category-1", name: "Chạy bộ", slug: "chay-bo" },
};

beforeEach(() => {
  getProductBySlugMock.mockResolvedValue(product);
});

describe("ProductDetailPage", () => {
  it("để layout gốc sở hữu landmark main duy nhất", async () => {
    render(
      await ProductDetailPage({ params: Promise.resolve({ slug: product.slug }) }),
    );

    expect(screen.queryByRole("main")).not.toBeInTheDocument();
  });

  it("có breadcrumb, ảnh gallery và các cam kết thanh toán/hỗ trợ", async () => {
    render(
      await ProductDetailPage({ params: Promise.resolve({ slug: product.slug }) }),
    );

    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sản phẩm" })).toHaveAttribute(
      "href",
      "/products",
    );
    expect(screen.getByText("Thanh toán VietQR")).toBeInTheDocument();
    expect(screen.getByText("Hỗ trợ qua Zalo")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: product.name })).toBeInTheDocument();
  });
});
