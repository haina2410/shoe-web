"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useCart, useCartHydrated } from "@/lib/cart";
import { cartSubtotal } from "@/lib/cart-math";
import { formatVnd } from "@/lib/money";
import { PROVINCES, type Province } from "@/lib/provinces";
import { createOrderAction } from "@/server/actions/checkout";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";

/**
 * `/checkout` — trang đặt hàng (guest checkout, KHÔNG cần đăng nhập).
 *
 * Client Component: đọc giỏ hàng qua `useCart`/`useCartHydrated` (xem
 * `@/lib/cart`) — giống `/cart`, chỉ render NỘI DUNG THẬT (form hoặc "giỏ
 * hàng trống") sau khi `hasHydrated === true`, để tránh hydration mismatch
 * (trước đó hiển thị 1 trạng thái trung tính ổn định).
 *
 * Form chỉ thu thập ĐỊA CHỈ + `items` (`variantId` + `quantity`) — GIÁ và
 * TỒN KHO không được tin từ client, `createOrderAction` (xem
 * `@/server/actions/checkout`) tự tra lại từ DB. Vì vậy trang này chỉ hiện
 * **subtotal** (tổng tiền hàng theo giá đã có sẵn trong giỏ) — phí ship và
 * tổng cộng thật (server-authoritative) chỉ có ở trang xác nhận
 * `/orders/[orderCode]` sau khi đặt hàng thành công.
 *
 * Submit thành công (`res.ok`) → `clear()` giỏ hàng RỒI MỚI `router.push`
 * sang trang xác nhận (thứ tự này quan trọng: nếu push trước rồi mới clear,
 * một số trường hợp race có thể khiến `/checkout` re-render với giỏ hàng đã
 * clear ngay trước khi điều hướng xong). Lỗi (`!res.ok`) → hiện `res.error`
 * (đã là tiếng Việt từ server) mà KHÔNG điều hướng, KHÔNG log input ra
 * console (input chứa PII của khách — email/SĐT/địa chỉ).
 *
 * `useTransition` dùng để có `isPending` disable nút submit khi đang chờ
 * Server Action, theo đúng idiom đã dùng ở `ProductForm`
 * (`src/components/admin/product-form.tsx`).
 */
