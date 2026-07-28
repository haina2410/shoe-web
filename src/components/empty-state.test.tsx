import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("hiển thị tiêu đề, hành động và ẩn chiếc lá trang trí", () => {
    render(
      <EmptyState
        title="Giỏ hàng trống"
        description="Chọn một đôi giày để bắt đầu."
        action={{ href: "/products", label: "Xem sản phẩm" }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Giỏ hàng trống" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem sản phẩm" })).toHaveAttribute(
      "href",
      "/products",
    );
    expect(screen.getByTestId("empty-state-leaf")).toHaveAttribute("aria-hidden", "true");
  });
});
