import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { CartSummaryLink } from "@/components/cart-summary-link";
import { StorefrontSearch } from "@/components/storefront-search";

export function SiteHeader() {
  return (
    <header
      className="sticky top-0 z-40 border-b bg-[color:color-mix(in_srgb,var(--paper)_94%,transparent)] backdrop-blur"
      style={{ borderColor: "var(--line)" }}
    >
      <div className="mx-auto grid max-w-6xl grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 px-4 py-3 md:flex md:min-h-16 md:gap-6 md:py-2">
        <Link
          href="/"
          aria-label="Trang chủ leafshoes"
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center rounded-md px-1"
        >
          <BrandMark compact />
        </Link>
        <div className="order-3 col-span-3 md:order-none md:min-w-0 md:flex-1">
          <StorefrontSearch />
        </div>
        <nav
          aria-label="Điều hướng chính"
          className="col-start-3 flex items-center gap-1 text-sm font-medium md:col-auto md:gap-3"
        >
          <Link
            href="/products"
            className="inline-flex min-h-11 min-w-11 items-center rounded-md px-2"
          >
            Sản phẩm
          </Link>
          <CartSummaryLink />
        </nav>
      </div>
    </header>
  );
}
