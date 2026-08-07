import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminDashboardPage from "./page";

describe("AdminDashboardPage", () => {
  it("introduces the existing store operations destinations", () => {
    render(<AdminDashboardPage />);

    expect(
      screen.queryByText(/nội dung sẽ được bổ sung/i),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Vận hành cửa hàng" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Truy cập nhanh các công việc hiện có: quản lý sản phẩm, đơn hàng và đối soát giao dịch ngân hàng.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Quản lý sản phẩm/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Quản lý đơn hàng/i })).toBeInTheDocument();
  });

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
