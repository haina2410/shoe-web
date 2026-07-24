"use client";

import { useState } from "react";
import Link from "next/link";
import { useCart, useCartHydrated, type CartItem } from "@/lib/cart";
import { formatVnd } from "@/lib/money";
import { cartSubtotal } from "@/lib/cart-math";

/**
 * `/cart` — trang giỏ hàng.
 *
 * Client Component đọc `useCart` (Zustand + `persist`, xem `@/lib/cart`).
 * Chỉ render NỘI DUNG THẬT (danh sách item / trạng thái rỗng) sau khi
 * `useCartHydrated()` trả về `true` — trước đó hiển thị một trạng thái trung
 * tính ổn định, khớp cả HTML server-render lẫn lần render đầu tiên trên
 * client (kể cả khi `skipHydration` đã tắt tự-rehydrate lúc module eval), để
 * tránh hydration mismatch (xem JSDoc trong `@/lib/cart`).
 */
export default function CartPage() {
  const hasHydrated = useCartHydrated();
  const items = useCart((state) => state.items);
  const setQuantity = useCart((state) => state.setQuantity);
  const removeItem = useCart((state) => state.removeItem);

  if (!hasHydrated) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--evergreen)" }}
        >
          Giỏ hàng
        </h1>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-lg font-medium">Giỏ hàng trống</p>
        <Link
          href="/products"
          className="mt-4 inline-block underline"
          style={{ color: "var(--evergreen)" }}
        >
          Tiếp tục xem sản phẩm
        </Link>
      </div>
    );
  }

  const subtotal = cartSubtotal(items);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1
        className="text-2xl font-bold"
        style={{ color: "var(--evergreen)" }}
      >
        Giỏ hàng
      </h1>

      <ul className="mt-6 flex flex-col gap-4">
        {items.map((item) => (
          <li
            key={item.variantId}
            className="flex items-center gap-4 border-b pb-4"
            style={{ borderColor: "var(--line)" }}
          >
            <div
              className="h-20 w-20 shrink-0 overflow-hidden rounded-md"
              style={{ backgroundColor: "var(--sage)" }}
            >
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div
                  data-testid="product-image-fallback"
                  className="flex h-full w-full items-center justify-center text-2xl"
                  aria-hidden="true"
                >
                  🌿
                </div>
              )}
            </div>

            <div className="flex-1">
              <Link href={`/products/${item.slug}`} className="font-medium hover:underline">
                {item.name}
              </Link>
              <p className="text-sm text-neutral-500">
                {item.size} / {item.color}
              </p>
              <p className="text-sm font-semibold">{formatVnd(item.unitPrice)}</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={`Giảm số lượng ${item.name} (${item.size}, ${item.color})`}
                className="flex h-7 w-7 items-center justify-center rounded-md border text-sm"
                style={{ borderColor: "var(--line)" }}
                onClick={() => setQuantity(item.variantId, item.quantity - 1)}
              >
                −
              </button>
              <QuantityInput
                item={item}
                onCommit={(quantity) => setQuantity(item.variantId, quantity)}
              />
              <button
                type="button"
                aria-label={`Tăng số lượng ${item.name} (${item.size}, ${item.color})`}
                className="flex h-7 w-7 items-center justify-center rounded-md border text-sm"
                style={{ borderColor: "var(--line)" }}
                onClick={() => setQuantity(item.variantId, item.quantity + 1)}
              >
                +
              </button>
            </div>

            <button
              type="button"
              aria-label={`Xoá ${item.name} (${item.size}, ${item.color}) khỏi giỏ hàng`}
              className="text-sm font-medium underline"
              style={{ color: "var(--ink)" }}
              onClick={() => removeItem(item.variantId)}
            >
              Xoá
            </button>
          </li>
        ))}
      </ul>

      <div
        className="mt-6 flex items-center justify-between border-t pt-4"
        style={{ borderColor: "var(--line)" }}
      >
        <p className="text-lg font-semibold">
          Tổng cộng: <span>{formatVnd(subtotal)}</span>
        </p>
        <Link
          href="/checkout"
          className="rounded-lg px-4 py-2 text-sm font-medium"
          style={{ backgroundColor: "var(--evergreen)", color: "var(--paper)" }}
        >
          Thanh toán
        </Link>
      </div>
    </div>
  );
}

/**
 * Ô nhập số lượng của 1 dòng giỏ hàng — fix review Day 5 Task 4 (IMPORTANT 1).
 *
 * Trước đây mỗi keystroke gọi thẳng `setQuantity(id, Number(e.target.value))`:
 * xoá trắng ô (giữa lúc gõ) → `Number("") === 0` → store xoá luôn dòng dưới
 * con trỏ người dùng. Sửa bằng cách giữ text đang gõ ở state cục bộ (không
 * đụng store) và chỉ commit vào store lúc `onBlur`, và chỉ khi giá trị là số
 * nguyên hợp lệ ≥ 1; nếu để trống/không hợp lệ khi rời ô, input tự reset về
 * đúng số lượng hiện tại của dòng (không xoá, không commit 0/NaN).
 *
 * Đồng bộ lại `text` mỗi khi `item.quantity` đổi từ nguồn khác (nút +/-,
 * hoặc do chính commit ở trên) bằng cách "adjust state while rendering"
 * (so sánh với `quantity` đã thấy ở lần render trước, set lại state ngay
 * trong render nếu khác) — theo khuyến nghị của React thay vì dùng
 * `useEffect` để đồng bộ prop → state (tránh cascading render / lỗi lint
 * `react-hooks/set-state-in-effect`): https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
 */
function QuantityInput({
  item,
  onCommit,
}: {
  item: CartItem;
  onCommit: (quantity: number) => void;
}) {
  const [text, setText] = useState(() => String(item.quantity));
  const [prevQuantity, setPrevQuantity] = useState(item.quantity);

  if (item.quantity !== prevQuantity) {
    setPrevQuantity(item.quantity);
    setText(String(item.quantity));
  }

  const handleBlur = () => {
    const parsed = Number(text);
    if (text.trim() !== "" && Number.isInteger(parsed) && parsed >= 1) {
      onCommit(parsed);
    } else {
      setText(String(item.quantity));
    }
  };

  return (
    <input
      type="number"
      min={1}
      aria-label={`Số lượng ${item.name} (${item.size}, ${item.color})`}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={handleBlur}
      className="w-14 rounded-md border px-2 py-1 text-center text-sm"
      style={{ borderColor: "var(--line)" }}
    />
  );
}
