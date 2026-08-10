import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminPageHeader } from "./admin-page-header";

describe("AdminPageHeader", () => {
  it("composes a title, supporting content, status, and actions", () => {
    render(
      <AdminPageHeader
        title="Đơn hàng"
        description="Theo dõi các đơn hàng đang xử lý."
        status={<span>12 mới</span>}
        actions={<button type="button">Tạo đơn hàng</button>}
      />,
    );

    expect(screen.getByRole("heading", { name: "Đơn hàng" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Đơn hàng" })).toHaveClass("text-3xl");
    expect(screen.getByText("Theo dõi các đơn hàng đang xử lý.")).toBeInTheDocument();
    expect(screen.getByText("12 mới")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tạo đơn hàng" })).toBeInTheDocument();
  });
});
