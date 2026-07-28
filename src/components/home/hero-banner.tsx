import Image from "next/image";
import Link from "next/link";
import { HERO_IMAGE_PATH } from "@/lib/storefront-assets";

export function HeroBanner(): React.JSX.Element {
  return (
    <section
      data-testid="home-section"
      data-section="hero"
      className="border-b"
      style={{ borderColor: "var(--line)" }}
    >
      <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 sm:py-14 lg:grid-cols-2 lg:gap-12 lg:py-16">
        <div className="max-w-xl">
          <p className="text-sm font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
            leafshoes Việt Nam
          </p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-[var(--evergreen)] sm:text-5xl">
            Bước êm cùng leafshoes
          </h1>
          <p className="mt-4 max-w-md text-base leading-7 text-neutral-600 sm:text-lg">
            Thiết kế cho nhịp sống mỗi ngày.
          </p>
          <Link
            href="/products"
            className="mt-7 inline-flex rounded-full bg-[var(--evergreen)] px-5 py-3 text-sm font-bold text-[var(--paper)] transition-colors hover:bg-[var(--accent)]"
          >
            Khám phá sản phẩm
          </Link>
        </div>
        <div className="overflow-hidden rounded-2xl bg-[var(--sage)] shadow-sm">
          <Image
            src={HERO_IMAGE_PATH}
            alt="Giày leafshoes cho nhịp sống mỗi ngày"
            width={1672}
            height={941}
            priority
            sizes="(max-width: 1023px) calc(100vw - 2rem), 576px"
            className="h-auto w-full object-cover"
          />
        </div>
      </div>
    </section>
  );
}
