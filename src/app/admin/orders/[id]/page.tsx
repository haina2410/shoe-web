import { notFound } from "next/navigation";
import { z } from "zod";
import {
  OrderStatus,
  PaymentDirection,
} from "@/generated/prisma/enums";
import { ConfirmPaymentButton } from "@/components/admin/confirm-payment-button";
import { OrderStatusActions } from "@/components/admin/order-status-actions";
import { RefundForm } from "@/components/admin/refund-form";
import { requireAdmin } from "@/lib/auth-guard";
import { formatVnd } from "@/lib/money";
import { ORDER_STATUS_LABEL } from "@/lib/order-status";
import { prisma } from "@/lib/prisma";
import { getAdminOrderDetail } from "@/server/queries/admin-orders";

const orderIdSchema = z.string().cuid();

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Ho_Chi_Minh",
});

const REFUND_LABEL = {
  NONE: "Chưa hoàn tiền",
  PARTIAL: "Hoàn tiền một phần",
  FULL: "Đã hoàn tiền toàn bộ",
} as const;

function maskAccountNumber(accountNumber: string): string {
  if (accountNumber.length <= 4) return "••••";
  return `•••• ${accountNumber.slice(-4)}`;
}

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const parsedId = orderIdSchema.safeParse(id);
  if (!parsedId.success) {
    notFound();
  }

  const order = await getAdminOrderDetail(prisma, parsedId.data);
  if (!order) {
    notFound();
  }

  const hasRefundableBalance = order.ledgerSummary.netReceived > 0;

  return (
    <div className="grid gap-8">
      <header>
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--evergreen)" }}
        >
          Đơn hàng {order.orderCode}
        </h1>
        <p className="mt-2 text-neutral-600">
          {ORDER_STATUS_LABEL[order.status]} · Tạo lúc{" "}
          {dateFormatter.format(order.createdAt)}
        </p>
      </header>

      <section
        className="grid gap-3 rounded-lg border p-4"
        style={{ borderColor: "var(--line)" }}
      >
        <h2 className="text-lg font-semibold">Thao tác</h2>
        <div className="flex flex-wrap items-start gap-3">
          {order.status === OrderStatus.PENDING_PAYMENT && (
            <ConfirmPaymentButton orderId={order.id} />
          )}
          <OrderStatusActions
            orderId={order.id}
            targets={order.nextOrderStatuses}
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section
          className="rounded-lg border p-4"
          style={{ borderColor: "var(--line)" }}
        >
          <h2 className="text-lg font-semibold">Khách hàng</h2>
          <dl className="mt-3 grid gap-2 text-sm">
            <div>
              <dt className="text-neutral-500">Họ tên</dt>
              <dd>{order.customerName}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Email</dt>
              <dd>{order.email}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Điện thoại</dt>
              <dd>{order.phone}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Địa chỉ</dt>
              <dd>
                {order.addressLine}, {order.ward}, {order.province}
              </dd>
            </div>
            {order.note && (
              <div>
                <dt className="text-neutral-500">Ghi chú đơn hàng</dt>
                <dd>{order.note}</dd>
              </div>
            )}
          </dl>
        </section>

        <section
          className="rounded-lg border p-4"
          style={{ borderColor: "var(--line)" }}
        >
          <h2 className="text-lg font-semibold">Tổng tiền</h2>
          <dl className="mt-3 grid gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt>Tạm tính</dt>
              <dd>{formatVnd(order.subtotal)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Phí vận chuyển</dt>
              <dd>{formatVnd(order.shippingFee)}</dd>
            </div>
            <div className="flex justify-between gap-4 font-semibold">
              <dt>Tổng cộng</dt>
              <dd>{formatVnd(order.total)}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section>
        <h2 className="text-lg font-semibold">Sản phẩm</h2>
        <div
          className="mt-3 overflow-x-auto rounded-lg border"
          style={{ borderColor: "var(--line)" }}
        >
          <table className="w-full min-w-max text-left text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--line)" }}>
                <th className="px-4 py-3 font-medium">Sản phẩm</th>
                <th className="px-4 py-3 font-medium">Phân loại</th>
                <th className="px-4 py-3 font-medium">Đơn giá</th>
                <th className="px-4 py-3 font-medium">Số lượng</th>
                <th className="px-4 py-3 font-medium">Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr
                  key={item.id}
                  className="border-b last:border-0"
                  style={{ borderColor: "var(--line)" }}
                >
                  <td className="px-4 py-3">{item.productName}</td>
                  <td className="px-4 py-3">
                    {item.size} / {item.color}
                  </td>
                  <td className="px-4 py-3">{formatVnd(item.unitPrice)}</td>
                  <td className="px-4 py-3">{item.quantity}</td>
                  <td className="px-4 py-3">
                    {formatVnd(item.unitPrice * item.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section
        className="grid gap-4 rounded-lg border p-4"
        style={{ borderColor: "var(--line)" }}
      >
        <h2 className="text-lg font-semibold">Thanh toán và hoàn tiền</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-neutral-500">Tiền vào</dt>
            <dd>{formatVnd(order.ledgerSummary.totalIn)}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Tiền hoàn</dt>
            <dd>{formatVnd(order.ledgerSummary.totalOut)}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Thực nhận</dt>
            <dd>{formatVnd(order.ledgerSummary.netReceived)}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Tình trạng</dt>
            <dd>{REFUND_LABEL[order.ledgerSummary.refundState]}</dd>
          </div>
        </dl>

        {hasRefundableBalance && (
          <div className="max-w-lg border-t pt-4" style={{ borderColor: "var(--line)" }}>
            <RefundForm orderId={order.id} />
          </div>
        )}

        {order.payments.length === 0 ? (
          <p className="text-sm text-neutral-600">Chưa có giao dịch thanh toán.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-left text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--line)" }}>
                  <th className="px-3 py-2 font-medium">Loại</th>
                  <th className="px-3 py-2 font-medium">Số tiền</th>
                  <th className="px-3 py-2 font-medium">Giao dịch</th>
                  <th className="px-3 py-2 font-medium">Người ghi nhận</th>
                  <th className="px-3 py-2 font-medium">Tham chiếu / ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {order.payments.map((payment) => (
                  <tr
                    key={payment.id}
                    className="border-b last:border-0"
                    style={{ borderColor: "var(--line)" }}
                  >
                    <td className="px-3 py-2">
                      {payment.direction === PaymentDirection.IN
                        ? "Tiền vào"
                        : "Hoàn tiền"}
                    </td>
                    <td className="px-3 py-2">{formatVnd(payment.amount)}</td>
                    <td className="px-3 py-2">
                      <div>{payment.provider}</div>
                      <div className="text-neutral-500">
                        {payment.transactionId}
                      </div>
                      <div className="text-neutral-500">
                        {dateFormatter.format(payment.matchedAt)}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {payment.recordedBy ? (
                        <>
                          <div>{payment.recordedBy.name}</div>
                          <div className="text-neutral-500">
                            {payment.recordedBy.email}
                          </div>
                        </>
                      ) : (
                        "Tự động"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {payment.externalReference && (
                        <div>{payment.externalReference}</div>
                      )}
                      {payment.note && (
                        <div className="text-neutral-500">{payment.note}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold">Giao dịch ngân hàng liên kết</h2>
        {order.bankTransactions.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-600">
            Chưa có giao dịch ngân hàng liên kết.
          </p>
        ) : (
          <div
            className="mt-3 overflow-x-auto rounded-lg border"
            style={{ borderColor: "var(--line)" }}
          >
            <table className="w-full min-w-max text-left text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--line)" }}>
                  <th className="px-3 py-2 font-medium">Thời gian</th>
                  <th className="px-3 py-2 font-medium">Ngân hàng</th>
                  <th className="px-3 py-2 font-medium">Tài khoản</th>
                  <th className="px-3 py-2 font-medium">Số tiền</th>
                  <th className="px-3 py-2 font-medium">Nội dung</th>
                  <th className="px-3 py-2 font-medium">Tham chiếu</th>
                </tr>
              </thead>
              <tbody>
                {order.bankTransactions.map((transaction) => (
                  <tr
                    key={transaction.id}
                    className="border-b last:border-0"
                    style={{ borderColor: "var(--line)" }}
                  >
                    <td className="px-3 py-2">
                      {dateFormatter.format(transaction.occurredAt)}
                    </td>
                    <td className="px-3 py-2">{transaction.gateway}</td>
                    <td className="px-3 py-2">
                      {maskAccountNumber(transaction.accountNumber)}
                    </td>
                    <td className="px-3 py-2">{formatVnd(transaction.amount)}</td>
                    <td className="px-3 py-2">{transaction.content}</td>
                    <td className="px-3 py-2">
                      {transaction.referenceCode ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
