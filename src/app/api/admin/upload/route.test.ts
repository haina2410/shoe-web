// @vitest-environment node
//
// Route Handler này đọc `request.formData()` với 1 `File` thật bên trong.
// jsdom (môi trường mặc định của dự án, xem vitest.config.ts) polyfill
// Request/FormData/File không đầy đủ và bị TREO khi đọc stream của File —
// ép môi trường Node thật cho file test này để khớp với runtime thật của
// route handler.
import { describe, it, expect, vi, beforeEach } from "vitest";

// `vi.mock` bị hoist lên đầu file — mọi biến mock được factory tham chiếu
// phải khai báo qua `vi.hoisted`.
const { getSessionMock, saveProductImageMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  saveProductImageMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: getSessionMock } },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock("@/lib/upload", () => ({
  saveProductImage: saveProductImageMock,
}));

import { POST } from "@/app/api/admin/upload/route";

function sessionWithRole(role: string) {
  return {
    user: { id: "u1", email: "u1@test.local", role },
    session: { id: "s1" },
  };
}

function requestWithFile(file: File | null): Request {
  const form = new FormData();
  if (file) form.set("file", file);
  return new Request("http://localhost/api/admin/upload", {
    method: "POST",
    body: form,
  });
}

describe("POST /api/admin/upload — authz", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("chưa đăng nhập (không có session) → 401, KHÔNG gọi saveProductImage", async () => {
    getSessionMock.mockResolvedValue(null);

    const res = await POST(
      requestWithFile(new File([new Uint8Array(4)], "a.png", { type: "image/png" })),
    );

    expect(res.status).toBe(401);
    expect(saveProductImageMock).not.toHaveBeenCalled();
  });

  it("role staff (chỉ product:read) → 403, KHÔNG gọi saveProductImage", async () => {
    getSessionMock.mockResolvedValue(sessionWithRole("staff"));

    const res = await POST(
      requestWithFile(new File([new Uint8Array(4)], "a.png", { type: "image/png" })),
    );

    expect(res.status).toBe(403);
    expect(saveProductImageMock).not.toHaveBeenCalled();
  });

  it("role owner + file hợp lệ → 200, gọi saveProductImage, trả url", async () => {
    getSessionMock.mockResolvedValue(sessionWithRole("owner"));
    saveProductImageMock.mockResolvedValue({
      url: "/api/uploads/products/fake-uuid.png",
    });

    const res = await POST(
      requestWithFile(new File([new Uint8Array(4)], "a.png", { type: "image/png" })),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ url: "/api/uploads/products/fake-uuid.png" });
    expect(saveProductImageMock).toHaveBeenCalledTimes(1);
  });

  it("role owner nhưng thiếu file → 400, KHÔNG gọi saveProductImage", async () => {
    getSessionMock.mockResolvedValue(sessionWithRole("owner"));

    const res = await POST(requestWithFile(null));

    expect(res.status).toBe(400);
    expect(saveProductImageMock).not.toHaveBeenCalled();
  });

  it("role owner, saveProductImage ném lỗi validation → 400 với message lỗi", async () => {
    getSessionMock.mockResolvedValue(sessionWithRole("owner"));
    saveProductImageMock.mockRejectedValue(new Error("Loại file không hợp lệ"));

    const res = await POST(
      requestWithFile(new File([new Uint8Array(4)], "a.txt", { type: "text/plain" })),
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("không hợp lệ");
  });
});
