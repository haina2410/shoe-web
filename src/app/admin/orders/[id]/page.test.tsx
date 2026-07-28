import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import {
  BankTransactionStatus,
  OrderStatus,
  PaymentDirection,
} from "@/generated/prisma/enums";

const {
  confirmPaymentManuallyActionMock,
  getAdminOrderDetailMock,
  notFoundMock,
  recordRefundActionMock,
  requireAdminMock,
  updateOrderStatusActionMock,
} = vi.hoisted(() => ({
  confirmPaymentManuallyActionMock: vi.fn(),
  getAdminOrderDetailMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  recordRefundActionMock: vi.fn(),
  requireAdminMock: vi.fn(),
  updateOrderStatusActionMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
vi.mock("@/lib/auth-guard", () => ({ requireAdmin: requireAdminMock }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/server/queries/admin-orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/queries/admin-orders")>()),
  getAdminOrderDetail: getAdminOrderDetailMock,
}));
vi.mock("@/server/actions/payments", () => ({
  confirmPaymentManuallyAction: confirmPaymentManuallyActionMock,
}));
vi.mock("@/server/actions/order-status", () => ({
  updateOrderStatusAction: updateOrderStatusActionMock,
}));
vi.mock("@/server/actions/refunds", () => ({
  recordRefundAction: recordRefundActionMock,
}));

import AdminOrderDetailPage from "./page";

const VALID_ORDER_ID = "cm12345678901234567890123";

const baseOrder = {
  id: VALID_ORDER_ID,
  orderCode: "LEAF-DETAIL-1",
  email: "khach@example.com",
  customerName: "Nguyễn Khách",
  phone: "0901234567",
  province: "Đà Nẵng",
  ward: "Hải Châu",
  addressLine: "12 Đường Lá",
  note: "Giao giờ hành chính",
  subtotal: 250_000,
  shippingFee: 30_000,
  total: 280_000,
  status: OrderStatus.PAID,
  paidAt: new Date("2026-07-27T08:00:00.000Z"),
  lastRefundAt: new Date("2026-07-28T08:00:00.000Z"),
  createdAt: new Date("2026-07-27T07:50:00.000Z"),
  updatedAt: new Date("2026-07-28T08:00:00.000Z"),
  items: [
    {
      id: "item-1",
      productName: "Tên giày lúc đặt",
      size: "42",
      color: "Xanh",
      unitPrice: 250_000,
      quantity: 1,
    },
  ],
  payments: [
    {
      id: "payment-out",
      provider: "manual",
      transactionId: "manual-refund-1",
      amount: 80_000,
      matchedAt: new Date("2026-07-28T08:00:00.000Z"),
      direction: PaymentDirection.OUT,
      externalReference: "BANK-REF-80",
      note: "Hoàn một phần",
      recordedBy: {
        name: "Nhân viên Lá",
        email: "staff@example.com",
      },
    },
    {
      id: "payment-in",
      provider: "sepay",
      transactionId: "sepay-in-1",
      amount: 280_000,
      matchedAt: new Date("2026-07-27T08:00:00.000Z"),
      direction: PaymentDirection.IN,
      externalReference: null,
      note: null,
      recordedBy: null,
    },
  ],
  bankTransactions: [
    {
      id: "bank-1",
      provider: "sepay",
      providerTransactionId: "provider-bank-1",
      gateway: "VCB",
      accountNumber: "0123456789",
      transferType: "in",
      amount: 280_000,
      paymentCode: "LEAFDETAIL1",
      content: "Thanh toan don LEAF DETAIL 1",
      referenceCode: "REF-BANK-1",
      occurredAt: new Date("2026-07-27T08:00:00.000Z"),
      status: BankTransactionStatus.MATCHED,
      reviewReason: null,
      processedAt: new Date("2026-07-27T08:01:00.000Z"),
      rawPayload: { secret: "RAW BANK JSON MUST STAY HIDDEN" },
    },
  ],
  ledgerSummary: {
    totalIn: 280_000,
    totalOut: 80_000,
    netReceived: 200_000,
    refundState: "PARTIAL" as const,
  },
  nextOrderStatuses: [OrderStatus.FULFILLED],
};

describe("AdminOrderDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue({ user: { role: "staff" } });
    getAdminOrderDetailMock.mockResolvedValue(baseOrder);
  });

  it("authenticates before querying and renders safe order, ledger, actor, and bank details", async () => {
    render(
      await AdminOrderDetailPage({
        params: Promise.resolve({ id: VALID_ORDER_ID }),
      }),
    );

    expect(requireAdminMock).toHaveBeenCalledTimes(1);
    expect(getAdminOrderDetailMock).toHaveBeenCalledWith({}, VALID_ORDER_ID);
    expect(requireAdminMock.mock.invocationCallOrder[0]).toBeLessThan(
      getAdminOrderDetailMock.mock.invocationCallOrder[0],
    );
    expect(
      screen.getByRole("heading", { name: "Đơn hàng LEAF-DETAIL-1" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Đã thanh toán · Tạo lúc/)).toBeInTheDocument();
    expect(screen.getByText("Nguyễn Khách")).toBeInTheDocument();
    expect(screen.getByText("khach@example.com")).toBeInTheDocument();
    expect(screen.getByText("0901234567")).toBeInTheDocument();
    expect(screen.getByText(/12 Đường Lá/)).toBeInTheDocument();
    expect(screen.getByText(/Hải Châu/)).toBeInTheDocument();
    expect(screen.getByText(/Đà Nẵng/)).toBeInTheDocument();
    expect(screen.getByText("Tên giày lúc đặt")).toBeInTheDocument();
    expect(screen.getByText("42 / Xanh")).toBeInTheDocument();
    expect(screen.getAllByText("250.000 ₫").length).toBeGreaterThan(0);
    expect(screen.getByText("30.000 ₫")).toBeInTheDocument();
    expect(screen.getAllByText("280.000 ₫").length).toBeGreaterThan(0);
    expect(screen.getByText("Hoàn tiền một phần")).toBeInTheDocument();
    expect(screen.getByText("Nhân viên Lá")).toBeInTheDocument();
    expect(screen.getByText("staff@example.com")).toBeInTheDocument();
    expect(screen.getByText("BANK-REF-80")).toBeInTheDocument();
    expect(screen.getByText("Hoàn một phần")).toBeInTheDocument();
    expect(screen.getByText("•••• 6789")).toBeInTheDocument();
    expect(screen.queryByText("0123456789")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/RAW BANK JSON MUST STAY HIDDEN/),
    ).not.toBeInTheDocument();
  });

  it("calls notFound for a missing order", async () => {
    getAdminOrderDetailMock.mockResolvedValue(null);

    await expect(
      AdminOrderDetailPage({
        params: Promise.resolve({ id: VALID_ORDER_ID }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it("validates the awaited id and calls notFound without querying when invalid", async () => {
    await expect(
      AdminOrderDetailPage({
        params: Promise.resolve({ id: "not-an-order-id" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFoundMock).toHaveBeenCalledTimes(1);
    expect(getAdminOrderDetailMock).not.toHaveBeenCalled();
  });

  it("renders payment confirmation and cancellation only for a pending order", async () => {
    getAdminOrderDetailMock.mockResolvedValue({
      ...baseOrder,
      status: OrderStatus.PENDING_PAYMENT,
      payments: [],
      ledgerSummary: {
        totalIn: 0,
        totalOut: 0,
        netReceived: 0,
        refundState: "NONE",
      },
      nextOrderStatuses: [OrderStatus.CANCELLED],
    });

    render(
      await AdminOrderDetailPage({
        params: Promise.resolve({ id: VALID_ORDER_ID }),
      }),
    );

    expect(
      screen.getByRole("button", { name: "Xác nhận thanh toán" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Huỷ đơn" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Chuyển sang đang giao" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("form", { name: "Hoàn tiền" }),
    ).not.toBeInTheDocument();
  });

  it("renders fulfillment and refund controls for a paid order", async () => {
    render(
      await AdminOrderDetailPage({
        params: Promise.resolve({ id: VALID_ORDER_ID }),
      }),
    );

    expect(
      screen.getByRole("button", { name: "Chuyển sang đang giao" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("form", { name: "Hoàn tiền" }),
    ).toBeInTheDocument();
  });

  it("does not render fulfillment for a fully refunded paid order", async () => {
    getAdminOrderDetailMock.mockResolvedValue({
      ...baseOrder,
      ledgerSummary: {
        totalIn: 280_000,
        totalOut: 280_000,
        netReceived: 0,
        refundState: "FULL",
      },
      nextOrderStatuses: [],
    });

    render(
      await AdminOrderDetailPage({
        params: Promise.resolve({ id: VALID_ORDER_ID }),
      }),
    );

    expect(
      screen.queryByRole("button", { name: "Chuyển sang đang giao" }),
    ).not.toBeInTheDocument();
  });

  it("fully masks an account number with four or fewer characters", async () => {
    getAdminOrderDetailMock.mockResolvedValue({
      ...baseOrder,
      bankTransactions: [
        {
          ...baseOrder.bankTransactions[0],
          accountNumber: "1234",
        },
      ],
    });

    render(
      await AdminOrderDetailPage({
        params: Promise.resolve({ id: VALID_ORDER_ID }),
      }),
    );

    const bankSection = screen
      .getByRole("heading", { name: "Giao dịch ngân hàng liên kết" })
      .closest("section");
    expect(bankSection).not.toBeNull();

    expect(within(bankSection!).getByText("••••")).toBeInTheDocument();
    expect(within(bankSection!).queryByText(/1234/)).not.toBeInTheDocument();
  });
});
