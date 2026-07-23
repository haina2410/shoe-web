import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { saveProductImage } from "@/lib/upload";

/**
 * `POST /api/admin/upload` — upload ảnh sản phẩm.
 *
 * Route Handler (KHÔNG phải Server Action) vì Server Action giới hạn body
 * 1MB — không đủ cho ảnh. Auth ở đây KHÔNG dùng `requireAdmin()` (nó
 * `redirect()` khi thất bại, không hợp với route handler cần trả JSON
 * 401/403 sạch) — tự lấy session qua `auth.api.getSession` rồi check `can`.
 */
export async function POST(request: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return Response.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  if (!can(session.user.role, "product", "update")) {
    return Response.json({ error: "Không đủ quyền." }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return Response.json(
      { error: "Thiếu file hợp lệ trong trường 'file'." },
      { status: 400 },
    );
  }

  try {
    const result = await saveProductImage(file);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lỗi upload.";
    return Response.json({ error: message }, { status: 400 });
  }
}
