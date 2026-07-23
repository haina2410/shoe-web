import { roles } from "@/lib/permissions";

/** Các role hợp lệ, lấy trực tiếp từ `permissions.ts` (single source of truth). */
export type AppRole = keyof typeof roles; // "owner" | "staff"

/** Tài nguyên hỗ trợ kiểm tra quyền. */
export type Resource = "product" | "order";

/**
 * Kiểu request mà `Role.authorize()` của better-auth chấp nhận.
 * Owner và staff đều được tạo từ cùng `ac` (statement chung), nên `authorize`
 * của cả hai có cùng shape request — lấy từ `owner` làm tham chiếu chung.
 */
type AuthorizeRequest = Parameters<(typeof roles)["owner"]["authorize"]>[0];

/** True nếu `role` là một trong các role quản trị đã biết (owner/staff). */
export function isAdminRole(
  role: string | null | undefined,
): role is AppRole {
  return role === "owner" || role === "staff";
}

/**
 * Kiểm tra thuần (pure, không I/O) xem `role` có được phép thực hiện
 * `action` trên `resource` hay không. Quyền được suy ra từ `roles` trong
 * `src/lib/permissions.ts` — không hard-code bảng quyền riêng ở đây.
 */
export function can(
  role: string | null | undefined,
  resource: Resource,
  action: string,
): boolean {
  if (!isAdminRole(role)) return false;

  const request = { [resource]: [action] } as AuthorizeRequest;
  const result = roles[role].authorize(request);
  return result.success === true;
}
