/** Fallback slug khi input rỗng hoặc không còn ký tự hợp lệ sau khi xử lý. */
const FALLBACK_SLUG = "san-pham";

/**
 * Chuyển chuỗi (có thể có dấu tiếng Việt) thành slug URL-safe.
 * - Bỏ dấu tổ hợp qua NFD + xoá `\p{Diacritic}`.
 * - Xử lý riêng `đ/Đ` vì NFD không tách `đ` thành `d` + dấu.
 * - Lowercase, thay ký tự không phải [a-z0-9] bằng `-`, gộp nhiều `-` liên tiếp,
 *   trim `-` ở đầu/cuối.
 * - Input rỗng hoặc toàn ký tự lạ → fallback `"san-pham"` (không bao giờ trả chuỗi rỗng).
 */
export function slugify(input: string): string {
  const withoutDStroke = input.replace(/đ/g, "d").replace(/Đ/g, "D");
  const normalized = withoutDStroke
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

  const slug = normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug.length > 0 ? slug : FALLBACK_SLUG;
}

/**
 * Sinh slug không trùng lặp: thử `base` trước, nếu đã tồn tại (`exists` trả `true`)
 * thì thử `base-2`, `base-3`, … tới khi tìm được slug chưa tồn tại.
 * `exists` là async để caller có thể query DB thật; test truyền hàm giả backed bởi Set.
 */
export async function uniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  let candidate = base;
  let suffix = 2;

  while (await exists(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}
