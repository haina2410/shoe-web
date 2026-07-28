import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SiteHeader } from "./site-header";

describe("SiteHeader", () => {
  it("hiển thị tên thương hiệu leafshoes", () => {
    render(<SiteHeader />);
    expect(screen.getByText(/leafshoes/i)).toBeInTheDocument();
  });

  it("có liên kết tới giỏ hàng", () => {
    render(<SiteHeader />);
    expect(screen.getByRole("link", { name: /giỏ hàng/i })).toBeInTheDocument();
  });

  it("cung cấp điều hướng và tìm kiếm sản phẩm bằng form GET", () => {
    render(<SiteHeader />);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Điều hướng chính" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Tìm sản phẩm" })).toHaveAttribute(
      "name",
      "q",
    );
    expect(screen.getByRole("search")).toHaveAttribute("action", "/products");
  });
});
