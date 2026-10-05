import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HeroBanner } from "./hero-banner";

describe("HeroBanner", () => {
  it("links the featured product image and action to its detail page", () => {
    render(
      <HeroBanner
        product={{
          slug: "sneaker-la-xanh-co-thap",
          name: "Sneaker Lá Xanh Cổ Thấp",
          imageUrl: "/products/sneaker-la-xanh-co-thap-1.png",
        }}
      />,
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /Bước êm cùng leafshoes/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem sản phẩm" })).toHaveAttribute(
      "href",
      "/products/sneaker-la-xanh-co-thap",
    );
    expect(
      screen.getByRole("img", { name: "Sneaker Lá Xanh Cổ Thấp" }).closest("a"),
    ).toHaveAttribute("href", "/products/sneaker-la-xanh-co-thap");
  });

  it("keeps a browse link when no product is available", () => {
    render(<HeroBanner product={null} />);

    expect(
      screen.getByRole("link", { name: "Khám phá sản phẩm" }),
    ).toHaveAttribute("href", "/products");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
