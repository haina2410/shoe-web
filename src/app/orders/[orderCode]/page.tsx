import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { formatVnd } from "@/lib/money";
import { buildVietQrImageUrl, vietQrConfigFromEnv } from "@/lib/vietqr";

/**
 * `/orders/[orderCode]` — trang xác nhận đơn hàng + hướng dẫn thanh toán
 * VietQR. Server Component, PUBLIC (không cần đăng nhập) — bất kỳ ai có
 * `orderCode` đều xem được (URL năng-lực, chấp nhận cho demo guest checkout
 * Ngày 5; xem lại nếu cần bảo mật thêm ở giai đoạn sau).
 *
 * Theo `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md`
 * (Next 16): `params` là một Promise, phải `await` mới đọc được `orderCode`
 * (giống `/products/[slug]`).
 *
 * `export const dynamic = "force-dynamic"` là bắt buộc: dự án KHÔNG bật
 * `cacheComponents` (xem `next.config.ts`), nên một truy vấn Prisma thuần
 * (không phải `fetch`) KHÔNG tự khiến route dynamic — nếu thiếu cờ này,
 * Next 16 có thể prerender trang tại build time với `orderCode` không tồn
 * tại lúc build (đơn hàng luôn được tạo SAU khi build xong), gây lỗi hoặc
 * cache sai đơn hàng cho mọi mã. Đã tra cứu
 * `node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md`
 * — cùng lý do đã áp dụng cho `/` (`src/app/page.tsx`).
 *
 * `vietQrConfigFromEnv()` chỉ gọi 1 LẦN (kết quả dùng lại cho cả URL ảnh QR
 * lẫn phần hiển thị ngân hàng/số TK/chủ TK) — tránh đọc `process.env` lặp
 * lại không cần thiết.
 */

export const dynamic = "force-dynamic";

type Params = { orderCode: string };

const ORDER_STATUS_PRESENTATION = {
  [OrderStatus.PENDING_PAYMENT]: {
    label: "Chờ thanh toán",
    kind: "pending",
  },
  [OrderStatus.PAID]: {
    label: "Đã thanh toán",
    kind: "paid",
  },
  [OrderStatus.FULFILLED]: {
    label: "Đã thanh toán",
    kind: "paid",
  },
  [OrderStatus.COMPLETED]: {
    label: "Đã thanh toán",
    kind: "paid",
  },
  [OrderStatus.EXPIRED]: {
    label: "Đã hết hạn",
    kind: "inactive",
  },
  [OrderStatus.CANCELLED]: {
    label: "Đã hủy",
    kind: "inactive",
  },
} as const satisfies Record<
  OrderStatus,
  { label: string; kind: "pending" | "paid" | "inactive" }
>;

