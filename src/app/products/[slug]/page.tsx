import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getProductBySlug } from "@/server/queries/catalog";
import { ProductDetailExperience } from "@/components/product-detail-experience";

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

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
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

      <ProductDetailExperience
        product={{
          id: product.id,
          slug: product.slug,
          name: product.name,
          description: product.description,
          categoryName: product.category.name,
          basePrice: product.basePrice,
          variants: product.variants,
          imageSets: product.imageSets,
        }}
      />
    </div>
  );
}
