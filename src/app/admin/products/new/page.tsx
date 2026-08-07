import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { AdminSection } from "@/components/admin/admin-section";
import { ProductForm } from "@/components/admin/product-form";

/**
 * `/admin/products/new` — tạo sản phẩm mới (Server Component).
 * Chốt bảo mật thật ngay tại trang này — không chỉ dựa vào `admin/layout.tsx`.
 */
export default async function NewProductPage() {
  await requireAdmin();

  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight" style={{ color: "var(--evergreen)" }}>
          Thêm sản phẩm
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          Điền thông tin sản phẩm, biến thể và ảnh minh hoạ.
        </p>
      </div>
      <AdminSection>
        <ProductForm mode="create" categories={categories} />
      </AdminSection>
    </div>
  );
}
