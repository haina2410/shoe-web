import Link from "next/link";
import { CategoryPaths } from "@/components/home/category-paths";
import { CompanyGallery } from "@/components/home/company-gallery";
import { HeroBanner } from "@/components/home/hero-banner";
import { TrustStrip } from "@/components/home/trust-strip";
import { EmptyState } from "@/components/empty-state";
import { prisma } from "@/lib/prisma";
import { listProducts } from "@/server/queries/catalog";
import { ProductCard } from "@/components/product-card";

/**
 * `/` — trang chủ storefront.
 *
 * Task 5 (Ngày 4): giữ nguyên hero (h1 chứa "leafshoes" — `e2e/home.spec.ts`
 * phụ thuộc vào điều này) và thêm khối "sản phẩm nổi bật" ngay bên dưới, lấy
 * tối đa 6 sản phẩm ACTIVE theo sort mặc định (`listProducts(prisma, {})` —
 * mới nhất trước) qua `<ProductCard>` (Task 3). Trang trở thành async Server
 * Component vì giờ có gọi DB tại request time.
 *
 * `export const dynamic = "force-dynamic"` là bắt buộc: theo
 * `node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md`
 * (dự án KHÔNG bật `cacheComponents`), một truy vấn Prisma thuần (không phải
 * `fetch`) KHÔNG tự khiến route dynamic — nếu không có cờ này, Next 16 sẽ
 * prerender trang chủ tại build time và "đóng băng" danh sách sản phẩm nổi
 * bật (sản phẩm admin tạo/xoá sau sẽ không bao giờ xuất hiện cho tới lần
 * build kế tiếp).
 */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const products = await listProducts(prisma, {});
  const featured = products.slice(0, 6);

  return (
    <>
      <HeroBanner />
      <CategoryPaths />
      <section
        data-testid="home-section"
        data-section="featured"
        className="mx-auto max-w-6xl px-4 pb-12 sm:pb-16"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold" style={{ color: "var(--evergreen)" }}>
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
