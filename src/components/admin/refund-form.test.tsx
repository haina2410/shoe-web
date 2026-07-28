import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { recordRefundActionMock } = vi.hoisted(() => ({
  recordRefundActionMock: vi.fn(),
}));

vi.mock("@/server/actions/refunds", () => ({
  recordRefundAction: recordRefundActionMock,
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

  it("submits a numeric amount with trimmed optional fields, resets, and renders the summary label", async () => {
    const user = userEvent.setup();
    render(<RefundForm orderId="order-1" />);

    await user.type(screen.getByLabelText("Số tiền hoàn"), "80000");
    await user.type(
      screen.getByLabelText("Mã giao dịch ngân hàng"),
      "  BANK-REF-80  ",
    );
    await user.type(screen.getByLabelText("Ghi chú"), "  Hoàn một phần  ");
    await user.click(
      screen.getByRole("button", { name: "Ghi nhận hoàn tiền" }),
    );

    expect(recordRefundActionMock).toHaveBeenCalledWith({
      orderId: "order-1",
      amount: 80_000,
      externalReference: "BANK-REF-80",
      note: "Hoàn một phần",
    });
    expect(await screen.findByText("Hoàn tiền một phần")).toBeInTheDocument();
    expect(screen.getByLabelText("Số tiền hoàn")).toHaveValue(null);
    expect(screen.getByLabelText("Mã giao dịch ngân hàng")).toHaveValue("");
    expect(screen.getByLabelText("Ghi chú")).toHaveValue("");
  });

  it("omits blank optional fields", async () => {
    const user = userEvent.setup();
    render(<RefundForm orderId="order-2" />);

    await user.type(screen.getByLabelText("Số tiền hoàn"), "100000");
    await user.type(screen.getByLabelText("Ghi chú"), "   ");
    await user.click(
      screen.getByRole("button", { name: "Ghi nhận hoàn tiền" }),
    );

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
    render(<RefundForm orderId="order-3" />);

    fireEvent.change(screen.getByLabelText("Số tiền hoàn"), {
      target: { value: "80000" },
    });
    const form = screen.getByRole("form", { name: "Hoàn tiền" });
    fireEvent.submit(form);
    fireEvent.submit(form);

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
    render(<RefundForm orderId="order-4" />);

    await user.type(screen.getByLabelText("Số tiền hoàn"), "999999");
    await user.click(
      screen.getByRole("button", { name: "Ghi nhận hoàn tiền" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Số tiền hoàn vượt quá số tiền đã nhận.",
    );
  });

  it("does not expose rejected exception details", async () => {
    recordRefundActionMock.mockRejectedValue(
      new Error("Failed to find Server Action secret-refund-id"),
    );
    const user = userEvent.setup();
    render(<RefundForm orderId="order-5" />);

    await user.type(screen.getByLabelText("Số tiền hoàn"), "80000");
    await user.click(
      screen.getByRole("button", { name: "Ghi nhận hoàn tiền" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Không thể ghi nhận hoàn tiền lúc này. Vui lòng thử lại.",
    );
    expect(
      screen.queryByText(/Failed to find Server Action/),
    ).not.toBeInTheDocument();
  });
});
