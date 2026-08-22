import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminSection } from "@/components/admin/admin-section";
import { CategoryForm } from "@/components/admin/category-form";
import { requireAdmin } from "@/lib/auth-guard";

export default async function NewCategoryPage() {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Tên danh mục sẽ được dùng để tạo đường dẫn storefront duy nhất."
        title="Thêm danh mục"
      />
      <AdminSection>
        <CategoryForm mode="create" />
      </AdminSection>
    </div>
  );
}
