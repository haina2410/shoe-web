import Link from "next/link";
import { OrderStatus } from "@/generated/prisma/enums";
import { EmptyState } from "@/components/empty-state";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminSection } from "@/components/admin/admin-section";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { requireAdmin } from "@/lib/auth-guard";
import { formatVnd } from "@/lib/money";
import { ORDER_STATUS_LABEL } from "@/lib/order-status";
import { summarizePaymentLedger } from "@/lib/payment-ledger";
import { prisma } from "@/lib/prisma";
import {
  listAdminOrders,
  parseAdminOrderFilters,
  type AdminOrderListItem,
} from "@/server/queries/admin-orders";

const createdAtFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Ho_Chi_Minh",
});

const REFUND_LABEL = {
  NONE: "Chưa hoàn tiền",
  PARTIAL: "Hoàn tiền một phần",
  FULL: "Đã hoàn tiền toàn bộ",
} as const;

function refundLabel(order: AdminOrderListItem): string {
  return REFUND_LABEL[summarizePaymentLedger(order.payments).refundState];
}

function orderStatusTone(status: OrderStatus) {
  if (status === OrderStatus.PENDING_PAYMENT) return "warning" as const;
  if (status === OrderStatus.PAID) return "info" as const;
  if (status === OrderStatus.FULFILLED) return "violet" as const;
  if (status === OrderStatus.COMPLETED) return "success" as const;
  return "danger" as const;
}

function refundTone(order: AdminOrderListItem) {
  const refundState = summarizePaymentLedger(order.payments).refundState;
  if (refundState === "FULL") return "success" as const;
  if (refundState === "PARTIAL") return "warning" as const;
  return "neutral" as const;
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string | string[];
    refund?: string | string[];
    query?: string | string[];
  }>;
}) {
  await requireAdmin();
  const filters = parseAdminOrderFilters(await searchParams);
  const orders = await listAdminOrders(prisma, filters);

  return (
    <div className="grid gap-6">
      <AdminPageHeader
        description="Theo dõi đơn hàng, trạng thái thanh toán và hoàn tiền."
        title="Đơn hàng"
      />

      <AdminSection title="Lọc đơn hàng">
        <form
        aria-label="Bộ lọc đơn hàng"
        className="grid gap-4 sm:grid-cols-4"
        method="get"
        style={{ borderColor: "var(--line)" }}
      >
        <label className="grid gap-1 text-sm font-medium">
          Trạng thái
          <select
            className="rounded-md border bg-white px-3 py-2 font-normal"
            defaultValue={filters.status ?? ""}
            name="status"
            style={{ borderColor: "var(--line)" }}
          >
            <option value="">Tất cả trạng thái</option>
            {Object.values(OrderStatus).map((status) => (
              <option key={status} value={status}>
                {ORDER_STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 text-sm font-medium">
          Hoàn tiền
          <select
            className="rounded-md border bg-white px-3 py-2 font-normal"
            defaultValue={filters.refund}
            name="refund"
            style={{ borderColor: "var(--line)" }}
          >
            <option value="all">Tất cả đơn hàng</option>
            <option value="with">Có hoàn tiền</option>
          </select>
        </label>

        <label className="grid gap-1 text-sm font-medium sm:col-span-2">
          Mã đơn
          <input
            className="rounded-md border px-3 py-2 font-normal"
            defaultValue={filters.query}
            maxLength={32}
            name="query"
            placeholder="Ví dụ: LEAFABC123"
            style={{ borderColor: "var(--line)" }}
            type="search"
          />
        </label>

        <div className="sm:col-span-4">
          <button
            className="h-10 min-h-10 rounded-md px-4 py-2 text-sm font-semibold text-white"
            style={{ backgroundColor: "var(--evergreen)" }}
            type="submit"
          >
            Lọc đơn hàng
          </button>
        </div>
        </form>
      </AdminSection>

      {orders.length === 0 ? (
        <AdminSection title="Danh sách đơn hàng">
          <EmptyState
            action={{ href: "/admin/orders", label: "Xem tất cả đơn hàng" }}
            description="Thử thay đổi bộ lọc hoặc xem lại tất cả đơn hàng."
            title="Không tìm thấy đơn hàng"
          />
        </AdminSection>
      ) : (
        <AdminSection title="Danh sách đơn hàng">
          <div
          aria-label="Danh sách đơn hàng"
          className="overflow-x-auto rounded-lg border"
          role="region"
          style={{ borderColor: "var(--line)" }}
        >
          <table className="w-full min-w-max text-left text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--line)" }}>
                <th className="px-4 py-3 font-medium">Mã đơn</th>
                <th className="px-4 py-3 font-medium">Khách hàng</th>
                <th className="px-4 py-3 font-medium">Thời gian tạo</th>
                <th className="px-4 py-3 font-medium">Tổng tiền</th>
                <th className="px-4 py-3 font-medium">Trạng thái</th>
                <th className="px-4 py-3 font-medium">Hoàn tiền</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr
                  key={order.id}
                  className="border-b last:border-0"
                  style={{ borderColor: "var(--line)" }}
                >
                  <td className="px-4 py-3 font-medium">
                    <Link className="hover:underline" href={`/admin/orders/${order.id}`}>
                      {order.orderCode}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{order.customerName}</td>
                  <td className="px-4 py-3 text-neutral-600">
                    {createdAtFormatter.format(order.createdAt)}
                  </td>
                  <td className="px-4 py-3">{formatVnd(order.total)}</td>
                  <td className="px-4 py-3">
                    <AdminStatusBadge tone={orderStatusTone(order.status)}>
                      {ORDER_STATUS_LABEL[order.status]}
                    </AdminStatusBadge>
                  </td>
                  <td className="px-4 py-3">
                    <AdminStatusBadge tone={refundTone(order)}>
                      {refundLabel(order)}
                    </AdminStatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </AdminSection>
      )}
    </div>
  );
}
