import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

const { listReviewedBankTransactionsMock, requireAdminMock } = vi.hoisted(
  () => ({
    listReviewedBankTransactionsMock: vi.fn(),
    requireAdminMock: vi.fn(),
  }),
);

vi.mock("@/lib/auth-guard", () => ({ requireAdmin: requireAdminMock }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/server/queries/admin-orders", () => ({
  listReviewedBankTransactions: listReviewedBankTransactionsMock,
}));
vi.mock("@/components/admin/match-transaction-form", () => ({
  MatchTransactionForm: ({
    bankTransactionId,
    initialPaymentCode,
  }: {
    bankTransactionId: string;
    initialPaymentCode: string | null;
  }) => (
    <form aria-label={`Ghép ${bankTransactionId}`}>
      <input defaultValue={initialPaymentCode ?? ""} name="orderCode" />
    </form>
  ),
}));

import ReviewedBankTransactionsPage from "./page";

const transactions = [
  {
    id: "review-oldest",
    occurredAt: new Date("2026-07-20T08:00:00.000Z"),
    gateway: "VCB",
    maskedAccountNumber: "•••• 6789",
    amount: 120_000,
    content: "Thanh toan LEAFABC123",
    paymentCode: "LEAFABC123",
    reviewReason: "MISSING_ORDER_CODE",
    reviewReasonLabel: "Không tìm thấy mã đơn trong giao dịch",
  },
  {
    id: "review-newer",
    occurredAt: new Date("2026-07-20T09:00:00.000Z"),
    gateway: "ACB",
    maskedAccountNumber: "••••",
    amount: 150_000,
    content: "Chuyen khoan can kiem tra",
    paymentCode: null,
    reviewReason: null,
    reviewReasonLabel: "Cần kiểm tra thủ công",
    rawPayload: { secret: "RAW PAYLOAD MUST NOT RENDER" },
  },
];

describe("ReviewedBankTransactionsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue({ user: { role: "staff" } });
    listReviewedBankTransactionsMock.mockResolvedValue(transactions);
  });

  it("authenticates before reading and renders oldest review rows with safe details", async () => {
    render(await ReviewedBankTransactionsPage());

    expect(requireAdminMock).toHaveBeenCalledTimes(1);
    expect(listReviewedBankTransactionsMock).toHaveBeenCalledWith({});
    expect(requireAdminMock.mock.invocationCallOrder[0]).toBeLessThan(
      listReviewedBankTransactionsMock.mock.invocationCallOrder[0],
    );
    expect(
      screen.getByRole("heading", { name: "Giao dịch cần đối soát" }),
    ).toBeInTheDocument();
    const rows = screen.getAllByRole("row");
    expect(within(rows[1]).getByText("Thanh toan LEAFABC123")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Chuyen khoan can kiem tra")).toBeInTheDocument();
    expect(screen.getByText("Không tìm thấy mã đơn trong giao dịch")).toBeInTheDocument();
    expect(screen.getByText("Cần kiểm tra thủ công")).toBeInTheDocument();
    expect(screen.getByText("•••• 6789")).toBeInTheDocument();
    expect(screen.getByText("120.000 ₫")).toBeInTheDocument();
    expect(screen.getByText("150.000 ₫")).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Ghép review-oldest" })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Ghép review-newer" })).toBeInTheDocument();
    expect(screen.queryByText(/RAW PAYLOAD MUST NOT RENDER/)).not.toBeInTheDocument();
  });

  it("shows an empty state when no transactions require review", async () => {
    listReviewedBankTransactionsMock.mockResolvedValue([]);

    render(await ReviewedBankTransactionsPage());

    expect(
      screen.getByText("Không có giao dịch nào cần đối soát."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
