import { readFile, stat } from "node:fs/promises";
import path from "node:path";

/** Đuôi file → Content-Type. Chỉ các đuôi ảnh hợp lệ (khớp `src/lib/upload.ts`). */
const EXT_TO_CONTENT_TYPE: Readonly<Record<string, string>> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function getUploadDir(): string {
  // `turbopackIgnore` tránh Turbopack trace toàn bộ project khi thấy
  // `process.cwd()` động (xem cảnh báo "Encountered unexpected file in NFT
  // list" — build vẫn đúng nếu thiếu, đây chỉ là tối ưu trace).
  return (
    process.env.UPLOAD_DIR ??
    path.join(/* turbopackIgnore: true */ process.cwd(), "uploads")
  );
}

/**
 * Phục vụ file tĩnh đã upload từ `UPLOAD_DIR`, ví dụ
 * `/api/uploads/products/<uuid>.png` → `UPLOAD_DIR/products/<uuid>.png`.
 *
 * Chống path traversal: ghép các segment với `UPLOAD_DIR` rồi `path.resolve`
 * để chuẩn hoá (loại `..`), sau đó BẮT BUỘC kiểm tra path tuyệt đối kết quả
 * còn nằm bên trong `UPLOAD_DIR` đã resolve — nếu không, trả 403 (không đọc
 * file, không rò rỉ thông tin tồn tại/không tồn tại của nó).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path: segments } = await params;

  const resolvedUploadDir = path.resolve(getUploadDir());
  const requestedPath = path.resolve(resolvedUploadDir, ...segments);

  const isInsideUploadDir =
    requestedPath === resolvedUploadDir ||
    requestedPath.startsWith(resolvedUploadDir + path.sep);

  if (!isInsideUploadDir) {
    return new Response("Forbidden", { status: 403 });
  }

  let fileStat;
  try {
    fileStat = await stat(requestedPath);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  if (!fileStat.isFile()) {
    return new Response("Not found", { status: 404 });
  }

  const ext = path.extname(requestedPath).toLowerCase();
  const contentType = EXT_TO_CONTENT_TYPE[ext] ?? "application/octet-stream";

  const buffer = await readFile(requestedPath);
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: { "Content-Type": contentType },
  });
}
