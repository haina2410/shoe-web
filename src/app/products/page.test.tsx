import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { getFacetsMock, listCategoriesMock, listProductsMock } = vi.hoisted(() => ({
  getFacetsMock: vi.fn(),
  listCategoriesMock: vi.fn(),
  listProductsMock: vi.fn(),
}));

vi.mock("@/server/queries/catalog", () => ({
  getFacets: getFacetsMock,
  listCategories: listCategoriesMock,
  listProducts: listProductsMock,
}));

vi.mock("@/components/filters", () => ({
  Filters: () => <aside aria-label="Bộ lọc sản phẩm" />,
}));

const { default: ProductsPage } = await import("./page");

beforeEach(() => {
  listProductsMock.mockResolvedValue([]);
  getFacetsMock.mockResolvedValue({ sizes: [], colors: [] });
  listCategoriesMock.mockResolvedValue([]);
});

describe("ProductsPage", () => {
  it("hiển thị EmptyState có hành động xem lại catalog khi không có sản phẩm", async () => {
    render(await ProductsPage({ searchParams: Promise.resolve({ q: "không có" }) }));

    expect(
      screen.getByRole("heading", { name: "Không tìm thấy sản phẩm" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem tất cả sản phẩm" })).toHaveAttribute(
      "href",
      "/products",
    );
  });
});
