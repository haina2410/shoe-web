import Link from "next/link";
import { OrderStatus } from "@/generated/prisma/enums";
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
    <div>
      <h1 className="text-2xl font-bold" style={{ color: "var(--evergreen)" }}>
        Đơn hàng
      </h1>
      <p className="mt-2 text-neutral-600">
        Theo dõi đơn hàng, trạng thái thanh toán và hoàn tiền.
      </p>

      <form
        aria-label="Bộ lọc đơn hàng"
        className="mt-6 grid gap-4 rounded-lg border p-4 sm:grid-cols-4"
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
            className="rounded-md px-4 py-2 text-sm font-semibold text-white"
            style={{ backgroundColor: "var(--evergreen)" }}
            type="submit"
          >
            Lọc đơn hàng
          </button>
        </div>
      </form>

      {orders.length === 0 ? (
        <p className="mt-6 text-neutral-600">Không tìm thấy đơn hàng phù hợp.</p>
      ) : (
        <div
          className="mt-6 overflow-x-auto rounded-lg border"
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
                  <td className="px-4 py-3">{ORDER_STATUS_LABEL[order.status]}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-[var(--sage)] px-2 py-1 text-xs font-medium">
                      {refundLabel(order)}
                    </span>
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
