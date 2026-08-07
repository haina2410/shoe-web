import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OrderStatus } from "@/generated/prisma/enums";

const { updateOrderStatusActionMock } = vi.hoisted(() => ({
  updateOrderStatusActionMock: vi.fn(),
}));
const { showToastMock } = vi.hoisted(() => ({ showToastMock: vi.fn() }));

vi.mock("@/server/actions/order-status", () => ({
  updateOrderStatusAction: updateOrderStatusActionMock,
}));
vi.mock("@/components/admin/admin-toast-provider", () => ({
  useAdminToast: () => ({ show: showToastMock }),
}));

import { OrderStatusActions } from "./order-status-actions";

describe("OrderStatusActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateOrderStatusActionMock.mockResolvedValue({
      ok: true,
      status: OrderStatus.CANCELLED,
    });
  });

  it("requires a destructive confirmation before cancelling but keeps green transitions direct", async () => {
    const user = userEvent.setup();
    render(
      <OrderStatusActions
        orderId="order-1"
        targets={[OrderStatus.CANCELLED, OrderStatus.COMPLETED]}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Huỷ đơn" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Đánh dấu hoàn tất" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Chuyển sang đang giao" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Huỷ đơn" }));

    expect(screen.getByRole("alertdialog", { name: "Huỷ đơn hàng" })).toBeInTheDocument();
    expect(updateOrderStatusActionMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Hủy" }));
    expect(updateOrderStatusActionMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Đánh dấu hoàn tất" }));

    expect(updateOrderStatusActionMock).toHaveBeenCalledTimes(1);
    expect(updateOrderStatusActionMock).toHaveBeenCalledWith(
      "order-1",
      OrderStatus.COMPLETED,
    );
  });

  it("disables every action and blocks duplicate submissions while pending", async () => {
    let resolveAction:
      | ((value: { ok: true; status: OrderStatus }) => void)
      | undefined;
    updateOrderStatusActionMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve;
        }),
    );
    const user = userEvent.setup();
    render(
      <OrderStatusActions
        orderId="order-2"
        targets={[OrderStatus.CANCELLED, OrderStatus.FULFILLED]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Huỷ đơn" }));
    await user.dblClick(screen.getByRole("button", { name: "Huỷ đơn hàng" }));

    expect(updateOrderStatusActionMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Đang huỷ đơn…" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Chuyển sang đang giao", hidden: true }),
    ).toBeDisabled();

    resolveAction?.({ ok: true, status: OrderStatus.CANCELLED });
    expect(
      await screen.findByRole("button", { name: "Huỷ đơn" }),
    ).toBeEnabled();
  });

  it("shows a returned safe error in an alert", async () => {
    updateOrderStatusActionMock.mockResolvedValue({
      ok: false,
      error: "Không thể chuyển đơn hàng sang trạng thái này.",
    });
    const user = userEvent.setup();
    render(
      <OrderStatusActions
        orderId="order-3"
        targets={[OrderStatus.FULFILLED]}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Chuyển sang đang giao" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Không thể chuyển đơn hàng sang trạng thái này.",
    );
  });

  it("hides raw rejected errors behind a generic alert", async () => {
    updateOrderStatusActionMock.mockRejectedValue(
      new Error("Failed to find Server Action secret-status-id"),
    );
    const user = userEvent.setup();
    render(
      <OrderStatusActions
        orderId="order-4"
        targets={[OrderStatus.COMPLETED]}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Đánh dấu hoàn tất" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Không thể cập nhật trạng thái đơn hàng lúc này. Vui lòng thử lại.",
    );
    expect(
      screen.queryByText(/Failed to find Server Action/),
    ).not.toBeInTheDocument();
  });

  it("announces a successful direct transition without updating the order locally", async () => {
    const user = userEvent.setup();
    render(
      <OrderStatusActions
        orderId="order-5"
        targets={[OrderStatus.FULFILLED]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Chuyển sang đang giao" }));

    expect(showToastMock).toHaveBeenCalledWith({
      title: "Đã cập nhật trạng thái đơn hàng",
      description: "Thông tin đơn hàng sẽ được làm mới.",
    });
    expect(screen.getByRole("button", { name: "Chuyển sang đang giao" })).toBeInTheDocument();
  });
});
