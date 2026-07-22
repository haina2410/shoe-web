import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b" style={{ borderColor: "var(--line)" }}>
      <div className="mx-auto max-w-6xl flex items-center justify-between px-4 h-16">
        <Link
          href="/"
          className="text-lg font-extrabold tracking-tight"
          style={{ color: "var(--evergreen)" }}
        >
          leafshoes
        </Link>
        <nav className="flex items-center gap-6 text-sm font-medium">
          <Link href="/products">Sản phẩm</Link>
          <Link href="/cart" aria-label="Giỏ hàng">
            Giỏ hàng
          </Link>
        </nav>
      </div>
    </header>
  );
}
