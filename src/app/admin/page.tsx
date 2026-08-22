import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminSection } from "@/components/admin/admin-section";

export default function AdminDashboardPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Vận hành cửa hàng"
        description="Truy cập nhanh các công việc hiện có: quản lý sản phẩm, danh mục, đơn hàng và đối soát giao dịch ngân hàng."
      />

      <AdminSection>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/admin/products"
          className="block rounded-lg border p-4 transition-colors hover:bg-[var(--sage)]/40 focus-visible:bg-[var(--sage)]/40"
          style={{ borderColor: "var(--line)" }}
        >
          <h2 className="font-semibold" style={{ color: "var(--evergreen)" }}>
            Quản lý sản phẩm
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            Xem, thêm, sửa, xoá sản phẩm và cập nhật tồn kho.
          </p>
        </Link>
        <Link
          href="/admin/categories"
          className="block rounded-lg border p-4 transition-colors hover:bg-[var(--sage)]/40 focus-visible:bg-[var(--sage)]/40"
          style={{ borderColor: "var(--line)" }}
        >
          <h2 className="font-semibold" style={{ color: "var(--evergreen)" }}>
            Quản lý danh mục
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            Xem sản phẩm theo danh mục và quản lý danh mục phẳng.
          </p>
        </Link>
        <Link
          href="/admin/orders"
          className="block rounded-lg border p-4 transition-colors hover:bg-[var(--sage)]/40 focus-visible:bg-[var(--sage)]/40"
          style={{ borderColor: "var(--line)" }}
        >
          <h2 className="font-semibold" style={{ color: "var(--evergreen)" }}>
            Quản lý đơn hàng
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            Theo dõi đơn hàng, thanh toán và hoàn tiền.
          </p>
        </Link>
        <Link
          href="/admin/bank-transactions/review"
          className="block rounded-lg border p-4 transition-colors hover:bg-[var(--sage)]/40 focus-visible:bg-[var(--sage)]/40"
          style={{ borderColor: "var(--line)" }}
        >
          <h2 className="font-semibold" style={{ color: "var(--evergreen)" }}>
            Duyệt giao dịch ngân hàng
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            Kiểm tra các giao dịch cần ghép thủ công.
          </p>
        </Link>
        </div>
      </AdminSection>
    </div>
  );
}
