/**
 * Chuẩn hoá chuỗi (có thể có dấu tiếng Việt) để phục vụ tìm kiếm không dấu.
 *
 * KHÁC `slugify` (xem `src/lib/slug.ts`): dùng chung kỹ thuật xoá dấu, nhưng
 * GIỮ khoảng trắng (không thay bằng `-`) để so khớp `contains` với cụm nhiều từ.
 *
 * - Xử lý riêng `đ/Đ` vì NFD không tách `đ` thành `d` + dấu.
 * - Bỏ dấu tổ hợp qua NFD + xoá `\p{Diacritic}`.
 * - Lowercase, trim, gộp nhiều khoảng trắng liên tiếp thành 1.
 */
export function normalizeText(input: string): string {
  const withoutDStroke = input.replace(/đ/g, "d").replace(/Đ/g, "D");
  const withoutDiacritics = withoutDStroke
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

  return withoutDiacritics
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}
