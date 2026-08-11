import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { matchReviewedTransactionActionMock } = vi.hoisted(() => ({
  matchReviewedTransactionActionMock: vi.fn(),
}));
const { showToastMock } = vi.hoisted(() => ({ showToastMock: vi.fn() }));

vi.mock("@/server/actions/bank-transactions", () => ({
  matchReviewedTransactionAction: matchReviewedTransactionActionMock,
}));
vi.mock("@/components/admin/admin-toast-provider", () => ({
  useAdminToast: () => ({ show: showToastMock }),
}));

import { MatchTransactionForm } from "./match-transaction-form";

describe("MatchTransactionForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    matchReviewedTransactionActionMock.mockResolvedValue({ ok: true });
  });

  it("uses the payment code as the initial value without normalizing it", async () => {
    const user = userEvent.setup();
    render(
      <MatchTransactionForm
        bankTransactionId="cm12345678901234567890123"
        initialPaymentCode="  leafabc123  "
        transactionAmount="120.000 ₫"
        transactionContent="Thanh toan LEAFABC123"
      />,
    );

    const input = screen.getByLabelText("Mã đơn");
    expect(input).toHaveValue("  leafabc123  ");
    await user.click(screen.getByRole("button", { name: "Ghép giao dịch" }));
    await user.click(screen.getByRole("button", { name: "Xác nhận ghép" }));

    expect(matchReviewedTransactionActionMock).toHaveBeenCalledWith({
      bankTransactionId: "cm12345678901234567890123",
      orderCode: "  leafabc123  ",
    });
  });

  it("uses an empty initial value when the payment code is absent", () => {
    render(
      <MatchTransactionForm
        bankTransactionId="cm12345678901234567890123"
        initialPaymentCode={null}
        transactionAmount="120.000 ₫"
        transactionContent="Thanh toan LEAFABC123"
      />,
    );

    expect(screen.getByLabelText("Mã đơn")).toHaveValue("");
  });

  it("gives the order-code input a 40px minimum touch target", () => {
    render(
      <MatchTransactionForm
        bankTransactionId="cm12345678901234567890123"
        initialPaymentCode="LEAFABC123"
        transactionAmount="120.000 ₫"
        transactionContent="Thanh toan LEAFABC123"
      />,
    );

    expect(screen.getByLabelText("Mã đơn")).toHaveClass("h-10", "min-h-10");
  });

  it("names the captured entered order code in the confirmation before matching", async () => {
    const user = userEvent.setup();
    render(
      <MatchTransactionForm
        bankTransactionId="cm12345678901234567890123"
        initialPaymentCode="LEAFABC123"
        transactionAmount="120.000 ₫"
        transactionContent="Thanh toan LEAFABC123"
      />,
    );

    await user.clear(screen.getByLabelText("Mã đơn"));
    await user.type(screen.getByLabelText("Mã đơn"), "leafxyz789");
    await user.click(screen.getByRole("button", { name: "Ghép giao dịch" }));

    expect(screen.getByRole("alertdialog")).toHaveTextContent("leafxyz789");
    expect(matchReviewedTransactionActionMock).not.toHaveBeenCalled();
  });

  it("requires amber confirmation that names the transaction and amount without submitting after dismissal", async () => {
    const user = userEvent.setup();
    render(
      <MatchTransactionForm
        bankTransactionId="cm12345678901234567890123"
        initialPaymentCode="LEAFABC123"
        transactionAmount="120.000 ₫"
        transactionContent="Thanh toan LEAFABC123"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ghép giao dịch" }));

    expect(matchReviewedTransactionActionMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole("alertdialog", { name: "Xác nhận ghép giao dịch" }),
    ).toHaveTextContent("Thanh toan LEAFABC123");
    expect(screen.getByRole("alertdialog")).toHaveTextContent("120.000 ₫");

    await user.click(screen.getByRole("button", { name: "Hủy" }));
    expect(matchReviewedTransactionActionMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Ghép giao dịch" }));
    await user.keyboard("{Escape}");
    expect(matchReviewedTransactionActionMock).not.toHaveBeenCalled();
  });

  it("blocks duplicate confirmations and locks fields and dialog actions while matching", async () => {
    let resolveAction: ((value: { ok: true }) => void) | undefined;
    matchReviewedTransactionActionMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve;
        }),
    );
    const user = userEvent.setup();
    render(
      <MatchTransactionForm
        bankTransactionId="cm12345678901234567890123"
        initialPaymentCode="LEAFABC123"
        transactionAmount="120.000 ₫"
        transactionContent="Thanh toan LEAFABC123"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ghép giao dịch" }));
    await user.dblClick(screen.getByRole("button", { name: "Xác nhận ghép" }));

    expect(matchReviewedTransactionActionMock).toHaveBeenCalledTimes(1);
    expect(matchReviewedTransactionActionMock).toHaveBeenCalledWith({
      bankTransactionId: "cm12345678901234567890123",
      orderCode: "LEAFABC123",
    });
    expect(screen.getByRole("button", { name: "Đang ghép…" })).toBeDisabled();
    expect(screen.getByLabelText("Mã đơn")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Hủy" })).toBeDisabled();

    resolveAction?.({ ok: true });
  });

  it("renders a returned error inline and leaves the order code available to retry", async () => {
    matchReviewedTransactionActionMock.mockResolvedValue({
      ok: false,
      error: "Mã đơn hàng không hợp lệ.",
    });
    const user = userEvent.setup();
    render(
      <MatchTransactionForm
        bankTransactionId="cm12345678901234567890123"
        initialPaymentCode={null}
        transactionAmount="120.000 ₫"
        transactionContent="Thanh toan LEAFABC123"
      />,
    );

    await user.type(screen.getByLabelText("Mã đơn"), "LEAFBAD123");
    await user.click(screen.getByRole("button", { name: "Ghép giao dịch" }));
    await user.click(screen.getByRole("button", { name: "Xác nhận ghép" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Mã đơn hàng không hợp lệ.",
    );
    expect(screen.getByLabelText("Mã đơn")).toHaveValue("LEAFBAD123");
    expect(screen.getByLabelText("Mã đơn")).toBeEnabled();
  });

  it("does not expose rejected exception details", async () => {
    matchReviewedTransactionActionMock.mockRejectedValue(
      new Error("Server action secret=review-transaction-secret"),
    );
    render(
      <MatchTransactionForm
        bankTransactionId="cm12345678901234567890123"
        initialPaymentCode={null}
        transactionAmount="120.000 ₫"
        transactionContent="Thanh toan LEAFABC123"
      />,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Mã đơn"), "LEAFBAD123");
    await user.click(screen.getByRole("button", { name: "Ghép giao dịch" }));
    await user.click(screen.getByRole("button", { name: "Xác nhận ghép" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Không thể ghép giao dịch lúc này. Vui lòng thử lại.",
    );
    expect(
      screen.queryByText(/review-transaction-secret/),
    ).not.toBeInTheDocument();
  });

  it("submits a second match after a returned error", async () => {
    matchReviewedTransactionActionMock
      .mockResolvedValueOnce({ ok: false, error: "Mã đơn hàng không hợp lệ." })
      .mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    render(
      <MatchTransactionForm
        bankTransactionId="cm12345678901234567890123"
        initialPaymentCode="LEAFRETRY123"
        transactionAmount="120.000 ₫"
        transactionContent="Thanh toan LEAFRETRY123"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ghép giao dịch" }));
    await user.click(screen.getByRole("button", { name: "Xác nhận ghép" }));
    await screen.findByRole("alert");

    await user.click(screen.getByRole("button", { name: "Ghép giao dịch" }));
    await user.click(screen.getByRole("button", { name: "Xác nhận ghép" }));

    await waitFor(() => expect(matchReviewedTransactionActionMock).toHaveBeenCalledTimes(2));
  });

  it("submits a second match after a rejected action", async () => {
    matchReviewedTransactionActionMock
      .mockRejectedValueOnce(new Error("review connection reset"))
      .mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    render(
      <MatchTransactionForm
        bankTransactionId="cm12345678901234567890123"
        initialPaymentCode="LEAFRETRY456"
        transactionAmount="120.000 ₫"
        transactionContent="Thanh toan LEAFRETRY456"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ghép giao dịch" }));
    await user.click(screen.getByRole("button", { name: "Xác nhận ghép" }));
    await screen.findByRole("alert");

    await user.click(screen.getByRole("button", { name: "Ghép giao dịch" }));
    await user.click(screen.getByRole("button", { name: "Xác nhận ghép" }));

    await waitFor(() => expect(matchReviewedTransactionActionMock).toHaveBeenCalledTimes(2));
  });

  it("announces successful matching without removing the form locally", async () => {
    const user = userEvent.setup();
    render(
      <MatchTransactionForm
        bankTransactionId="cm12345678901234567890123"
        initialPaymentCode="LEAFABC123"
        transactionAmount="120.000 ₫"
        transactionContent="Thanh toan LEAFABC123"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ghép giao dịch" }));
    await user.click(screen.getByRole("button", { name: "Xác nhận ghép" }));

    expect(showToastMock).toHaveBeenCalledWith({
      title: "Đã ghép giao dịch",
      description: "Danh sách giao dịch cần đối soát sẽ được làm mới.",
      tone: "success",
    });
    expect(screen.getByRole("form", { name: "Ghép giao dịch" })).toBeInTheDocument();
  });
});
