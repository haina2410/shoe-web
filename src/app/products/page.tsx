import { prisma } from "@/lib/prisma";
import { listProducts, getFacets, listCategories } from "@/server/queries/catalog";
import type { CatalogQuery, CatalogSort } from "@/lib/catalog-filters";
import { Filters } from "@/components/filters";
import { ProductCard } from "@/components/product-card";
import { EmptyState } from "@/components/empty-state";

/**
 * `/products` — trang danh sách sản phẩm storefront (lưới + bộ lọc).
 *
 * Theo `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`
 * (Next 16): `searchParams` là một Promise (`{ [key]: string | string[] | undefined }`),
 * phải `await` mới đọc được — và việc đọc nó khiến route này opt vào dynamic
 * rendering tại request time (hợp lý vì kết quả phụ thuộc bộ lọc trên URL).
 */

type RawSearchParams = { [key: string]: string | string[] | undefined };

const VALID_SORTS: CatalogSort[] = ["moi-nhat", "gia-tang", "gia-giam"];

function toArray(value: string | string[] | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value : [value];
}

function firstString(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

function parseSort(value: string | string[] | undefined): CatalogSort | undefined {
  const v = firstString(value);
  return (VALID_SORTS as string[]).includes(v ?? "") ? (v as CatalogSort) : undefined;
}

function parseQuery(raw: RawSearchParams): CatalogQuery {
  return {
    categorySlug: firstString(raw.categorySlug),
    sizes: toArray(raw.sizes),
    colors: toArray(raw.colors),
    priceKeys: toArray(raw.priceKeys),
    q: firstString(raw.q),
    sort: parseSort(raw.sort),
  };
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const raw = await searchParams;
  const query = parseQuery(raw);

  const [products, facets, categories] = await Promise.all([
    listProducts(prisma, query),
    getFacets(prisma),
    listCategories(prisma),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <p className="text-sm font-semibold tracking-[0.18em] uppercase" style={{ color: "var(--accent)" }}>
        Leafshoes
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl" style={{ color: "var(--evergreen)" }}>
        Sản phẩm
      </h1>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-[240px_1fr]">
        <Filters categories={categories} facets={facets} query={query} />

        {products.length === 0 ? (
          <EmptyState
            title="Không tìm thấy sản phẩm"
            description="Hãy thử thay đổi bộ lọc hoặc xem toàn bộ danh mục."
            action={{ href: "/products", label: "Xem tất cả sản phẩm" }}
          />
        ) : (
          <div className="grid self-start grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
