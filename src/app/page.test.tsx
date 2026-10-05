import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { listProductsMock, storefrontSettingMock } = vi.hoisted(() => ({
  listProductsMock: vi.fn(),
  storefrontSettingMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { storefrontSetting: { findUnique: storefrontSettingMock } },
}));

vi.mock("@/server/queries/catalog", () => ({
  listProducts: listProductsMock,
}));

vi.mock("@/components/product-card", () => ({
  ProductCard: ({ product }: { product: { name: string } }) => (
    <p>{product.name}</p>
  ),
}));

const { default: HomePage } = await import("./page");

beforeEach(() => {
  listProductsMock.mockResolvedValue([]);
  storefrontSettingMock.mockResolvedValue({ heroProductId: null });
});

describe("HomePage", () => {
  it("uses the selected product instead of the automatic image choice", async () => {
    listProductsMock.mockResolvedValue([
      {
        id: "automatic",
        slug: "automatic-choice",
        name: "Automatic choice",
        imageUrl: "/products/automatic.png",
        imagePreviews: [],
        colors: [],
        sizes: [],
        basePrice: 100000,
        totalStock: 1,
      },
      {
        id: "selected",
        slug: "selected-shoe",
        name: "Selected shoe",
        imageUrl: "/products/selected.png",
        imagePreviews: [],
        colors: [],
        sizes: [],
        basePrice: 100000,
        totalStock: 1,
      },
    ]);
    storefrontSettingMock.mockResolvedValue({ heroProductId: "selected" });

    render(await HomePage());

    expect(screen.getByRole("link", { name: "Xem sản phẩm" })).toHaveAttribute(
      "href",
      "/products/selected-shoe",
    );
  });

  it("features an active product with an image in the hero", async () => {
    listProductsMock.mockResolvedValue([
      {
        id: "newer",
        slug: "newer-no-image",
        name: "Newer product",
        imageUrl: null,
        imagePreviews: [],
        colors: [],
        sizes: [],
        basePrice: 100000,
        totalStock: 1,
      },
      {
        id: "featured",
        slug: "sneaker-la-xanh-co-thap",
        name: "Sneaker Lá Xanh Cổ Thấp",
        imageUrl: "/products/sneaker-la-xanh-co-thap-1.png",
        imagePreviews: [],
        colors: ["Xanh"],
        sizes: ["40"],
        basePrice: 200000,
        totalStock: 2,
      },
    ]);

    render(await HomePage());

    const hero = screen.getAllByTestId("home-section")[0];
    expect(hero.querySelector("img")?.closest("a")).toHaveAttribute(
      "href",
      "/products/sneaker-la-xanh-co-thap",
    );
  });

  it("sắp xếp hành trình mua hàng từ giới thiệu đến danh mục, sản phẩm và cam kết", async () => {
    render(await HomePage());

    const labels = screen
      .getAllByTestId("home-section")
      .map((node) => node.dataset.section);

    expect(labels).toEqual([
      "hero",
      "categories",
      "featured",
      "company",
      "trust",
    ]);
    expect(
      screen.getByRole("heading", { name: "Sản phẩm nổi bật" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem danh mục" })).toHaveAttribute(
      "href",
      "/products",
    );
  });
});
