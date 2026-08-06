import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUniqueMock, redirectMock } = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
  redirectMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { order: { findUnique: findUniqueMock } },
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import OrdersPage from "./page";

async function renderPage(orderCode?: string | string[]) {
  render(
    await OrdersPage({
      searchParams: Promise.resolve({ orderCode }),
    }),
  );
}

describe("OrdersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hiển thị biểu mẫu tra cứu ban đầu mà không có lỗi", async () => {
    await renderPage();

    expect(
      screen.getByRole("heading", { name: "Tra cứu đơn hàng" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Mã đơn hàng")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("dùng biểu mẫu GET gửi mã đơn hàng đến tuyến tra cứu", async () => {
    await renderPage();

    const form = screen.getByRole("form", { name: "Tra cứu đơn hàng" });

    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/orders");
  });

  it("chuẩn hóa mã hợp lệ rồi chuyển đến đơn hàng", async () => {
    findUniqueMock.mockResolvedValue({ orderCode: "LEAFABC123" });

    await renderPage(" leafabc123 ");

    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { orderCode: "LEAFABC123" },
      select: { orderCode: true },
    });
    expect(redirectMock).toHaveBeenCalledWith("/orders/LEAFABC123");
  });

  it("giữ lại mã không đúng định dạng và báo lỗi tra cứu", async () => {
    await renderPage("leaf-abc123");

    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Mã đơn hàng")).toHaveValue("leaf-abc123");
    expect(screen.getByRole("alert")).toHaveTextContent(
      /^Không tìm thấy đơn hàng$/,
    );
  });

  it("báo lỗi khi mã hợp lệ không có đơn hàng tương ứng", async () => {
    findUniqueMock.mockResolvedValue(null);

    await renderPage("LEAFABC123");

    expect(screen.getByLabelText("Mã đơn hàng")).toHaveValue("LEAFABC123");
    expect(screen.getByRole("alert")).toHaveTextContent(
      /^Không tìm thấy đơn hàng$/,
    );
  });
});
