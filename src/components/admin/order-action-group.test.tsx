import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OrderStatus } from "@/generated/prisma/enums";

const {
  confirmPaymentManuallyActionMock,
  updateOrderStatusActionMock,
} = vi.hoisted(() => ({
  confirmPaymentManuallyActionMock: vi.fn(),
  updateOrderStatusActionMock: vi.fn(),
}));

vi.mock("@/server/actions/payments", () => ({
  confirmPaymentManuallyAction: confirmPaymentManuallyActionMock,
}));
vi.mock("@/server/actions/order-status", () => ({
  updateOrderStatusAction: updateOrderStatusActionMock,
}));
vi.mock("@/components/admin/admin-toast-provider", () => ({
  useAdminToast: () => ({ show: vi.fn() }),
}));

import { ConfirmPaymentButton } from "./confirm-payment-button";
import { OrderActionGroup } from "./order-action-group";
import { OrderStatusActions } from "./order-status-actions";

describe("OrderActionGroup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets only one rapid payment or cancellation mutation begin", async () => {
    let resolvePayment: ((value: { ok: true }) => void) | undefined;
    confirmPaymentManuallyActionMock.mockImplementation(
      () => new Promise((resolve) => {
        resolvePayment = resolve;
      }),
    );
    updateOrderStatusActionMock.mockResolvedValue({
      ok: true,
      status: OrderStatus.CANCELLED,
    });
    const user = userEvent.setup();
    render(
      <OrderActionGroup>
        <ConfirmPaymentButton orderCode="LEAFLOCK" orderId="order-1" />
        <OrderStatusActions
          orderCode="LEAFLOCK"
          orderId="order-1"
          targets={[OrderStatus.CANCELLED]}
        />
      </OrderActionGroup>,
    );

    await user.click(screen.getByRole("button", { name: "Xác nhận thanh toán" }));
    await user.click(screen.getByRole("button", { name: "Xác nhận" }));

    expect(confirmPaymentManuallyActionMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Huỷ đơn", hidden: true })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Huỷ đơn", hidden: true }));

    expect(updateOrderStatusActionMock).not.toHaveBeenCalled();

    resolvePayment?.({ ok: true });
  });

  it("releases the shared lock after a successful payment so cancellation can begin", async () => {
    confirmPaymentManuallyActionMock.mockResolvedValue({ ok: true });
    updateOrderStatusActionMock.mockResolvedValue({
      ok: true,
      status: OrderStatus.CANCELLED,
    });
    const user = userEvent.setup();
    render(
      <OrderActionGroup>
        <ConfirmPaymentButton orderCode="LEAFSUCCESS" orderId="order-2" />
        <OrderStatusActions
          orderCode="LEAFSUCCESS"
          orderId="order-2"
          targets={[OrderStatus.CANCELLED]}
        />
      </OrderActionGroup>,
    );

    await user.click(screen.getByRole("button", { name: "Xác nhận thanh toán" }));
    await user.click(screen.getByRole("button", { name: "Xác nhận" }));
    await waitFor(() => expect(confirmPaymentManuallyActionMock).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "Huỷ đơn" }));
    await user.click(screen.getByRole("button", { name: "Huỷ đơn hàng" }));

    await waitFor(() => expect(updateOrderStatusActionMock).toHaveBeenCalledTimes(1));
  });

  it("releases the shared lock after a returned payment error so cancellation can begin", async () => {
    confirmPaymentManuallyActionMock.mockResolvedValue({
      ok: false,
      error: "Đơn hàng không còn ở trạng thái chờ thanh toán.",
    });
    updateOrderStatusActionMock.mockResolvedValue({
      ok: true,
      status: OrderStatus.CANCELLED,
    });
    const user = userEvent.setup();
    render(
      <OrderActionGroup>
        <ConfirmPaymentButton orderCode="LEAFRETURNED" orderId="order-3" />
        <OrderStatusActions
          orderCode="LEAFRETURNED"
          orderId="order-3"
          targets={[OrderStatus.CANCELLED]}
        />
      </OrderActionGroup>,
    );

    await user.click(screen.getByRole("button", { name: "Xác nhận thanh toán" }));
    await user.click(screen.getByRole("button", { name: "Xác nhận" }));
    await screen.findByRole("alert");

    await user.click(screen.getByRole("button", { name: "Huỷ đơn" }));
    await user.click(screen.getByRole("button", { name: "Huỷ đơn hàng" }));

    await waitFor(() => expect(updateOrderStatusActionMock).toHaveBeenCalledTimes(1));
  });

  it("releases the shared lock after a rejected payment so cancellation can begin", async () => {
    confirmPaymentManuallyActionMock.mockRejectedValue(new Error("payment connection reset"));
    updateOrderStatusActionMock.mockResolvedValue({
      ok: true,
      status: OrderStatus.CANCELLED,
    });
    const user = userEvent.setup();
    render(
      <OrderActionGroup>
        <ConfirmPaymentButton orderCode="LEAFREJECTED" orderId="order-4" />
        <OrderStatusActions
          orderCode="LEAFREJECTED"
          orderId="order-4"
          targets={[OrderStatus.CANCELLED]}
        />
      </OrderActionGroup>,
    );

    await user.click(screen.getByRole("button", { name: "Xác nhận thanh toán" }));
    await user.click(screen.getByRole("button", { name: "Xác nhận" }));
    await screen.findByRole("alert");

    await user.click(screen.getByRole("button", { name: "Huỷ đơn" }));
    await user.click(screen.getByRole("button", { name: "Huỷ đơn hàng" }));

    await waitFor(() => expect(updateOrderStatusActionMock).toHaveBeenCalledTimes(1));
  });
});
