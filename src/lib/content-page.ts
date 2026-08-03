/**
 * Kiểu dữ liệu chung cho các trang nội dung tĩnh (giới thiệu, nhà máy, chi
 * nhánh, chính sách).
 *
 * Nội dung nằm trong constant TypeScript thay vì database: đây là văn bản
 * doanh nghiệp, đổi rất ít, và giữ ở đây thì mọi trang đều test được mà không
 * cần seed dữ liệu. Khi nào cần biên tập trong admin thì mới chuyển sang DB.
 */

export type ContentSection = {
  heading: string;
  paragraphs?: readonly string[];
  bullets?: readonly string[];
};

export type ContentPage = {
  /** Đường dẫn tuyệt đối của trang, dùng cho cả điều hướng và test liên kết. */
  href: string;
  /** Nhãn ngắn dùng trong navbar/footer. */
  navLabel: string;
  /** Tiêu đề h1 và cũng là title của tab. */
  title: string;
  metaDescription: string;
  /** Đoạn mở đầu, luôn hiển thị ngay dưới h1. */
  lead: string;
  sections: readonly ContentSection[];
};

export type ContentNavItem = {
  label: string;
  href: string;
};

export function toNavItems(pages: readonly ContentPage[]): readonly ContentNavItem[] {
  return pages.map((page) => ({ label: page.navLabel, href: page.href }));
}
