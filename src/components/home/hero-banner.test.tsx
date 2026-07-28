import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HeroBanner } from "./hero-banner";

describe("HeroBanner", () => {
  it("giới thiệu leafshoes bằng CTA tới danh mục sản phẩm và ảnh có mô tả", () => {
    render(<HeroBanner />);

    expect(
      screen.getByRole("heading", { level: 1, name: /Bước êm cùng leafshoes/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Khám phá sản phẩm" })).toHaveAttribute(
      "href",
      "/products",
    );
    expect(screen.getByRole("img", { name: /giày leafshoes/i })).toBeInTheDocument();
  });
});
