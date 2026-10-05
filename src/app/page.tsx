import Link from "next/link";
import { CategoryPaths } from "@/components/home/category-paths";
import { CompanyGallery } from "@/components/home/company-gallery";
import { HeroBanner } from "@/components/home/hero-banner";
import { TrustStrip } from "@/components/home/trust-strip";
import { EmptyState } from "@/components/empty-state";
import { prisma } from "@/lib/prisma";
import { listProducts } from "@/server/queries/catalog";
import { ProductCard } from "@/components/product-card";

// Prisma queries alone do not prevent this route from being prerendered.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [products, setting] = await Promise.all([
    listProducts(prisma, {}),
    prisma.storefrontSetting.findUnique({
      where: { id: 1 },
      select: { heroProductId: true },
    }),
  ]);
  const featured = products.slice(0, 6);
  const heroProduct =
    products.find(
      (product) =>
        product.id === setting?.heroProductId && product.imageUrl !== null,
    ) ??
    products.find((product) => product.imageUrl) ??
    products[0] ??
    null;

  return (
    <>
      <HeroBanner product={heroProduct} />
      <CategoryPaths />
      <section
        data-testid="home-section"
        data-section="featured"
        className="mx-auto max-w-6xl px-4 pb-12 sm:pb-16"
      >
        <div className="flex items-center justify-between">
          <h2
            className="text-2xl font-bold"
            style={{ color: "var(--evergreen)" }}
          >
            Sản phẩm nổi bật
          </h2>
          <Link
            href="/products"
            className="text-sm font-medium"
            style={{ color: "var(--evergreen)" }}
          >
            Xem tất cả
          </Link>
        </div>

        {featured.length === 0 ? (
          <EmptyState
            title="Chưa có sản phẩm"
            description="Cửa hàng đang cập nhật sản phẩm mới."
            action={{ href: "/products", label: "Xem danh mục" }}
          />
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {featured.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>
      <CompanyGallery />
      <TrustStrip />
    </>
  );
}
