"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  PRICE_RANGES,
  type CatalogQuery,
  type CatalogSort,
} from "@/lib/catalog-filters";

/**
 * `Filters` — bộ lọc client-side cho trang `/products`.
 *
 * `query` (đã parse từ URL bởi Server Component cha) là NGUỒN SỰ THẬT cho các
 * lựa chọn hiện tại — mỗi lần đổi 1 filter, component build lại toàn bộ query
 * string (dựa trên `query` + thay đổi vừa xảy ra) rồi `router.push`. Next.js
 * re-render `/products/page.tsx` với `searchParams` mới → prop `query` mới →
 * UI luôn khớp URL (controlled qua URL, không giữ state rời).
 *
 * Các param không nằm trong `CatalogQuery` (nếu có, tương lai) được giữ
 * nguyên nhờ dùng `useSearchParams()` làm nền trước khi ghi đè các key đã biết.
 */

type Category = { id: string; name: string; slug: string };
type Facets = { sizes: string[]; colors: string[] };

const SORT_OPTIONS: { value: CatalogSort; label: string }[] = [
  { value: "moi-nhat", label: "Mới nhất" },
  { value: "gia-tang", label: "Giá tăng dần" },
  { value: "gia-giam", label: "Giá giảm dần" },
];

export function Filters({
  categories,
  facets,
  query,
}: {
  categories: Category[];
  facets: Facets;
  query: CatalogQuery;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchValue, setSearchValue] = useState(query.q ?? "");

  function pushQuery(next: CatalogQuery) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("categorySlug");
    params.delete("sizes");
    params.delete("colors");
    params.delete("priceKeys");
    params.delete("q");
    params.delete("sort");

    if (next.categorySlug) params.set("categorySlug", next.categorySlug);
    for (const size of next.sizes ?? []) params.append("sizes", size);
    for (const color of next.colors ?? []) params.append("colors", color);
    for (const key of next.priceKeys ?? []) params.append("priceKeys", key);
    if (next.q && next.q.trim()) params.set("q", next.q.trim());
    if (next.sort) params.set("sort", next.sort);

    router.push(`${pathname}?${params.toString()}`);
  }

  function toggleInList(list: string[] | undefined, value: string): string[] {
    const current = list ?? [];
    return current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
  }

  return (
    <aside
      aria-label="Bộ lọc sản phẩm"
      className="h-fit space-y-6 rounded-xl border bg-[var(--paper)] p-4 text-sm shadow-sm md:sticky md:top-24"
      style={{ borderColor: "var(--line)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold" style={{ color: "var(--evergreen)" }}>
          Bộ lọc
        </h2>
        <Link
          href="/products"
          className="text-xs font-semibold underline underline-offset-4"
          style={{ color: "var(--evergreen)" }}
        >
          Xoá bộ lọc
        </Link>
      </div>
      <div>
        <label htmlFor="category-select" className="mb-1 block font-medium">
          Danh mục
        </label>
        <select
          id="category-select"
          className="min-h-10 w-full rounded-md border px-3 py-2"
          style={{ borderColor: "var(--line)" }}
          value={query.categorySlug ?? ""}
          onChange={(e) =>
            pushQuery({ ...query, categorySlug: e.target.value || undefined })
          }
        >
          <option value="">Tất cả danh mục</option>
          {categories.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <p className="mb-1 font-medium">Kích cỡ</p>
        <div className="flex flex-wrap gap-2">
          {facets.sizes.map((size) => (
            <label key={size} className="flex min-h-9 items-center gap-2 rounded-md px-1">
              <input
                type="checkbox"
                checked={(query.sizes ?? []).includes(size)}
                onChange={() =>
                  pushQuery({ ...query, sizes: toggleInList(query.sizes, size) })
                }
              />
              {size}
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 font-medium">Màu sắc</p>
        <div className="flex flex-wrap gap-2">
          {facets.colors.map((color) => (
            <label key={color} className="flex min-h-9 items-center gap-2 rounded-md px-1">
              <input
                type="checkbox"
                checked={(query.colors ?? []).includes(color)}
                onChange={() =>
                  pushQuery({ ...query, colors: toggleInList(query.colors, color) })
                }
              />
              {color}
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 font-medium">Khoảng giá</p>
        <div className="flex flex-col gap-1">
          {PRICE_RANGES.map((range) => (
            <label key={range.key} className="flex min-h-9 items-center gap-2 rounded-md px-1">
              <input
                type="checkbox"
                checked={(query.priceKeys ?? []).includes(range.key)}
                onChange={() =>
                  pushQuery({
                    ...query,
                    priceKeys: toggleInList(query.priceKeys, range.key),
                  })
                }
              />
              {range.label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="search-input" className="mb-1 block font-medium">
          Tìm kiếm
        </label>
        <input
          id="search-input"
          type="search"
          placeholder="Tên sản phẩm..."
          className="min-h-10 w-full rounded-md border px-3 py-2"
          style={{ borderColor: "var(--line)" }}
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              pushQuery({ ...query, q: searchValue });
            }
          }}
        />
      </div>

      <div>
        <label htmlFor="sort-select" className="mb-1 block font-medium">
          Sắp xếp
        </label>
        <select
          id="sort-select"
          className="min-h-10 w-full rounded-md border px-3 py-2"
          style={{ borderColor: "var(--line)" }}
          value={query.sort ?? "moi-nhat"}
          onChange={(e) =>
            pushQuery({ ...query, sort: e.target.value as CatalogSort })
          }
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </aside>
  );
}
