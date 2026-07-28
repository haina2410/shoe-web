import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminNav } from "./admin-nav";

describe("AdminNav", () => {
  it("provides links to every current admin destination", () => {
    render(<AdminNav />);

    expect(
      screen.getByRole("navigation", { name: "Điều hướng quản trị" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sản phẩm" })).toHaveAttribute(
      "href",
      "/admin/products",
    );
    expect(screen.getByRole("link", { name: "Đơn hàng" })).toHaveAttribute(
      "href",
      "/admin/orders",
    );
    expect(screen.getByRole("link", { name: "Đối soát" })).toHaveAttribute(
      "href",
      "/admin/bank-transactions/review",
    );
  });
});
