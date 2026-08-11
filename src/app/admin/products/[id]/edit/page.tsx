import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { AdminSection } from "@/components/admin/admin-section";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
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
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: "var(--evergreen)" }}>
            Sửa sản phẩm
          </h1>
          <AdminStatusBadge
            tone={product.status === "ACTIVE" ? "success" : product.status === "ARCHIVED" ? "warning" : "neutral"}
          >
            {product.status === "ACTIVE" ? "Đang bán" : product.status === "ARCHIVED" ? "Đã ẩn" : "Nháp"}
          </AdminStatusBadge>
        </div>
        <p className="mt-1 text-sm text-neutral-600">{product.name}</p>
      </div>

      <AdminSection>
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
      </AdminSection>

      <AdminSection title="Chỉnh nhanh tồn kho" description="Lưu từng biến thể với kiểm tra tồn kho hiện tại.">
        <div className="overflow-x-auto rounded-lg border bg-white" style={{ borderColor: "var(--line)" }}>
          <table className="w-full min-w-max text-left text-sm">
            <thead>
              <tr className="border-b bg-neutral-50 text-xs font-semibold tracking-wide text-neutral-700 uppercase" style={{ borderColor: "var(--line)" }}>
                <th className="px-3 py-3">SKU</th>
                <th className="px-3 py-3">Size</th>
                <th className="px-3 py-3">Màu</th>
                <th className="px-3 py-3">Tồn kho</th>
              </tr>
            </thead>
            <tbody>
              {product.variants.map((v) => (
                <tr key={v.id} className="border-b transition-colors hover:bg-neutral-50 focus-within:bg-neutral-50 last:border-0" style={{ borderColor: "var(--line)" }}>
                  <td className="px-3 py-3 font-medium">{v.sku}</td>
                  <td className="px-3 py-3">{v.size}</td>
                  <td className="px-3 py-3">{v.color}</td>
                  <td className="px-3 py-3">
                    <StockQuickEdit variantId={v.id} initialStock={v.stock} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminSection>
    </div>
  );
}
