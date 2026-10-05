import Image from "next/image";
import Link from "next/link";
import type { CatalogListItem } from "@/server/queries/catalog";

type HeroProduct = Pick<CatalogListItem, "slug" | "name" | "imageUrl">;

export function HeroBanner({
  product,
}: {
  product: HeroProduct | null;
}): React.JSX.Element {
  const productHref = product ? `/products/${product.slug}` : "/products";

  return (
    <section
      data-testid="home-section"
      data-section="hero"
      className="border-b"
      style={{ borderColor: "var(--line)" }}
    >
      <div
        className={`mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 sm:py-14 lg:gap-12 lg:py-16 ${product ? "lg:grid-cols-2" : ""}`}
      >
        <div className="max-w-xl">
          <p className="text-sm font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
            leafshoes Việt Nam
          </p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-[var(--evergreen)] sm:text-5xl">
            Bước êm cùng leafshoes
          </h1>
          <p className="mt-4 max-w-md text-base leading-7 text-neutral-600 sm:text-lg">
            {product ? product.name : "Thiết kế cho nhịp sống mỗi ngày."}
          </p>
          <Link
            href={productHref}
            className="mt-7 inline-flex rounded-full bg-[var(--evergreen)] px-5 py-3 text-sm font-bold text-[var(--paper)] transition-colors hover:bg-[var(--accent)] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[var(--accent)]"
          >
            {product ? "Xem sản phẩm" : "Khám phá sản phẩm"}
          </Link>
        </div>
        {product ? (
          <Link
            href={productHref}
            className="relative flex aspect-[16/9] items-center justify-center overflow-hidden rounded-2xl bg-[var(--sage)] text-lg font-bold text-[var(--evergreen)] shadow-sm focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[var(--accent)]"
            aria-label={product.imageUrl ? undefined : product.name}
          >
            {product.imageUrl ? (
              <Image
                src={product.imageUrl}
                alt={product.name}
                fill
                priority
                sizes="(max-width: 1023px) calc(100vw - 2rem), 576px"
                unoptimized={product.imageUrl.startsWith("/api/uploads/")}
                className="object-cover"
              />
            ) : (
              <span aria-hidden="true">{product.name}</span>
            )}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
