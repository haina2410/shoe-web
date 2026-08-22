import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminSection } from "@/components/admin/admin-section";
import { DeleteCategoryButton } from "@/components/admin/delete-category-button";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";

export default async function AdminCategoriesPage() {
  const session = await requireAdmin();
  const canManage = can(session.user.role, "category", "create");
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: {
      products: {
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      },
    },
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        actions={canManage ? (
          <Button className="h-10 min-h-10" render={<Link href="/admin/categories/new" />}>
            Thêm danh mục
          </Button>
        ) : null}
        description="Quản lý danh mục phẳng và xem các sản phẩm đang thuộc từng danh mục."
        title="Danh mục"
      />

      <AdminSection>
        {categories.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <h2 className="text-lg font-semibold text-[var(--evergreen)]">Chưa có danh mục</h2>
            <p className="mt-2 text-sm text-neutral-600">
              Thêm danh mục đầu tiên để bắt đầu phân loại sản phẩm.
            </p>
          </div>
        ) : (
          <div
            aria-label="Danh sách danh mục"
            className="overflow-x-auto rounded-lg border bg-white"
            role="region"
            style={{ borderColor: "var(--line)" }}
          >
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b bg-neutral-50 text-xs font-semibold tracking-wide text-neutral-700 uppercase">
                  <th className="px-4 py-3.5">Tên</th>
                  <th className="px-4 py-3.5">Slug</th>
                  <th className="px-4 py-3.5">Sản phẩm</th>
                  {canManage ? <th className="px-4 py-3.5"><span className="sr-only">Hành động</span></th> : null}
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr key={category.id} className="border-b align-top last:border-0">
                    <td className="px-4 py-4 font-semibold text-[var(--ink)]">{category.name}</td>
                    <td className="px-4 py-4 font-mono text-neutral-600">{category.slug}</td>
                    <td className="px-4 py-4">
                      {category.products.length === 0 ? (
                        <span className="text-neutral-500">Chưa có sản phẩm</span>
                      ) : (
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold text-neutral-500">
                            {category.products.length} sản phẩm
                          </p>
                          <ul className="space-y-1">
                            {category.products.map((product) => (
                              <li key={product.id}>
                                <Link
                                  className="font-medium text-[var(--evergreen)] underline-offset-2 hover:underline"
                                  href={`/admin/products/${product.id}/edit`}
                                >
                                  {product.name}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </td>
                    {canManage ? (
                      <td className="px-4 py-4">
                        <div className="flex items-start justify-end gap-2">
                          <Button
                            className="h-10 min-h-10"
                            render={<Link aria-label={`Sửa ${category.name}`} href={`/admin/categories/${category.id}/edit`} />}
                            size="sm"
                            variant="outline"
                          >
                            Sửa
                          </Button>
                          <DeleteCategoryButton
                            categoryId={category.id}
                            categoryName={category.name}
                            productCount={category.products.length}
                          />
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminSection>
    </div>
  );
}
