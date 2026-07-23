import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
// LƯU Ý: docs Next 16 (proxy.md) viết là `unstable_doesProxyMatch`, nhưng
// package cài đặt (next@16.2.11) mới chỉ export `unstable_doesMiddlewareMatch`
// (đã verify bằng grep node_modules/next/dist/experimental/testing/server) —
// dùng tên export thật, không dùng tên trong docs.
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { proxy, config } from "@/proxy";

describe("proxy admin guard", () => {
  it("không có session cookie → redirect khỏi /admin sang /login", async () => {
    const req = new NextRequest("http://localhost/admin");
    const res = await proxy(req);
    expect(res?.status).toBe(307); // redirect
    expect(res?.headers.get("location")).toContain("/login");
  });

  it("giữ lại pathname gốc trong query ?redirect= để quay lại sau đăng nhập", async () => {
    const req = new NextRequest("http://localhost/admin/products");
    const res = await proxy(req);
    const location = new URL(res!.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("redirect")).toBe("/admin/products");
  });

  it("matcher trúng /admin/:path* nhưng không trúng trang chủ /", () => {
    expect(
      unstable_doesMiddlewareMatch({ config, url: "/admin" }),
    ).toBe(true);
    expect(
      unstable_doesMiddlewareMatch({ config, url: "/admin/products" }),
    ).toBe(true);
    expect(unstable_doesMiddlewareMatch({ config, url: "/" })).toBe(false);
  });
});
