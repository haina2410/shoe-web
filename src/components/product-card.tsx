import Image from "next/image";
import Link from "next/link";
import { formatVnd } from "@/lib/money";
import type { CatalogListItem } from "@/server/queries/catalog";

/**
 * `ProductCard` — thẻ sản phẩm dùng trong lưới `/products`.
 *
 * Server-safe (không có `"use client"`): chỉ render, không có state/handler.
 * Dùng `next/image` để tối ưu ảnh storefront. Ảnh admin được phục vụ qua
 * route handler cần giữ nguyên request nội bộ, nên chỉ chúng được unoptimized.
 * Thiếu ảnh (`imageUrl === null`) → fallback khối nền `--sage` + glyph lá,
 * không bao giờ render `<img>` với `src` rỗng/hỏng.
 */
export function ProductCard({ product }: { product: CatalogListItem }) {
  return (
    <Link
      href={`/products/${product.slug}`}
      className="group block overflow-hidden rounded-xl border bg-[var(--paper)] transition-shadow motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-lg focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[var(--accent)]"
      style={{ borderColor: "var(--line)" }}
    >
      <div
        className="relative aspect-square w-full overflow-hidden"
        style={{ backgroundColor: "var(--sage)" }}
      >
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 25vw"
            unoptimized={product.imageUrl.startsWith("/api/uploads/")}
            className="object-cover transition-transform motion-safe:group-hover:scale-105 motion-reduce:transform-none"
          />
        ) : (
          <div
            data-testid="product-image-fallback"
            className="flex h-full w-full items-center justify-center text-3xl"
            aria-hidden="true"
          >
            🌿
          </div>
        )}
        {product.totalStock === 0 ? (
          <span className="absolute left-3 top-3 rounded-full bg-[var(--evergreen)] px-2.5 py-1 text-xs font-semibold text-[var(--paper)] shadow-sm">
            Hết hàng
          </span>
        ) : null}
      </div>
      <div className="p-4">
        <p className="truncate font-semibold tracking-tight">{product.name}</p>
        <p className="mt-1 text-base font-bold" style={{ color: "var(--evergreen)" }}>
          {formatVnd(product.basePrice)}
        </p>
      </div>
    </Link>
  );
}
