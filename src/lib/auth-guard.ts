import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/lib/rbac";

/**
 * Chốt bảo mật THẬT cho khu /admin (khác với redirect lạc quan ở `proxy.ts`).
 * Đọc session thật từ DB qua Better Auth, không chỉ dựa vào cookie.
 * - Không có session → redirect `/login`.
 * - Có session nhưng role không phải owner/staff → redirect `/` (đã đăng
 *   nhập nhưng không đủ quyền vào khu quản trị).
 */
export async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  if (!isAdminRole(session.user.role)) {
    redirect("/");
  }

  return session;
}
