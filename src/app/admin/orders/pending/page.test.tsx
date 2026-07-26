import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { findManyMock, requireAdminMock } = vi.hoisted(() => ({
  findManyMock: vi.fn(),
  requireAdminMock: vi.fn(),
}));

vi.mock("@/lib/auth-guard", () => ({ requireAdmin: requireAdminMock }));
vi.mock("@/lib/prisma", () => ({
  prisma: { order: { findMany: findManyMock } },
}));
vi.mock("@/server/actions/payments", () => ({
  confirmPaymentManuallyAction: vi.fn(),
}));

import AdminPendingOrdersPage from "./page";

const pendingOrder = {
  id: "order-1",
  orderCode: "LEAFABC123",
  createdAt: new Date("2026-07-25T08:00:00.000Z"),
  total: 425_000,
};

function sessionWithRole(role: string) {
  return {
    user: { id: "user-1", email: "admin@example.com", role },
    session: { id: "session-1" },
  };
}

describe("AdminPendingOrdersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findManyMock.mockResolvedValue([pendingOrder]);
  });

  it("staff xem được danh sách chờ thanh toán nhưng không có nút xác nhận", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("staff"));

    render(await AdminPendingOrdersPage());

    expect(screen.getByText("LEAFABC123")).toBeInTheDocument();
    expect(screen.getByText("425.000 ₫")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Xác nhận thanh toán" }),
    ).not.toBeInTheDocument();
  });

  it("owner thấy nút xác nhận của từng đơn pending", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("owner"));

    render(await AdminPendingOrdersPage());

    expect(
      screen.getByRole("button", { name: "Xác nhận thanh toán" }),
    ).toBeInTheDocument();
  });
});
