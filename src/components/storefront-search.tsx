import { Search } from "lucide-react";

export function StorefrontSearch() {
  return (
    <form action="/products" aria-label="Tìm sản phẩm" role="search" className="relative">
      <label className="sr-only" htmlFor="storefront-search">
        Tìm sản phẩm
      </label>
      <input
        id="storefront-search"
        name="q"
        type="search"
        placeholder="Tìm giày…"
        className="min-h-11 w-full rounded-full border bg-white py-2 pl-4 pr-11 text-sm shadow-sm outline-none placeholder:text-neutral-500 focus:border-[var(--accent)]"
        style={{ borderColor: "var(--line)" }}
      />
      <button
        type="submit"
        aria-label="Gửi tìm kiếm"
        className="absolute inset-y-0 right-0 flex min-h-11 min-w-11 items-center justify-center rounded-r-full text-neutral-600 hover:text-[var(--evergreen)]"
      >
        <Search aria-hidden="true" size={18} />
      </button>
    </form>
  );
}
