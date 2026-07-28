import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { matchReviewedTransactionActionMock } = vi.hoisted(() => ({
  matchReviewedTransactionActionMock: vi.fn(),
}));

vi.mock("@/server/actions/bank-transactions", () => ({
  matchReviewedTransactionAction: matchReviewedTransactionActionMock,
}));

import { MatchTransactionForm } from "./match-transaction-form";

describe("MatchTransactionForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    matchReviewedTransactionActionMock.mockResolvedValue({ ok: true });
  });

  it("uses the payment code as the initial value without normalizing it", async () => {
    render(
      <MatchTransactionForm
        bankTransactionId="cm12345678901234567890123"
        initialPaymentCode="  leafabc123  "
      />,
    );

    const input = screen.getByLabelText("Mã đơn");
    expect(input).toHaveValue("  leafabc123  ");
    fireEvent.submit(screen.getByRole("form", { name: "Ghép giao dịch" }));

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
      />,
    );

    expect(screen.getByLabelText("Mã đơn")).toHaveValue("");
  });

  it("blocks duplicate submissions and indicates pending work", () => {
    matchReviewedTransactionActionMock.mockImplementation(
      () => new Promise(() => undefined),
    );
    render(
      <MatchTransactionForm
        bankTransactionId="cm12345678901234567890123"
        initialPaymentCode="LEAFABC123"
      />,
    );

    const form = screen.getByRole("form", { name: "Ghép giao dịch" });
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(matchReviewedTransactionActionMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Đang ghép…" })).toBeDisabled();
    expect(screen.getByLabelText("Mã đơn")).toBeDisabled();
  });

  it("renders a returned error in an alert", async () => {
    matchReviewedTransactionActionMock.mockResolvedValue({
      ok: false,
      error: "Mã đơn hàng không hợp lệ.",
    });
    render(
      <MatchTransactionForm
        bankTransactionId="cm12345678901234567890123"
        initialPaymentCode={null}
      />,
    );

    fireEvent.submit(screen.getByRole("form", { name: "Ghép giao dịch" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Mã đơn hàng không hợp lệ.",
    );
  });

  it("does not expose rejected exception details", async () => {
    matchReviewedTransactionActionMock.mockRejectedValue(
      new Error("Server action secret=review-transaction-secret"),
    );
    render(
      <MatchTransactionForm
        bankTransactionId="cm12345678901234567890123"
        initialPaymentCode={null}
      />,
    );

    fireEvent.submit(screen.getByRole("form", { name: "Ghép giao dịch" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Không thể ghép giao dịch lúc này. Vui lòng thử lại.",
    );
    expect(
      screen.queryByText(/review-transaction-secret/),
    ).not.toBeInTheDocument();
  });
});
