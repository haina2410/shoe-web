import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
        <OrderStatusActions orderId="order-1" targets={[OrderStatus.CANCELLED]} />
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
});
