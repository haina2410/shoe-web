import { notFound } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminSection } from "@/components/admin/admin-section";
import { CategoryForm } from "@/components/admin/category-form";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";

export default async function EditCategoryPage(_props: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await _props.params;
  const category = await prisma.category.findUnique({ where: { id } });

  if (!category) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Đổi tên không làm thay đổi slug hiện tại."
        title="Sửa danh mục"
      />
      <AdminSection>
        <p className="mb-5 text-sm text-neutral-600">
          Đường dẫn: /products?categorySlug={category.slug}
        </p>
        <CategoryForm
          categoryId={category.id}
          initialName={category.name}
          mode="edit"
        />
      </AdminSection>
    </div>
  );
}