async function loadOrder(orderCode: string) {
  return prisma.order.findUnique({
    where: { orderCode },
    include: { items: true },
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { orderCode } = await params;
  return { title: `Đơn hàng ${orderCode} — leafshoes` };
}

export default async function OrderConfirmationPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { orderCode } = await params;
  const order = await loadOrder(orderCode);

  if (!order) {
    notFound();
  }

  const statusPresentation = ORDER_STATUS_PRESENTATION[order.status];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold" style={{ color: "var(--evergreen)" }}>
        Đặt hàng thành công
      </h1>
      <p className="mt-1 text-neutral-600">
        Mã đơn hàng:{" "}
        <span data-testid="order-code" className="font-semibold">
          {order.orderCode}
        </span>{" "}
        — Trạng thái:{" "}
        <span
          data-testid="order-status"
          aria-label={`Trạng thái đơn hàng: ${statusPresentation.label}`}
          className={
            statusPresentation.kind === "pending"
              ? "inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800"
              : statusPresentation.kind === "paid"
                ? "inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800"
                : "inline-flex rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-semibold text-neutral-700"
          }
        >
          {statusPresentation.label}
        </span>
      </p>

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        {statusPresentation.kind === "pending" ? (
          <PendingPaymentSection
            orderCode={order.orderCode}
            total={order.total}
          />
        ) : statusPresentation.kind === "paid" ? (
          <section aria-labelledby="payment-confirmed-heading">
            <h2
              id="payment-confirmed-heading"
              className="text-lg font-semibold"
              style={{ color: "var(--evergreen)" }}
            >
              Thanh toán đã được xác nhận
            </h2>
            <p className="mt-4 text-sm text-neutral-600">
              Chúng tôi đã nhận được thanh toán và đang xử lý đơn hàng của bạn.
            </p>
          </section>
        ) : (
          <section aria-labelledby="inactive-order-heading">
            <h2
              id="inactive-order-heading"
              className="text-lg font-semibold"
              style={{ color: "var(--evergreen)" }}
            >
              Đơn hàng không còn hoạt động
            </h2>
            <p className="mt-4 text-sm text-neutral-600">
              Đơn hàng không còn nhận thanh toán.
            </p>
          </section>
        )}

        <section aria-labelledby="order-summary-heading" className="rounded-xl border p-5" style={{ borderColor: "var(--line)" }}>
          <h2 id="order-summary-heading" className="text-lg font-semibold" style={{ color: "var(--evergreen)" }}>
            Tóm tắt đơn hàng
          </h2>

          <ul className="mt-4 flex flex-col gap-3">
            {order.items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-2 border-b pb-2 text-sm"
                style={{ borderColor: "var(--line)" }}
              >
                <div>
                  <p className="font-medium">{item.productName}</p>
                  <p className="text-neutral-500">
                    {item.size} / {item.color} × {item.quantity}
                  </p>
                </div>
                <p className="font-medium">{formatVnd(item.unitPrice * item.quantity)}</p>
              </li>
            ))}
          </ul>

          <div className="mt-4 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-neutral-500">Tạm tính</span>
              <span>{formatVnd(order.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Phí vận chuyển</span>
              <span>{formatVnd(order.shippingFee)}</span>
            </div>
            <div
              className="flex justify-between border-t pt-2 text-base font-semibold"
              style={{ borderColor: "var(--line)" }}
            >
              <span>Tổng cộng</span>
              <span data-testid="order-total" data-total={order.total}>
                {formatVnd(order.total)}
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function PendingPaymentSection({
  orderCode,
  total,
}: {
  orderCode: string;
  total: number;
}) {
  const vietQrConfig = vietQrConfigFromEnv();
  const qrUrl = buildVietQrImageUrl({
    ...vietQrConfig,
    amount: total,
    addInfo: orderCode,
  });

  return (
    <section aria-labelledby="payment-instructions-heading" className="rounded-xl border p-5" style={{ borderColor: "var(--line)" }}>
      <h2
        id="payment-instructions-heading"
        className="text-lg font-semibold"
        style={{ color: "var(--evergreen)" }}
      >
        Quét mã QR để thanh toán
      </h2>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={qrUrl}
        alt="Mã QR chuyển khoản VietQR"
        className="mt-4 w-64 max-w-full rounded-lg border"
        style={{ borderColor: "var(--line)" }}
      />

      <dl className="mt-4 space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-neutral-500">Ngân hàng</dt>
          <dd className="font-medium">{vietQrConfig.bankCode}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-neutral-500">Số tài khoản</dt>
          <dd className="font-medium">{vietQrConfig.accountNo}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-neutral-500">Chủ tài khoản</dt>
          <dd className="font-medium">{vietQrConfig.accountName}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-neutral-500">Số tiền</dt>
          <dd className="font-medium">{formatVnd(total)}</dd>
        </div>
      </dl>

      <p
        className="mt-4 text-sm font-semibold"
        style={{ color: "var(--destructive)" }}
      >
        Vui lòng ghi đúng nội dung chuyển khoản:{" "}
        <span data-testid="order-transfer-content" className="select-all break-all rounded bg-red-50 px-1">
          {orderCode}
        </span>
      </p>
    </section>
  );
}
