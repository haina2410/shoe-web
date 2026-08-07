import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { confirmPaymentManuallyActionMock } = vi.hoisted(() => ({
  confirmPaymentManuallyActionMock: vi.fn(),
}));
const { showToastMock } = vi.hoisted(() => ({ showToastMock: vi.fn() }));

vi.mock("@/server/actions/payments", () => ({
  confirmPaymentManuallyAction: confirmPaymentManuallyActionMock,
}));
vi.mock("@/components/admin/admin-toast-provider", () => ({
  useAdminToast: () => ({ show: showToastMock }),
}));

import { ConfirmPaymentButton } from "./confirm-payment-button";

describe("ConfirmPaymentButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmPaymentManuallyActionMock.mockResolvedValue({ ok: true });
  });

  it("requires amber confirmation and does not submit when the dialog is dismissed", async () => {
    const user = userEvent.setup();
    render(<ConfirmPaymentButton orderCode="LEAFCONFIRM" orderId="order-1" />);

    await user.click(screen.getByRole("button", { name: "Xác nhận thanh toán" }));

    expect(screen.getByRole("alertdialog", { name: "Xác nhận thanh toán" })).toBeInTheDocument();
    expect(screen.getByText("Đơn hàng LEAFCONFIRM")).toBeInTheDocument();
    expect(confirmPaymentManuallyActionMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Hủy" }));
    expect(confirmPaymentManuallyActionMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Xác nhận thanh toán" }));
    await user.keyboard("{Escape}");
    expect(confirmPaymentManuallyActionMock).not.toHaveBeenCalled();
  });

  it("submits after confirmation, locks the dialog while pending, and announces success", async () => {
    let resolveAction:
      | ((value: { ok: true } | { ok: false; error: string }) => void)
      | undefined;
    confirmPaymentManuallyActionMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<ConfirmPaymentButton orderCode="LEAFCONFIRM" orderId="order-1" />);

    const button = screen.getByRole("button", { name: "Xác nhận thanh toán" });
    await user.click(button);
    await user.dblClick(screen.getByRole("button", { name: "Xác nhận" }));

    expect(confirmPaymentManuallyActionMock).toHaveBeenCalledTimes(1);
    expect(confirmPaymentManuallyActionMock).toHaveBeenCalledWith("order-1");
    expect(screen.getByRole("button", { name: "Hủy" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Đang xác nhận…" }),
    ).toBeDisabled();

    resolveAction?.({ ok: true });
    expect(
      await screen.findByRole("button", { name: "Xác nhận thanh toán" }),
    ).toBeEnabled();
    expect(showToastMock).toHaveBeenCalledWith({
      title: "Đã xác nhận thanh toán",
      description: "Đơn hàng LEAFCONFIRM sẽ được làm mới.",
    });
  });

  it("hiển thị lỗi an toàn action trả về và cho phép thử lại", async () => {
    confirmPaymentManuallyActionMock.mockResolvedValue({
      ok: false,
      error: "Đơn hàng không còn ở trạng thái chờ thanh toán.",
    });
    const user = userEvent.setup();
    render(<ConfirmPaymentButton orderCode="LEAFCONFIRM" orderId="order-1" />);

    await user.click(
      screen.getByRole("button", { name: "Xác nhận thanh toán" }),
    );
    await user.click(screen.getByRole("button", { name: "Xác nhận" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Đơn hàng không còn ở trạng thái chờ thanh toán.",
    );
    expect(
      screen.getByRole("button", { name: "Xác nhận thanh toán" }),
    ).toBeEnabled();
  });

  it("không rò lỗi mạng thô nếu lời gọi action bị reject", async () => {
    confirmPaymentManuallyActionMock.mockRejectedValue(
      new Error("Failed to find Server Action 012345"),
    );
    const user = userEvent.setup();
    render(<ConfirmPaymentButton orderCode="LEAFCONFIRM" orderId="order-1" />);

    await user.click(
      screen.getByRole("button", { name: "Xác nhận thanh toán" }),
    );
    await user.click(screen.getByRole("button", { name: "Xác nhận" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Không thể xác nhận thanh toán lúc này. Vui lòng thử lại.",
    );
    expect(
      screen.queryByText(/Failed to find Server Action/),
    ).not.toBeInTheDocument();
  });
});
