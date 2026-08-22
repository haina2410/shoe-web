import Image from "next/image";
import Link from "next/link";
import { formatVnd } from "@/lib/money";
import type { CatalogListItem } from "@/server/queries/catalog";

export function ProductCard({ product }: { product: CatalogListItem }) {
  const visiblePreviews = product.imagePreviews.slice(0, 4);

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group block self-start overflow-hidden rounded-xl border bg-[var(--paper)] transition-shadow motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-lg focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[var(--accent)]"
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
        <p className="line-clamp-2 min-h-12 font-semibold leading-6 tracking-tight">{product.name}</p>
        <p className="mt-1 text-base font-bold" style={{ color: "var(--evergreen)" }}>
          {formatVnd(product.basePrice)}
        </p>
        {visiblePreviews.length > 0 ? (
          <div className="mt-3 flex items-center gap-2" aria-label={`${product.colors.length} màu`}>
            {visiblePreviews.map((preview) => (
              <span
                key={`${preview.color}-${preview.url}`}
                className="relative size-10 overflow-hidden rounded-md border bg-[var(--sage)]"
                title={preview.color}
              >
                <Image
                  src={preview.url}
                  alt=""
                  fill
                  sizes="40px"
                  unoptimized={preview.url.startsWith("/api/uploads/")}
                  className="object-cover"
                />
              </span>
            ))}
            {product.imagePreviews.length > visiblePreviews.length ? (
              <span className="text-xs font-medium text-neutral-600">
                +{product.imagePreviews.length - visiblePreviews.length}
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-neutral-600">
          <span>{product.colors.length} màu</span>
          <span>{product.sizes.length > 0 ? `Size ${product.sizes.join(", ")}` : "Chưa có size"}</span>
        </div>
      </div>
    </Link>
  );
}
