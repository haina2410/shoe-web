import Link from "next/link";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { formatVnd } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { DeleteProductButton } from "@/components/admin/delete-product-button";

/**
 * `/admin/products` — danh sách sản phẩm (Server Component, render `<table>`).
 *
 * Theo `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`
 * (Next 16): `searchParams` là một Promise, phải `await` mới đọc được giá trị
 * — khác với Next cũ (prop đồng bộ). Việc dùng `searchParams` cũng khiến route
 * này opt vào dynamic rendering tại request time (hợp lý vì đã có `requireAdmin`).
 */

type SortKey = "name" | "createdAt";

function parseSort(value: string | string[] | undefined): SortKey {
  return value === "name" ? "name" : "createdAt";
}

/** Nhãn trạng thái sản phẩm hiển thị tiếng Việt. */
const statusLabel: Record<string, string> = {
  DRAFT: "Nháp",
  ACTIVE: "Đang bán",
  ARCHIVED: "Đã ẩn",
};

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  // Chốt bảo mật thật ở chính trang này — không chỉ dựa vào `admin/layout.tsx`.
  await requireAdmin();

  const { sort: sortParam } = await searchParams;
  const sort = parseSort(sortParam);

  const products = await prisma.product.findMany({
    orderBy: sort === "name" ? { name: "asc" } : { createdAt: "desc" },
    include: {
      category: true,
      variants: true,
      images: { orderBy: { position: "asc" }, take: 1 },
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--evergreen)" }}>
            Sản phẩm
          </h1>
          <p className="mt-1 text-sm text-neutral-600">
            Quản lý danh sách sản phẩm, tồn kho và trạng thái bán hàng.
          </p>
        </div>
        <Button render={<Link href="/admin/products/new" />}>Thêm sản phẩm</Button>
      </div>

      <div className="mt-4 flex items-center gap-3 text-sm">
        <span className="text-neutral-600">Sắp xếp:</span>
        <Link
          href="/admin/products?sort=createdAt"
          className="underline-offset-2 hover:underline"
          style={{
            color: sort === "createdAt" ? "var(--evergreen)" : "var(--muted-foreground)",
            fontWeight: sort === "createdAt" ? 600 : 400,
          }}
        >
          Mới nhất
        </Link>
        <Link
          href="/admin/products?sort=name"
          className="underline-offset-2 hover:underline"
          style={{
            color: sort === "name" ? "var(--evergreen)" : "var(--muted-foreground)",
            fontWeight: sort === "name" ? 600 : 400,
          }}
        >
          Tên (A-Z)
        </Link>
      </div>

      {products.length === 0 ? (
        <div
          className="mt-8 rounded-lg border border-dashed p-10 text-center"
          style={{ borderColor: "var(--line)" }}
        >
          <p className="text-neutral-600">
            Chưa có sản phẩm nào. Bấm &quot;Thêm sản phẩm&quot; để tạo sản phẩm đầu tiên.
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border" style={{ borderColor: "var(--line)" }}>
          <table className="w-full min-w-max text-left text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--line)" }}>
                <th className="px-4 py-3 font-medium">
                  <Link
                    href={`/admin/products?sort=name`}
                    className="hover:underline"
                    title="Sắp xếp theo tên"
                  >
                    Tên
                  </Link>
                </th>
                <th className="px-4 py-3 font-medium">Danh mục</th>
                <th className="px-4 py-3 font-medium">Giá</th>
                <th className="px-4 py-3 font-medium">Trạng thái</th>
                <th className="px-4 py-3 font-medium">Tổng tồn</th>
                <th className="px-4 py-3 font-medium">Số biến thể</th>
                <th className="px-4 py-3 font-medium">
                  <span className="sr-only">Hành động</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const totalStock = product.variants.reduce((sum, v) => sum + v.stock, 0);
                return (
                  <tr key={product.id} className="border-b last:border-0" style={{ borderColor: "var(--line)" }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {product.images[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={product.images[0].url}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded-md object-cover"
                            style={{ backgroundColor: "var(--sage)" }}
                          />
                        ) : (
                          <div
                            className="h-10 w-10 shrink-0 rounded-md"
                            style={{ backgroundColor: "var(--sage)" }}
                          />
                        )}
                        <span className="font-medium">{product.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-neutral-600">{product.category.name}</td>
                    <td className="px-4 py-3">{formatVnd(product.basePrice)}</td>
                    <td className="px-4 py-3">
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: "var(--sage)",
                          color: "var(--evergreen)",
                        }}
                      >
                        {statusLabel[product.status] ?? product.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">{totalStock}</td>
                    <td className="px-4 py-3">{product.variants.length}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          render={<Link href={`/admin/products/${product.id}/edit`} />}
                        >
                          Sửa
                        </Button>
                        <DeleteProductButton productId={product.id} productName={product.name} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
