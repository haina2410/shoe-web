import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Redirect LẠC QUAN cho khu /admin: chỉ dựa vào việc có/không có cookie
 * session — KHÔNG phải chốt bảo mật thật (không kiểm tra role ở đây vì
 * Proxy chạy trên mọi request kể cả prefetch, tránh truy vấn DB).
 * Chốt bảo mật thật nằm ở `requireAdmin()` trong server layout
 * (`src/app/admin/layout.tsx`).
 */
export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) {
    const url = new URL("/login", request.url);
    url.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
