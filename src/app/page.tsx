import Link from "next/link";
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
      <section className="mx-auto max-w-6xl px-4 py-20">
        <h1
          className="text-4xl font-extrabold tracking-tight"
          style={{ color: "var(--evergreen)" }}
        >
          Bước êm cùng leafshoes
        </h1>
        <p className="mt-4 text-neutral-600">Giày chính hãng, giao nhanh toàn quốc.</p>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20">
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
          <p className="mt-6 text-neutral-600">Chưa có sản phẩm nào.</p>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {featured.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