export default function CheckoutPage() {
  const hasHydrated = useCartHydrated();
  const items = useCart((state) => state.items);
  const clear = useCart((state) => state.clear);
  const router = useRouter();

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [province, setProvince] = useState<Province>(PROVINCES[0]);
  const [ward, setWard] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [note, setNote] = useState("");

  if (!hasHydrated) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8" role="status" aria-label="Đang tải giỏ hàng">
        <div className="h-8 w-32 animate-pulse rounded bg-[var(--sage)]" aria-hidden="true" />
        <div className="mt-6 h-80 animate-pulse rounded-xl bg-[var(--sage)]" aria-hidden="true" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-bold" style={{ color: "var(--evergreen)" }}>
          Thanh toán
        </h1>
        <EmptyState
          title="Giỏ hàng trống"
          description="Hãy chọn một đôi giày phù hợp trước khi thanh toán."
          action={{ href: "/products", label: "Tiếp tục xem sản phẩm" }}
        />
      </div>
    );
  }

  const subtotal = cartSubtotal(items);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const res = await createOrderAction({
        customerName,
        email,
        phone,
        province,
        ward,
        addressLine,
        note: note.trim() === "" ? undefined : note.trim(),
        items: items.map((item) => ({
          variantId: item.variantId,
          quantity: item.quantity,
        })),
      });

      if (res.ok) {
        clear();
        router.push(`/orders/${res.orderCode}`);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold" style={{ color: "var(--evergreen)" }}>
        Thanh toán
      </h1>

      <form onSubmit={handleSubmit} className="mt-6 grid gap-6 md:grid-cols-2">
        <section
          aria-labelledby="delivery-details-heading"
          className="flex flex-col gap-4 rounded-xl border p-5 shadow-sm"
          style={{ borderColor: "var(--line)", backgroundColor: "var(--paper)" }}
        >
          <h2 id="delivery-details-heading" className="text-lg font-semibold" style={{ color: "var(--evergreen)" }}>
            Thông tin giao hàng
          </h2>
          <div className="space-y-1.5">
            <label htmlFor="customerName" className="text-sm font-medium" style={{ color: "var(--ink)" }}>
              Họ tên
            </label>
            <input
              id="customerName"
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
              style={{ borderColor: "var(--line)", backgroundColor: "var(--paper)", color: "var(--ink)" }}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium" style={{ color: "var(--ink)" }}>
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
              style={{ borderColor: "var(--line)", backgroundColor: "var(--paper)", color: "var(--ink)" }}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="phone" className="text-sm font-medium" style={{ color: "var(--ink)" }}>
              Số điện thoại
            </label>
            <input
              id="phone"
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
              style={{ borderColor: "var(--line)", backgroundColor: "var(--paper)", color: "var(--ink)" }}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="province" className="text-sm font-medium" style={{ color: "var(--ink)" }}>
              Tỉnh/Thành phố
            </label>
            <select
              id="province"
              required
              value={province}
              onChange={(e) => setProvince(e.target.value as Province)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
              style={{ borderColor: "var(--line)", backgroundColor: "var(--paper)", color: "var(--ink)" }}
            >
              {PROVINCES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="ward" className="text-sm font-medium" style={{ color: "var(--ink)" }}>
              Phường/Xã
            </label>
            <input
              id="ward"
              required
              value={ward}
              onChange={(e) => setWard(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
              style={{ borderColor: "var(--line)", backgroundColor: "var(--paper)", color: "var(--ink)" }}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="addressLine" className="text-sm font-medium" style={{ color: "var(--ink)" }}>
              Địa chỉ cụ thể
            </label>
            <input
              id="addressLine"
              required
              value={addressLine}
              onChange={(e) => setAddressLine(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
              style={{ borderColor: "var(--line)", backgroundColor: "var(--paper)", color: "var(--ink)" }}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="note" className="text-sm font-medium" style={{ color: "var(--ink)" }}>
              Ghi chú (tuỳ chọn)
            </label>
            <textarea
              id="note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
              style={{ borderColor: "var(--line)", backgroundColor: "var(--paper)", color: "var(--ink)" }}
            />
          </div>

          {error && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm" style={{ color: "var(--destructive)" }}>
              {error}
            </p>
          )}

          <Button type="submit" disabled={isPending} className="w-fit">
            {isPending ? "Đang đặt hàng…" : "Đặt hàng"}
          </Button>
        </section>

        <section
          aria-labelledby="checkout-summary-heading"
          className="h-fit rounded-xl border p-5 shadow-sm"
          style={{ borderColor: "var(--line)", backgroundColor: "var(--paper)" }}
        >
          <h2 id="checkout-summary-heading" className="text-lg font-semibold" style={{ color: "var(--evergreen)" }}>
            Đơn hàng của bạn
          </h2>

          <ul className="mt-4 flex flex-col gap-3">
            {items.map((item) => (
              <li
                key={item.variantId}
                className="flex items-center justify-between gap-2 border-b pb-2 text-sm"
                style={{ borderColor: "var(--line)" }}
              >
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-neutral-500">
                    {item.size} / {item.color} × {item.quantity}
                  </p>
                </div>
                <p className="font-medium">{formatVnd(item.unitPrice * item.quantity)}</p>
              </li>
            ))}
          </ul>

          <div
            className="mt-4 flex items-center justify-between border-t pt-4"
            style={{ borderColor: "var(--line)" }}
          >
            <p className="font-semibold">Tạm tính</p>
            <p className="font-semibold">{formatVnd(subtotal)}</p>
          </div>

          <p className="mt-2 text-xs text-neutral-500">
            Phí vận chuyển và tổng cộng sẽ hiển thị ở trang xác nhận sau khi đặt
            hàng thành công.
          </p>
        </section>
      </form>
    </div>
  );
}
