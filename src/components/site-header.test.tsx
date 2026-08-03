import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("mở được menu Tổng quan doanh nghiệp với ba trang doanh nghiệp", async () => {
    const user = userEvent.setup();
    render(<SiteHeader />);

    await user.click(screen.getByRole("button", { name: "Tổng quan doanh nghiệp" }));

    for (const [name, href] of [
      ["Giới thiệu công ty", "/gioi-thieu"],
      ["Nhà máy & hoạt động kinh doanh", "/nha-may"],
      ["Chi nhánh", "/chi-nhanh"],
    ] as const) {
      expect(screen.getByRole("link", { name }), name).toHaveAttribute("href", href);
    }
  });

  it("giữ các điểm chạm chính ở kích thước tối thiểu trên mobile", () => {
    render(<SiteHeader />);

    for (const target of [
      screen.getByRole("link", { name: "Trang chủ leafshoes" }),
      screen.getByRole("link", { name: "Sản phẩm" }),
      screen.getByRole("link", { name: "Giỏ hàng" }),
      screen.getByRole("searchbox", { name: "Tìm sản phẩm" }),
      screen.getByRole("button", { name: "Gửi tìm kiếm" }),
    ]) {
      expect(target.className).toMatch(/min-h-11/);
    }
  });
});
