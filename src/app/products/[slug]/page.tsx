import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
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
    <main className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-neutral-600">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link href="/" className="hover:underline">
              Trang chủ
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href="/products" className="hover:underline">
              Sản phẩm
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="font-medium text-[var(--ink)]">
            {product.name}
          </li>
        </ol>
      </nav>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:gap-12">
        <div>
          <div
            className="relative aspect-square w-full overflow-hidden rounded-2xl"
            style={{ backgroundColor: "var(--sage)" }}
          >
            {mainImage ? (
              <Image
                src={mainImage.url}
                alt={product.name}
                fill
                sizes="(max-width: 1023px) 100vw, 54vw"
                unoptimized={mainImage.url.startsWith("/api/uploads/")}
                className="object-cover"
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
            <div className="mt-4 grid grid-cols-4 gap-3">
              {thumbnails.map((image) => (
                <div
                  key={image.id}
                  className="relative aspect-square overflow-hidden rounded-lg"
                  style={{ backgroundColor: "var(--sage)" }}
                >
                  <Image
                    src={image.url}
                    alt=""
                    fill
                    sizes="(max-width: 639px) 25vw, (max-width: 1023px) 20vw, 14vw"
                    unoptimized={image.url.startsWith("/api/uploads/")}
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="h-fit rounded-2xl border bg-[var(--paper)] p-5 shadow-sm sm:p-7" style={{ borderColor: "var(--line)" }}>
          <p className="text-sm font-semibold tracking-[0.12em] uppercase" style={{ color: "var(--accent)" }}>
            {product.category.name}
          </p>
          <h1
            className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl"
            style={{ color: "var(--evergreen)" }}
          >
            {product.name}
          </h1>
          <p className="mt-4 text-xl font-bold">{formatVnd(product.basePrice)}</p>

          {product.description && (
            <p className="mt-4 whitespace-pre-line text-neutral-700">
              {product.description}
            </p>
          )}

          <VariantSelector
            variants={product.variants}
            basePrice={product.basePrice}
            productId={product.id}
            slug={product.slug}
            name={product.name}
            imageUrl={product.images[0]?.url ?? null}
          />

          <ul className="mt-8 space-y-3 border-t pt-6 text-sm" style={{ borderColor: "var(--line)" }}>
            <li className="flex gap-3"><span aria-hidden="true">✓</span><span><strong>Thanh toán VietQR</strong><br />Xác nhận chuyển khoản nhanh chóng.</span></li>
            <li className="flex gap-3"><span aria-hidden="true">✓</span><span><strong>Giao hàng toàn quốc</strong><br />Cửa hàng sẽ liên hệ để xác nhận đơn.</span></li>
            <li className="flex gap-3"><span aria-hidden="true">✓</span><span><strong>Hỗ trợ qua Zalo</strong><br />Liên hệ cửa hàng khi cần tư vấn hoặc đổi trả.</span></li>
          </ul>
        </div>
      </div>
    </main>
  );
}
