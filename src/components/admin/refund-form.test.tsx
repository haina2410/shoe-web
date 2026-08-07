import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { recordRefundActionMock } = vi.hoisted(() => ({
  recordRefundActionMock: vi.fn(),
}));
const { showToastMock } = vi.hoisted(() => ({ showToastMock: vi.fn() }));

vi.mock("@/server/actions/refunds", () => ({
  recordRefundAction: recordRefundActionMock,
}));
vi.mock("@/components/admin/admin-toast-provider", () => ({
  useAdminToast: () => ({ show: showToastMock }),
}));

import { RefundForm } from "./refund-form";

const partialSummary = {
  totalIn: 280_000,
  totalOut: 80_000,
  netReceived: 200_000,
  refundState: "PARTIAL" as const,
};

describe("RefundForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordRefundActionMock.mockResolvedValue({
      ok: true,
      summary: partialSummary,
    });
  });

  it("requires amber confirmation before submitting and leaves the action untouched on cancel or Escape", async () => {
    const user = userEvent.setup();
    render(<RefundForm orderCode="LEAFREFUND" orderId="order-1" />);

    await user.type(screen.getByLabelText("Số tiền hoàn"), "80000");
    await user.type(
      screen.getByLabelText("Mã giao dịch ngân hàng"),
      "  BANK-REF-80  ",
    );
    await user.type(screen.getByLabelText("Ghi chú"), "  Hoàn một phần  ");
    await user.click(
      screen.getByRole("button", { name: "Ghi nhận hoàn tiền" }),
    );

    expect(screen.getByRole("alertdialog", { name: "Xác nhận hoàn tiền" })).toBeInTheDocument();
    expect(screen.getByText("Đơn hàng LEAFREFUND")).toBeInTheDocument();
    expect(recordRefundActionMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Hủy" }));
    expect(recordRefundActionMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Ghi nhận hoàn tiền" }));
    await user.keyboard("{Escape}");
    expect(recordRefundActionMock).not.toHaveBeenCalled();
  });

  it("submits confirmed numeric input with trimmed optional fields and announces success", async () => {
    const user = userEvent.setup();
    render(<RefundForm orderCode="LEAFREFUND" orderId="order-1" />);

    await user.type(screen.getByLabelText("Số tiền hoàn"), "80000");
    await user.type(screen.getByLabelText("Mã giao dịch ngân hàng"), "  BANK-REF-80  ");
    await user.type(screen.getByLabelText("Ghi chú"), "  Hoàn một phần  ");
    await user.click(screen.getByRole("button", { name: "Ghi nhận hoàn tiền" }));
    await user.click(screen.getByRole("button", { name: "Xác nhận hoàn tiền" }));

    expect(recordRefundActionMock).toHaveBeenCalledWith({
      orderId: "order-1",
      amount: 80_000,
      externalReference: "BANK-REF-80",
      note: "Hoàn một phần",
    });
    expect(showToastMock).toHaveBeenCalledWith({
      title: "Đã ghi nhận hoàn tiền",
      description: "Đơn hàng LEAFREFUND sẽ được làm mới.",
    });
    expect(screen.getByLabelText("Số tiền hoàn")).toHaveValue(null);
    expect(screen.getByLabelText("Mã giao dịch ngân hàng")).toHaveValue("");
    expect(screen.getByLabelText("Ghi chú")).toHaveValue("");
  });

  it("omits blank optional fields", async () => {
    const user = userEvent.setup();
    render(<RefundForm orderCode="LEAFREFUND" orderId="order-2" />);

    await user.type(screen.getByLabelText("Số tiền hoàn"), "100000");
    await user.type(screen.getByLabelText("Ghi chú"), "   ");
    await user.click(
      screen.getByRole("button", { name: "Ghi nhận hoàn tiền" }),
    );
    await user.click(screen.getByRole("button", { name: "Xác nhận hoàn tiền" }));

    expect(recordRefundActionMock).toHaveBeenCalledWith({
      orderId: "order-2",
      amount: 100_000,
      externalReference: undefined,
      note: undefined,
    });
  });

  it("disables submission and blocks a duplicate while pending", async () => {
    let resolveAction:
      | ((value: { ok: true; summary: typeof partialSummary }) => void)
      | undefined;
    recordRefundActionMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<RefundForm orderCode="LEAFREFUND" orderId="order-3" />);

    fireEvent.change(screen.getByLabelText("Số tiền hoàn"), {
      target: { value: "80000" },
    });
    await user.click(screen.getByRole("button", { name: "Ghi nhận hoàn tiền" }));
    await user.dblClick(screen.getByRole("button", { name: "Xác nhận hoàn tiền" }));

    expect(recordRefundActionMock).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Đang ghi nhận…" }),
    ).toBeDisabled();
    expect(screen.getByLabelText("Số tiền hoàn")).toBeDisabled();

    resolveAction?.({ ok: true, summary: partialSummary });
    expect(
      await screen.findByRole("button", { name: "Ghi nhận hoàn tiền" }),
    ).toBeEnabled();
  });

  it("shows returned errors in an alert", async () => {
    recordRefundActionMock.mockResolvedValue({
      ok: false,
      error: "Số tiền hoàn vượt quá số tiền đã nhận.",
    });
    const user = userEvent.setup();
    render(<RefundForm orderCode="LEAFREFUND" orderId="order-4" />);

    await user.type(screen.getByLabelText("Số tiền hoàn"), "999999");
    await user.click(
      screen.getByRole("button", { name: "Ghi nhận hoàn tiền" }),
    );
    await user.click(screen.getByRole("button", { name: "Xác nhận hoàn tiền" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Số tiền hoàn vượt quá số tiền đã nhận.",
    );
  });

  it("does not expose rejected exception details", async () => {
    recordRefundActionMock.mockRejectedValue(
      new Error("Failed to find Server Action secret-refund-id"),
    );
    const user = userEvent.setup();
    render(<RefundForm orderCode="LEAFREFUND" orderId="order-5" />);

    await user.type(screen.getByLabelText("Số tiền hoàn"), "80000");
    await user.click(
      screen.getByRole("button", { name: "Ghi nhận hoàn tiền" }),
    );
    await user.click(screen.getByRole("button", { name: "Xác nhận hoàn tiền" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Không thể ghi nhận hoàn tiền lúc này. Vui lòng thử lại.",
    );
    expect(
      screen.queryByText(/Failed to find Server Action/),
    ).not.toBeInTheDocument();
  });
});
