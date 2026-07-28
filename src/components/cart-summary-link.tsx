"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { useCart, useCartHydrated } from "@/lib/cart";

export function CartSummaryLink() {
  const hasHydrated = useCartHydrated();
  const count = useCart((state) =>
    state.items.reduce((sum, item) => sum + item.quantity, 0),
  );
  const showCount = hasHydrated && count > 0;

  return (
    <Link
      href="/cart"
      aria-label={showCount ? `Giỏ hàng, ${count} sản phẩm` : "Giỏ hàng"}
      className="inline-flex items-center gap-2 whitespace-nowrap rounded-full px-2 py-1 text-sm font-semibold text-[var(--evergreen)] hover:bg-[var(--sage)]"
    >
      <ShoppingBag aria-hidden="true" size={18} />
      <span>Giỏ hàng</span>
      {showCount ? (
        <span
          aria-hidden="true"
          className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--evergreen)] px-1.5 py-0.5 text-xs font-bold text-white"
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}
