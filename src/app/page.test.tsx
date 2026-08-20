import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { listProductsMock } = vi.hoisted(() => ({
  listProductsMock: vi.fn(),
}));

vi.mock("@/server/queries/catalog", () => ({
  listProducts: listProductsMock,
}));

vi.mock("@/components/product-card", () => ({
  ProductCard: ({ product }: { product: { name: string } }) => <p>{product.name}</p>,
}));

const { default: HomePage } = await import("./page");

beforeEach(() => {
  listProductsMock.mockResolvedValue([]);
});

describe("HomePage", () => {
  it("sắp xếp hành trình mua hàng từ giới thiệu đến danh mục, sản phẩm và cam kết", async () => {
    render(await HomePage());

    const labels = screen
      .getAllByTestId("home-section")
      .map((node) => node.dataset.section);

    expect(labels).toEqual(["hero", "categories", "featured", "company", "trust"]);
    expect(
      screen.getByRole("heading", { name: "Sản phẩm nổi bật" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem danh mục" })).toHaveAttribute(
      "href",
      "/products",
    );
  });
});
