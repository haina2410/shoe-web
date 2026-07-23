import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

// `saveProductImage` đọc `process.env.UPLOAD_DIR` / `MAX_UPLOAD_BYTES` mỗi lần
// gọi (không cache ở module scope) nên có thể set env trước mỗi test.
import { saveProductImage } from "@/lib/upload";

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "leafshoes-upload-"));
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  process.env.UPLOAD_DIR = tmpDir;
  delete process.env.MAX_UPLOAD_BYTES;
});

function makeFile(
  bytes: number,
  type: string,
  name = "photo.png",
): File {
  const buffer = new Uint8Array(bytes).fill(1);
  return new File([buffer], name, { type });
}

describe("saveProductImage()", () => {
  it("chấp nhận PNG hợp lệ: ghi file thật vào UPLOAD_DIR/products và trả url đúng pattern", async () => {
    const file = makeFile(1024, "image/png", "anything.png");

    const { url } = await saveProductImage(file);

    expect(url).toMatch(
      /^\/api\/uploads\/products\/[0-9a-f-]{36}\.png$/,
    );

    const filename = url.split("/").pop() as string;
    const onDisk = path.join(tmpDir, "products", filename);
    const stat = await fs.stat(onDisk);
    expect(stat.isFile()).toBe(true);
  });

  it("tên file sinh ra dùng uuid + đuôi theo mime hợp lệ, KHÔNG dùng tên file client gửi lên", async () => {
    const file = makeFile(10, "image/jpeg", "../../etc/passwd.exe");

    const { url } = await saveProductImage(file);

    expect(url).toMatch(
      /^\/api\/uploads\/products\/[0-9a-f-]{36}\.jpg$/,
    );
    expect(url).not.toContain("passwd");
    expect(url).not.toContain("..");
  });

  it("chấp nhận WEBP hợp lệ", async () => {
    const file = makeFile(100, "image/webp", "x.webp");
    const { url } = await saveProductImage(file);
    expect(url).toMatch(/\.webp$/);
  });

  it("từ chối mime không được phép (text/plain) và KHÔNG ghi file", async () => {
    const file = makeFile(10, "text/plain", "note.txt");

    await expect(saveProductImage(file)).rejects.toThrow();

    const productsDir = path.join(tmpDir, "products");
    const entriesBefore = await fs
      .readdir(productsDir)
      .catch(() => [] as string[]);
    // Không có file .txt nào được ghi ra.
    expect(entriesBefore.every((f) => !f.endsWith(".txt"))).toBe(true);
  });

  it("từ chối file vượt quá MAX_UPLOAD_BYTES", async () => {
    process.env.MAX_UPLOAD_BYTES = "100";
    const file = makeFile(200, "image/png", "big.png");

    await expect(saveProductImage(file)).rejects.toThrow();
  });

  it("chấp nhận file trong giới hạn MAX_UPLOAD_BYTES tuỳ chỉnh", async () => {
    process.env.MAX_UPLOAD_BYTES = "1000";
    const file = makeFile(500, "image/png", "ok.png");

    const { url } = await saveProductImage(file);
    expect(url).toMatch(/\.png$/);
  });
});
