import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { confirmPaymentManuallyActionMock } = vi.hoisted(() => ({
  confirmPaymentManuallyActionMock: vi.fn(),
}));

vi.mock("@/server/actions/payments", () => ({
  confirmPaymentManuallyAction: confirmPaymentManuallyActionMock,
}));

import { ConfirmPaymentButton } from "./confirm-payment-button";

describe("ConfirmPaymentButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmPaymentManuallyActionMock.mockResolvedValue({ ok: true });
  });

  it("khóa nút trong lúc chờ và không gửi trùng khi người dùng bấm liên tiếp", async () => {
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
    render(<ConfirmPaymentButton orderId="order-1" />);

    const button = screen.getByRole("button", { name: "Xác nhận thanh toán" });
    await user.dblClick(button);

    expect(confirmPaymentManuallyActionMock).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Đang xác nhận…" }),
    ).toBeDisabled();

    resolveAction?.({ ok: true });
    expect(
      await screen.findByRole("button", { name: "Xác nhận thanh toán" }),
    ).toBeEnabled();
  });

  it("hiển thị lỗi an toàn action trả về và cho phép thử lại", async () => {
    confirmPaymentManuallyActionMock.mockResolvedValue({
      ok: false,
      error: "Đơn hàng không còn ở trạng thái chờ thanh toán.",
    });
    const user = userEvent.setup();
    render(<ConfirmPaymentButton orderId="order-1" />);

    await user.click(
      screen.getByRole("button", { name: "Xác nhận thanh toán" }),
    );

    expect(
      await screen.findByText(
        "Đơn hàng không còn ở trạng thái chờ thanh toán.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Xác nhận thanh toán" }),
    ).toBeEnabled();
  });

  it("không rò lỗi mạng thô nếu lời gọi action bị reject", async () => {
    confirmPaymentManuallyActionMock.mockRejectedValue(
      new Error("Failed to find Server Action 012345"),
    );
    const user = userEvent.setup();
    render(<ConfirmPaymentButton orderId="order-1" />);

    await user.click(
      screen.getByRole("button", { name: "Xác nhận thanh toán" }),
    );

    expect(
      await screen.findByText(
        "Không thể xác nhận thanh toán lúc này. Vui lòng thử lại.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Failed to find Server Action/),
    ).not.toBeInTheDocument();
  });
});
