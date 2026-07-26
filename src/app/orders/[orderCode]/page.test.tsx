import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrderStatus } from "@/generated/prisma/enums";

const { findUniqueMock, buildVietQrImageUrlMock, vietQrConfigFromEnvMock } =
  vi.hoisted(() => ({
    findUniqueMock: vi.fn(),
    buildVietQrImageUrlMock: vi.fn(),
    vietQrConfigFromEnvMock: vi.fn(),
  }));

vi.mock("@/lib/prisma", () => ({
  prisma: { order: { findUnique: findUniqueMock } },
}));

vi.mock("@/lib/vietqr", () => ({
  buildVietQrImageUrl: buildVietQrImageUrlMock,
  vietQrConfigFromEnv: vietQrConfigFromEnvMock,
}));

import OrderConfirmationPage from "./page";

const order = {
  id: "order-1",
  orderCode: "LEAFABC123",
  email: "guest@example.com",
  customerName: "Nguyễn Văn A",
  phone: "0901234567",
  province: "Hà Nội",
  ward: "Phường Ba Đình",
  addressLine: "123 Đường Láng",
  note: null,
  subtotal: 600_000,
  shippingFee: 30_000,
  total: 630_000,
  status: OrderStatus.PENDING_PAYMENT,
  paidAt: null,
  createdAt: new Date("2026-07-25T12:00:00.000Z"),
  updatedAt: new Date("2026-07-25T12:00:00.000Z"),
  items: [
    {
      id: "item-1",
      orderId: "order-1",
      variantId: "variant-1",
      productName: "Giày Chạy Bộ Êm Nhẹ",
      size: "40",
      color: "Đen",
      unitPrice: 600_000,
      quantity: 1,
    },
  ],
};

async function renderOrder(status: OrderStatus) {
  findUniqueMock.mockResolvedValue({ ...order, status });
  render(
    await OrderConfirmationPage({
      params: Promise.resolve({ orderCode: order.orderCode }),
    }),
  );
}

describe("OrderConfirmationPage payment state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vietQrConfigFromEnvMock.mockReturnValue({
      bankCode: "MB",
      accountNo: "0000000000",
      accountName: "LEAFSHOES",
      template: "compact2",
    });
    buildVietQrImageUrlMock.mockReturnValue(
      "https://img.vietqr.io/image/MB-0000000000-compact2.png",
    );
  });

  it("PENDING_PAYMENT hiển thị trạng thái chờ, QR, hướng dẫn chuyển khoản và tổng VND dạng số nguyên", async () => {
    await renderOrder(OrderStatus.PENDING_PAYMENT);

    expect(screen.getByTestId("order-status")).toHaveTextContent(
      "Chờ thanh toán",
    );
    expect(
      screen.getByRole("img", { name: "Mã QR chuyển khoản VietQR" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("order-transfer-content")).toHaveTextContent(
      order.orderCode,
    );
    expect(screen.getByTestId("order-total")).toHaveAttribute(
      "data-total",
      "630000",
    );
  });

  it.each([OrderStatus.PAID, OrderStatus.FULFILLED, OrderStatus.COMPLETED])(
    "%s dùng giao diện đã thanh toán và không còn QR hay hướng dẫn chuyển khoản",
    async (status) => {
      await renderOrder(status);

      expect(screen.getByTestId("order-status")).toHaveTextContent(
        "Đã thanh toán",
      );
      expect(
        screen.getByText("Thanh toán đã được xác nhận"),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("img", { name: "Mã QR chuyển khoản VietQR" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("order-transfer-content"),
      ).not.toBeInTheDocument();
    },
  );

  it.each([
    [OrderStatus.EXPIRED, "Đã hết hạn"],
    [OrderStatus.CANCELLED, "Đã hủy"],
  ])(
    "%s hiển thị trạng thái không hoạt động và không còn QR",
    async (status, label) => {
      await renderOrder(status);

      expect(screen.getByTestId("order-status")).toHaveTextContent(label);
      expect(
        screen.getByText("Đơn hàng không còn nhận thanh toán."),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("img", { name: "Mã QR chuyển khoản VietQR" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("order-transfer-content"),
      ).not.toBeInTheDocument();
    },
  );
});
