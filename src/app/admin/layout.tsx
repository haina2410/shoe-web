import { requireAdmin } from "@/lib/auth-guard";
import { AdminNav } from "@/components/admin/admin-nav";
import { AdminToastProvider } from "@/components/admin/admin-toast-provider";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
      <div
        className="overflow-hidden rounded-xl border bg-white/80 shadow-sm"
        style={{ borderColor: "var(--line)" }}
      >
        <div className="border-b px-4 py-3 sm:px-6" style={{ borderColor: "var(--line)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--evergreen)" }}>
            Quản trị leafshoes
          </p>
          <AdminNav />
        </div>
        <AdminToastProvider scope="admin">
          <div className="px-4 py-6 sm:px-6 sm:py-8">{children}</div>
        </AdminToastProvider>
      </div>
    </section>
  );
}
