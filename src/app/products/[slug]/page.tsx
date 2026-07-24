import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getProductBySlug } from "@/server/queries/catalog";
import { formatVnd } from "@/lib/money";
import { VariantSelector } from "@/components/variant-selector";

/**
 * `/products/[slug]` — trang chi tiết sản phẩm storefront.
 *
 * Theo `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md`
 * (Next 16): `params` là một Promise, phải `await` mới đọc được `slug`.
 * `getProductBySlug` trả `null` khi sản phẩm không tồn tại HOẶC không ACTIVE —
 * cả hai trường hợp đều dẫn tới `notFound()` (xem
 * `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/not-found.md`),
 * không phân biệt lý do với người dùng cuối.
 */

type Params = { slug: string };

async function loadProduct(slug: string) {
  return getProductBySlug(prisma, slug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await loadProduct(slug);
  if (!product) return {};
  return { title: `${product.name} — leafshoes` };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const product = await loadProduct(slug);

  if (!product) {
    notFound();
  }

  const [mainImage, ...thumbnails] = product.images;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div>
          <div
            className="aspect-square w-full overflow-hidden rounded-lg"
            style={{ backgroundColor: "var(--sage)" }}
          >
            {mainImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mainImage.url}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div
                data-testid="product-image-fallback"
                className="flex h-full w-full items-center justify-center text-5xl"
                aria-hidden="true"
              >
                🌿
              </div>
            )}
          </div>

          {thumbnails.length > 0 && (
            <div className="mt-3 grid grid-cols-4 gap-2">
              {thumbnails.map((image) => (
                <div
                  key={image.id}
                  className="aspect-square overflow-hidden rounded-md"
                  style={{ backgroundColor: "var(--sage)" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.url}
                    alt={product.name}
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="text-sm text-neutral-500">{product.category.name}</p>
          <h1
            className="mt-1 text-2xl font-bold"
            style={{ color: "var(--evergreen)" }}
          >
            {product.name}
          </h1>
          <p className="mt-2 text-lg font-semibold">
            {formatVnd(product.basePrice)}
          </p>

          {product.description && (
            <p className="mt-4 whitespace-pre-line text-neutral-700">
              {product.description}
            </p>
          )}

          <VariantSelector
            variants={product.variants}
            basePrice={product.basePrice}
          />
        </div>
      </div>
    </div>
  );
}
