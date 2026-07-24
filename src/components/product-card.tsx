import Link from "next/link";
import { formatVnd } from "@/lib/money";
import type { CatalogListItem } from "@/server/queries/catalog";

/**
 * `ProductCard` — thẻ sản phẩm dùng trong lưới `/products`.
 *
 * Server-safe (không có `"use client"`): chỉ render, không có state/handler.
 * Dùng `<img>` thường (không `next/image`) — khớp quy ước đã dùng ở
 * `src/app/admin/products/page.tsx`; tối ưu ảnh (`next/image`) để dành Ngày 9.
 * Thiếu ảnh (`imageUrl === null`) → fallback khối nền `--sage` + glyph lá,
 * không bao giờ render `<img>` với `src` rỗng/hỏng.
 */
export function ProductCard({ product }: { product: CatalogListItem }) {
  return (
    <Link
      href={`/products/${product.slug}`}
      className="group block overflow-hidden rounded-lg border"
      style={{ borderColor: "var(--line)" }}
    >
      <div className="aspect-square w-full overflow-hidden" style={{ backgroundColor: "var(--sage)" }}>
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt={product.name}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
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
      </div>
      <div className="p-3">
        <p className="truncate text-sm font-medium">{product.name}</p>
        <p className="mt-1 text-sm font-semibold" style={{ color: "var(--evergreen)" }}>
          {formatVnd(product.basePrice)}
        </p>
      </div>
    </Link>
  );
}
