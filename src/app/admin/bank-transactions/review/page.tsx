import { MatchTransactionForm } from "@/components/admin/match-transaction-form";
import { EmptyState } from "@/components/empty-state";
import { requireAdmin } from "@/lib/auth-guard";
import { formatVnd } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { listReviewedBankTransactions } from "@/server/queries/admin-orders";

const occurredAtFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Ho_Chi_Minh",
});

export default async function ReviewedBankTransactionsPage() {
  await requireAdmin();
  const transactions = await listReviewedBankTransactions(prisma);

  return (
    <div>
      <h1 className="text-2xl font-bold" style={{ color: "var(--evergreen)" }}>
        Giao dịch cần đối soát
      </h1>
      <p className="mt-2 text-neutral-600">
        Ghép các giao dịch chưa xác định được đơn hàng một cách thủ công.
      </p>

      {transactions.length === 0 ? (
        <EmptyState
          action={{ href: "/admin/orders", label: "Xem danh sách đơn hàng" }}
          description="Các giao dịch chưa xác định sẽ xuất hiện tại đây để ghép thủ công."
          title="Không có giao dịch cần đối soát"
        />
      ) : (
        <div
          aria-label="Danh sách giao dịch cần đối soát"
          className="mt-6 overflow-x-auto rounded-lg border"
          role="region"
          style={{ borderColor: "var(--line)" }}
        >
          <table className="w-full min-w-max text-left text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--line)" }}>
                <th className="px-4 py-3 font-medium">Thời gian</th>
                <th className="px-4 py-3 font-medium">Ngân hàng</th>
                <th className="px-4 py-3 font-medium">Tài khoản</th>
                <th className="px-4 py-3 font-medium">Số tiền</th>
                <th className="px-4 py-3 font-medium">Nội dung</th>
                <th className="px-4 py-3 font-medium">Lý do</th>
                <th className="px-4 py-3 font-medium">Ghép đơn</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((transaction) => (
                <tr
                  key={transaction.id}
                  className="border-b align-top last:border-0"
                  style={{ borderColor: "var(--line)" }}
                >
                  <td className="px-4 py-3 text-neutral-600">
                    {occurredAtFormatter.format(transaction.occurredAt)}
                  </td>
                  <td className="px-4 py-3">{transaction.gateway}</td>
                  <td className="px-4 py-3">{transaction.maskedAccountNumber}</td>
                  <td className="px-4 py-3">{formatVnd(transaction.amount)}</td>
                  <td className="px-4 py-3">{transaction.content}</td>
                  <td className="px-4 py-3">{transaction.reviewReasonLabel}</td>
                  <td className="px-4 py-3">
                    <MatchTransactionForm
                      bankTransactionId={transaction.id}
                      initialPaymentCode={transaction.paymentCode}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
