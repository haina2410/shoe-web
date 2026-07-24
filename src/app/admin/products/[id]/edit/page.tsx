import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { ProductForm } from "@/components/admin/product-form";
import { StockQuickEdit } from "@/components/admin/stock-quick-edit";

/**
 * `/admin/products/[id]/edit` — sửa sản phẩm (Server Component).
 *
 * Theo `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`
 * (Next 16): `params` là một Promise, phải `await` mới đọc được `id`.
 *
 * LƯU Ý (đã biết & chấp nhận): `updateProductCore` KHÔNG tính lại `slug` khi
 * đổi tên — URL công khai của sản phẩm giữ nguyên. Trang sửa này không đổi
 * hành vi đó.
 */
export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const [product, categories] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      include: {
        variants: true,
        images: { orderBy: { position: "asc" } },
      },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!product) {
    notFound();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold" style={{ color: "var(--evergreen)" }}>
        Sửa sản phẩm
      </h1>
      <p className="mt-1 text-sm text-neutral-600">{product.name}</p>

      <ProductForm
        mode="edit"
        productId={product.id}
        categories={categories}
        initial={{
          product: {
            name: product.name,
            description: product.description ?? "",
            categoryId: product.categoryId,
            basePrice: product.basePrice,
            status: product.status,
          },
          variants: product.variants.map((v) => ({
            id: v.id,
            size: v.size,
            color: v.color,
            sku: v.sku,
            priceOverride: v.priceOverride,
            stock: v.stock,
          })),
          images: product.images.map((img) => ({ url: img.url, position: img.position })),
        }}
      />

      <section className="mt-10 space-y-3">
        <h2 className="text-lg font-semibold" style={{ color: "var(--evergreen)" }}>
          Chỉnh nhanh tồn kho
        </h2>
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--line)" }}>
          <table className="w-full min-w-max text-left text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--line)" }}>
                <th className="px-3 py-2 font-medium">SKU</th>
                <th className="px-3 py-2 font-medium">Size</th>
                <th className="px-3 py-2 font-medium">Màu</th>
                <th className="px-3 py-2 font-medium">Tồn kho</th>
              </tr>
            </thead>
            <tbody>
              {product.variants.map((v) => (
                <tr key={v.id} className="border-b last:border-0" style={{ borderColor: "var(--line)" }}>
                  <td className="px-3 py-2">{v.sku}</td>
                  <td className="px-3 py-2">{v.size}</td>
                  <td className="px-3 py-2">{v.color}</td>
                  <td className="px-3 py-2">
                    <StockQuickEdit variantId={v.id} initialStock={v.stock} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
