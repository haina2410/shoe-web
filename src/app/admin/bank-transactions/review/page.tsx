import { MatchTransactionForm } from "@/components/admin/match-transaction-form";
import { AdminMetric } from "@/components/admin/admin-metric";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminSection } from "@/components/admin/admin-section";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
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
    <div className="space-y-6">
      <AdminPageHeader
        description="Ghép các giao dịch chưa xác định được đơn hàng một cách thủ công."
        status={<AdminStatusBadge tone="warning">Đang chờ đối soát</AdminStatusBadge>}
        title="Giao dịch cần đối soát"
      />

      <div className="grid gap-4 sm:max-w-xs">
        <AdminMetric
          description="Các giao dịch cần được ghép thủ công."
          label="Cần xử lý"
          value={transactions.length}
        />
      </div>

      <AdminSection
        description="Các giao dịch cũ nhất được ưu tiên xử lý trước."
        title="Danh sách giao dịch cần đối soát"
      >
        {transactions.length === 0 ? (
          <EmptyState
            action={{ href: "/admin/orders", label: "Xem danh sách đơn hàng" }}
            description="Các giao dịch chưa xác định sẽ xuất hiện tại đây để ghép thủ công."
            title="Không có giao dịch cần đối soát"
          />
        ) : (
          <div
            aria-label="Danh sách giao dịch cần đối soát"
            className="overflow-x-auto rounded-lg border bg-white"
            role="region"
            style={{ borderColor: "var(--line)" }}
          >
            <table className="w-full min-w-max text-left text-sm">
              <thead>
                <tr className="border-b bg-neutral-50 text-xs font-semibold tracking-wide text-neutral-700 uppercase" style={{ borderColor: "var(--line)" }}>
                  <th className="px-4 py-3.5">Thời gian</th>
                  <th className="px-4 py-3.5">Ngân hàng</th>
                  <th className="px-4 py-3.5">Tài khoản</th>
                  <th className="px-4 py-3.5">Số tiền</th>
                  <th className="px-4 py-3.5">Nội dung</th>
                  <th className="px-4 py-3.5">Lý do</th>
                  <th className="px-4 py-3.5">Ghép đơn</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction) => (
                  <tr
                    key={transaction.id}
                    className="border-b align-top transition-colors hover:bg-neutral-50 focus-within:bg-neutral-50 last:border-0"
                    style={{ borderColor: "var(--line)" }}
                  >
                    <td className="px-4 py-4 text-neutral-600">
                      {occurredAtFormatter.format(transaction.occurredAt)}
                    </td>
                    <td className="px-4 py-4 font-medium">{transaction.gateway}</td>
                    <td className="px-4 py-4 text-neutral-600">{transaction.maskedAccountNumber}</td>
                    <td className="px-4 py-4 font-semibold tabular-nums">{formatVnd(transaction.amount)}</td>
                    <td className="px-4 py-4">{transaction.content}</td>
                    <td className="px-4 py-4">
                      <AdminStatusBadge tone="warning">
                        {transaction.reviewReasonLabel}
                      </AdminStatusBadge>
                    </td>
                    <td className="px-4 py-4">
                      <MatchTransactionForm
                        bankTransactionId={transaction.id}
                        initialPaymentCode={transaction.paymentCode}
                        transactionAmount={formatVnd(transaction.amount)}
                        transactionContent={transaction.content}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminSection>
    </div>
  );
}
