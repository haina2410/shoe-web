import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * MIME được phép cho ảnh sản phẩm → đuôi file tương ứng. Đuôi output LUÔN
 * suy ra từ mime đã validate — KHÔNG bao giờ lấy từ tên file client gửi lên
 * (tránh path traversal / double-extension qua filename).
 */
const ALLOWED_MIME_TO_EXT: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const DEFAULT_MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB

function getUploadDir(): string {
  // `turbopackIgnore` tránh Turbopack trace toàn bộ project khi thấy
  // `process.cwd()` động (xem cảnh báo "Encountered unexpected file in NFT
  // list" ở build của route serve — build vẫn đúng nếu thiếu comment này).
  return (
    process.env.UPLOAD_DIR ??
    path.join(/* turbopackIgnore: true */ process.cwd(), "uploads")
  );
}

function getMaxUploadBytes(): number {
  const raw = process.env.MAX_UPLOAD_BYTES;
  if (!raw) return DEFAULT_MAX_UPLOAD_BYTES;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_MAX_UPLOAD_BYTES;
}

/**
 * Lưu 1 ảnh sản phẩm vào đĩa cục bộ (`UPLOAD_DIR/products/<uuid>.<ext>`) sau
 * khi validate mime + size. Trả về url public để phục vụ lại qua
 * `GET /api/uploads/products/<uuid>.<ext>`.
 *
 * Ném `Error` với message rõ ràng nếu mime không được phép hoặc file vượt
 * quá `MAX_UPLOAD_BYTES`.
 */
export async function saveProductImage(file: File): Promise<{ url: string }> {
  const ext = ALLOWED_MIME_TO_EXT[file.type];
  if (!ext) {
    throw new Error(
      `Loại file không hợp lệ: "${file.type || "unknown"}". ` +
        "Chỉ chấp nhận image/jpeg, image/png, image/webp.",
    );
  }

  const maxBytes = getMaxUploadBytes();
  if (file.size > maxBytes) {
    throw new Error(
      `File quá lớn: ${file.size} byte (giới hạn ${maxBytes} byte).`,
    );
  }

  const productsDir = path.join(getUploadDir(), "products");
  await mkdir(productsDir, { recursive: true });

  const filename = `${randomUUID()}.${ext}`;
  const filePath = path.join(productsDir, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  return { url: `/api/uploads/products/${filename}` };
}
