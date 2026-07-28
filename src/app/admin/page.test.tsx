import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminDashboardPage from "./page";

describe("AdminDashboardPage", () => {
  it("links to order management and bank transaction review", () => {
    render(<AdminDashboardPage />);

    expect(screen.getByRole("link", { name: /quản lý đơn hàng/i })).toHaveAttribute(
      "href",
      "/admin/orders",
    );
    expect(
      screen.getByRole("link", { name: /duyệt giao dịch ngân hàng/i }),
    ).toHaveAttribute("href", "/admin/bank-transactions/review");
  });
});
