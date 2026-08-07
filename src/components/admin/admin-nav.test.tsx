import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminNav } from "./admin-nav";

vi.mock("next/navigation", () => ({ usePathname: vi.fn() }));

const { usePathname } = await import("next/navigation");

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

  it("marks a nested destination as the current page", () => {
    vi.mocked(usePathname).mockReturnValue("/admin/orders/pending");

    render(<AdminNav />);

    expect(screen.getByRole("link", { name: "Đơn hàng" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Sản phẩm" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
