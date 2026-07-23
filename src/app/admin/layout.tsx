import { requireAdmin } from "@/lib/auth-guard";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin(); // chốt bảo mật thật: session thật + role (owner/staff)
  return <section className="mx-auto max-w-6xl px-4 py-10">{children}</section>;
}
