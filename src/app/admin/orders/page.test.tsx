import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { OrderStatus, PaymentDirection } from "@/generated/prisma/enums";

const { listAdminOrdersMock, requireAdminMock } = vi.hoisted(() => ({
  listAdminOrdersMock: vi.fn(),
  requireAdminMock: vi.fn(),
}));

vi.mock("@/lib/auth-guard", () => ({ requireAdmin: requireAdminMock }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/server/queries/admin-orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/queries/admin-orders")>()),
  listAdminOrders: listAdminOrdersMock,
}));

import AdminOrdersPage from "./page";

const listedOrders = [
  {
    id: "partial-order",
    orderCode: "LEAFPARTIAL",
    customerName: "Nguyễn An",
    createdAt: new Date("2026-07-25T08:00:00.000Z"),
    total: 100_000,
    status: OrderStatus.PAID,
    payments: [
      { direction: PaymentDirection.IN, amount: 100_000 },
      { direction: PaymentDirection.OUT, amount: 25_000 },
    ],
  },
  {
    id: "full-order",
    orderCode: "LEAFFULL",
    customerName: "Trần Bình",
    createdAt: new Date("2026-07-24T08:00:00.000Z"),
    total: 200_000,
    status: OrderStatus.FULFILLED,
    payments: [
      { direction: PaymentDirection.IN, amount: 200_000 },
      { direction: PaymentDirection.OUT, amount: 200_000 },
    ],
  },
];

describe("AdminOrdersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue({ user: { role: "staff" } });
    listAdminOrdersMock.mockResolvedValue(listedOrders);
  });

  it("awaits search params, reflects selected filters, and lists order payment summaries", async () => {
    render(
      await AdminOrdersPage({
        searchParams: Promise.resolve({
          status: OrderStatus.PENDING_PAYMENT,
          refund: "with",
          query: "leafpartial",
        }),
      }),
    );

    expect(screen.getByRole("combobox", { name: "Trạng thái" })).toHaveValue(
      OrderStatus.PENDING_PAYMENT,
    );
    expect(screen.getByRole("combobox", { name: "Hoàn tiền" })).toHaveValue(
      "with",
    );
    expect(screen.getByRole("searchbox", { name: "Mã đơn" })).toHaveValue(
      "LEAFPARTIAL",
    );
    expect(screen.getByRole("searchbox", { name: "Mã đơn" })).toHaveAttribute(
      "placeholder",
      "Ví dụ: LEAFABC123",
    );
    expect(screen.getByRole("cell", { name: "Đã thanh toán" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Đang giao" })).toBeInTheDocument();
    expect(screen.getByText("Hoàn tiền một phần")).toBeInTheDocument();
    expect(screen.getByText("Đã hoàn tiền toàn bộ")).toBeInTheDocument();
    expect(screen.getByText("100.000 ₫")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "LEAFPARTIAL" })).toHaveAttribute(
      "href",
      "/admin/orders/partial-order",
    );
    expect(screen.getByRole("link", { name: "LEAFFULL" })).toHaveAttribute(
      "href",
      "/admin/orders/full-order",
    );
    expect(screen.getByRole("form")).toHaveAttribute("method", "get");
  });

  it("shows an empty state when no orders match", async () => {
    listAdminOrdersMock.mockResolvedValue([]);

    render(
      await AdminOrdersPage({
        searchParams: Promise.resolve({}),
      }),
    );

    expect(
      screen.getByText("Không tìm thấy đơn hàng phù hợp."),
    ).toBeInTheDocument();
  });

  it("authenticates before querying orders", async () => {
    await AdminOrdersPage({ searchParams: Promise.resolve({}) });

    expect(requireAdminMock).toHaveBeenCalledTimes(1);
    expect(listAdminOrdersMock).toHaveBeenCalledTimes(1);
    expect(requireAdminMock.mock.invocationCallOrder[0]).toBeLessThan(
      listAdminOrdersMock.mock.invocationCallOrder[0],
    );
  });
});
