import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tra cứu đơn hàng — leafshoes",
  description: "Tra cứu trạng thái đơn hàng leafshoes bằng mã đơn hàng.",
};

const ORDER_CODE_PATTERN = /^LEAF[A-Z0-9]{6}$/;

type OrderSearchParams = { orderCode?: string | string[] };

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<OrderSearchParams>;
}) {
  const query = await searchParams;
  const rawOrderCode =
    typeof query.orderCode === "string" ? query.orderCode : "";
  const orderCode = rawOrderCode.trim().toUpperCase();
  let lookupFailed = false;

  if (rawOrderCode && ORDER_CODE_PATTERN.test(orderCode)) {
    const order = await prisma.order.findUnique({
      where: { orderCode },
      select: { orderCode: true },
    });

    if (order) redirect(`/orders/${order.orderCode}`);
    lookupFailed = true;
  } else if (rawOrderCode) {
    lookupFailed = true;
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:py-12">
      <h1
        className="text-3xl font-bold tracking-tight"
        style={{ color: "var(--evergreen)" }}
      >
        Tra cứu đơn hàng
      </h1>
      <p className="mt-3 text-neutral-600">
        Nhập mã đơn hàng để xem trạng thái và hướng dẫn thanh toán.
      </p>

      <form
        aria-label="Tra cứu đơn hàng"
        action="/orders"
        method="get"
        className="mt-6 space-y-4"
      >
        <div>
          <label htmlFor="order-code" className="block text-sm font-medium">
            Mã đơn hàng
          </label>
          <input
            id="order-code"
            name="orderCode"
            type="text"
            value={rawOrderCode}
            required
            className="mt-2 w-full rounded-md border px-3 py-2"
            style={{ borderColor: "var(--line)" }}
          />
        </div>

        {lookupFailed ? (
          <p
            role="alert"
            className="rounded-md bg-red-50 px-3 py-2 text-sm"
            style={{ color: "var(--destructive)" }}
          >
            Không tìm thấy đơn hàng. Vui lòng kiểm tra lại mã đơn hàng.
          </p>
        ) : null}

        <button
          type="submit"
          className="rounded-md px-4 py-2 font-semibold text-white"
          style={{ backgroundColor: "var(--evergreen)" }}
        >
          Tra cứu
        </button>
      </form>
    </div>
  );
}
