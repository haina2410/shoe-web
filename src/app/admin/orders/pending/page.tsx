import { ConfirmPaymentButton } from "@/components/admin/confirm-payment-button";
import { requireAdmin } from "@/lib/auth-guard";
import { formatVnd } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

const createdAtFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Ho_Chi_Minh",
});

export default async function AdminPendingOrdersPage() {
  await requireAdmin();
  const pendingOrders = await prisma.order.findMany({
    where: { status: OrderStatus.PENDING_PAYMENT },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      orderCode: true,
      createdAt: true,
      total: true,
    },
  });
  return (
    <div>
      <h1 className="text-2xl font-bold" style={{ color: "var(--evergreen)" }}>
        Đơn hàng chờ thanh toán
      </h1>

      {pendingOrders.length === 0 ? (
        <p className="mt-6 text-neutral-600">
          Không có đơn hàng nào đang chờ thanh toán.
        </p>
      ) : (
        <div
          className="mt-6 overflow-x-auto rounded-lg border"
          style={{ borderColor: "var(--line)" }}
        >
          <table className="w-full min-w-max text-left text-sm">
            <thead>
              <tr
                className="border-b"
                style={{ borderColor: "var(--line)" }}
              >
                <th className="px-4 py-3 font-medium">Mã đơn</th>
                <th className="px-4 py-3 font-medium">Thời gian tạo</th>
                <th className="px-4 py-3 font-medium">Tổng tiền</th>
                <th className="px-4 py-3 font-medium">
                  <span className="sr-only">Hành động</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {pendingOrders.map((order) => (
                <tr
                  key={order.id}
                  className="border-b last:border-0"
                  style={{ borderColor: "var(--line)" }}
                >
                  <td className="px-4 py-3 font-medium">{order.orderCode}</td>
                  <td className="px-4 py-3 text-neutral-600">
                    {createdAtFormatter.format(order.createdAt)}
                  </td>
                  <td className="px-4 py-3">{formatVnd(order.total)}</td>
                  <td className="px-4 py-3">
                    <ConfirmPaymentButton orderId={order.id} />
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
