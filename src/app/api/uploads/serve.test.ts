// @vitest-environment node
//
// Route Handler thật chạy trong Node, không phải jsdom (môi trường mặc định
// của dự án) — ép Node ở đây để khớp runtime thật và tránh polyfill
// Request/File không đầy đủ của jsdom.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { GET } from "@/app/api/uploads/[...path]/route";

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "leafshoes-serve-"));
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  process.env.UPLOAD_DIR = tmpDir;
});

function paramsFor(segments: string[]) {
  return Promise.resolve({ path: segments });
}

describe("GET /api/uploads/[...path]", () => {
  it("phục vụ file hợp lệ trong UPLOAD_DIR: 200 + đúng Content-Type", async () => {
    const productsDir = path.join(tmpDir, "products");
    await fs.mkdir(productsDir, { recursive: true });
    const filePath = path.join(productsDir, "real-image.png");
    const bytes = new Uint8Array([1, 2, 3, 4]);
    await fs.writeFile(filePath, bytes);

    const res = await GET(new Request("http://localhost/api/uploads/products/real-image.png"), {
      params: paramsFor(["products", "real-image.png"]),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    const body = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(body)).toEqual([1, 2, 3, 4]);
  });

  it("404 khi file không tồn tại", async () => {
    const res = await GET(new Request("http://localhost/api/uploads/products/missing.png"), {
      params: paramsFor(["products", "missing.png"]),
    });

    expect(res.status).toBe(404);
  });

  it("chặn path traversal (../../etc/passwd) — không đọc file ngoài UPLOAD_DIR", async () => {
    // Tạo 1 file "nhạy cảm" NGOÀI UPLOAD_DIR để chứng minh route không đọc được nó.
    const secretDir = await fs.mkdtemp(path.join(os.tmpdir(), "leafshoes-secret-"));
    const secretFile = path.join(secretDir, "passwd");
    await fs.writeFile(secretFile, "root:x:0:0");

    try {
      const traversalSegments = secretFile
        .split(path.sep)
        .filter(Boolean)
        .reduce<string[]>((acc) => acc, []); // placeholder, built below

      // Xây một path traversal tương đối từ UPLOAD_DIR/products tới secretFile.
      const relativeFromProducts = path.relative(
        path.join(tmpDir, "products"),
        secretFile,
      );
      const segments = relativeFromProducts.split(path.sep);

      const res = await GET(
        new Request("http://localhost/api/uploads/" + segments.join("/")),
        { params: paramsFor(segments) },
      );

      expect([403, 404]).toContain(res.status);
      const text = await res.text();
      expect(text).not.toContain("root:x:0:0");
      void traversalSegments;
    } finally {
      await fs.rm(secretDir, { recursive: true, force: true });
    }
  });

  it("chặn traversal đơn giản dạng ['..','..','etc','passwd']", async () => {
    const res = await GET(
      new Request("http://localhost/api/uploads/..%2F..%2Fetc%2Fpasswd"),
      { params: paramsFor(["..", "..", "etc", "passwd"]) },
    );

    expect([403, 404]).toContain(res.status);
  });
});
