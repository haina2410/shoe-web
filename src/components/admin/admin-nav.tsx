import Link from "next/link";

const ADMIN_NAV_ITEMS = [
  { href: "/admin/products", label: "Sản phẩm" },
  { href: "/admin/orders", label: "Đơn hàng" },
  { href: "/admin/bank-transactions/review", label: "Đối soát" },
] as const;

export function AdminNav() {
  return (
    <nav aria-label="Điều hướng quản trị" className="overflow-x-auto">
      <ul className="flex min-w-max gap-1 px-1 py-1">
        {ADMIN_NAV_ITEMS.map((item) => (
          <li key={item.href}>
            <Link
              className="block rounded-md px-3 py-2 text-sm font-semibold text-neutral-700 transition-colors hover:bg-[var(--sage)] hover:text-[var(--evergreen)] focus-visible:bg-[var(--sage)]"
              href={item.href}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
