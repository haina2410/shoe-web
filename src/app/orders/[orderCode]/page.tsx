import type { Metadata } from "next";
import { notFound } from "next/navigation";
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

  const vietQrConfig = vietQrConfigFromEnv();
  const qrUrl = buildVietQrImageUrl({
    ...vietQrConfig,
    amount: order.total,
    addInfo: order.orderCode,
  });

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
        — Trạng thái: <span className="font-semibold">Chờ thanh toán</span>
      </p>

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <section>
          <h2 className="text-lg font-semibold" style={{ color: "var(--evergreen)" }}>
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
              <dd className="font-medium">{formatVnd(order.total)}</dd>
            </div>
          </dl>

          <p className="mt-4 text-sm font-semibold" style={{ color: "var(--destructive)" }}>
            Vui lòng ghi đúng nội dung chuyển khoản:{" "}
            <span data-testid="order-transfer-content">{order.orderCode}</span>
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold" style={{ color: "var(--evergreen)" }}>
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
              <span data-testid="order-total">{formatVnd(order.total)}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
