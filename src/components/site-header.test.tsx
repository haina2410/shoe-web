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
});
