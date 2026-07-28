import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { CATEGORY_PATHS } from "@/lib/storefront-content";

export function CategoryPaths(): React.JSX.Element {
  return (
    <section
      data-testid="home-section"
      data-section="categories"
      aria-labelledby="category-paths-heading"
      className="mx-auto max-w-6xl px-4 py-12 sm:py-16"
    >
      <div className="max-w-2xl">
        <p className="text-sm font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          Danh mục
        </p>
        <h2 id="category-paths-heading" className="mt-2 text-2xl font-bold text-[var(--evergreen)] sm:text-3xl">
          Chọn đôi giày phù hợp với bạn
        </h2>
      </div>
      <div className="mt-7 grid gap-3 sm:grid-cols-3">
        {CATEGORY_PATHS.map((category) => (
          <Link
            key={category.href}
            href={category.href}
            className="group flex min-h-28 items-center justify-between rounded-xl border bg-white p-5 text-lg font-bold text-[var(--evergreen)] shadow-sm transition-colors hover:border-[var(--accent)] hover:bg-[var(--sage)]"
            style={{ borderColor: "var(--line)" }}
          >
            {category.label}
            <ArrowUpRight aria-hidden="true" className="size-5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </section>
  );
}
