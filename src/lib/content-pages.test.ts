import { describe, expect, it } from "vitest";
import { COMPANY_NAV, COMPANY_PAGES } from "@/lib/company-content";
import {
  POLICY_NAV,
  POLICY_PAGES,
  POLICY_PAGE_LIST,
  POLICY_SLUGS,
} from "@/lib/policy-content";
import type { ContentPage } from "@/lib/content-page";

const ALL_PAGES: readonly ContentPage[] = [...COMPANY_PAGES, ...POLICY_PAGE_LIST];

/**
 * Các trang nội dung là dữ liệu tĩnh, nên lỗi hay gặp nhất không phải lỗi
 * render mà là lỗi nội dung: quên viết một section, để lại chỗ trống, hoặc đặt
 * href lệch với route thật (link chết trong navbar). Test này chốt các bất biến
 * đó một lần cho mọi trang.
 */
describe("nội dung trang tĩnh", () => {
  it("có đủ tiêu đề, mô tả và đoạn mở đầu cho mọi trang", () => {
    for (const page of ALL_PAGES) {
      expect(page.title.trim().length, page.href).toBeGreaterThan(0);
      expect(page.navLabel.trim().length, page.href).toBeGreaterThan(0);
      expect(page.lead.trim().length, page.href).toBeGreaterThan(40);
      expect(page.metaDescription.trim().length, page.href).toBeGreaterThan(40);
    }
  });

  it("mỗi section có tiêu đề và ít nhất một khối nội dung", () => {
    for (const page of ALL_PAGES) {
      expect(page.sections.length, page.href).toBeGreaterThan(0);

      for (const section of page.sections) {
        expect(section.heading.trim().length, `${page.href} · ${section.heading}`).toBeGreaterThan(0);

        const blocks = [...(section.paragraphs ?? []), ...(section.bullets ?? [])];
        expect(blocks.length, `${page.href} · ${section.heading}`).toBeGreaterThan(0);
        for (const block of blocks) {
          expect(block.trim().length, `${page.href} · ${section.heading}`).toBeGreaterThan(10);
        }
      }
    }
  });

  it("không còn chỗ trống chờ điền nội dung", () => {
    // Không dùng "xxx" làm dấu hiệu: mã đơn thật có dạng LEAFXXXXXX.
    const placeholder = /(TODO|TBD|FIXME|\[cần|\(điền|Lorem ipsum)/i;

    for (const page of ALL_PAGES) {
      const text = [
        page.title,
        page.lead,
        page.metaDescription,
        ...page.sections.flatMap((section) => [
          section.heading,
          ...(section.paragraphs ?? []),
          ...(section.bullets ?? []),
        ]),
      ].join("\n");

      expect(text, page.href).not.toMatch(placeholder);
    }
  });

  it("dùng href tuyệt đối và không trùng nhau", () => {
    const hrefs = ALL_PAGES.map((page) => page.href);

    for (const href of hrefs) {
      expect(href).toMatch(/^\/[a-z0-9/-]+$/);
    }
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("href của trang chính sách khớp với slug của route động", () => {
    for (const slug of POLICY_SLUGS) {
      expect(POLICY_PAGES[slug].href).toBe(`/chinh-sach/${slug}`);
    }
  });

  it("điều hướng được suy ra từ chính nội dung nên không thể lệch", () => {
    expect(COMPANY_NAV).toEqual(
      COMPANY_PAGES.map((page) => ({ label: page.navLabel, href: page.href })),
    );
    expect(POLICY_NAV).toEqual(
      POLICY_PAGE_LIST.map((page) => ({ label: page.navLabel, href: page.href })),
    );
  });

  it("phủ đủ danh mục tài liệu bắt buộc của Bộ Công Thương", () => {
    // Thiếu một slug ở đây là thiếu một tệp phải nộp trên cổng đăng ký website
    // thương mại điện tử, nên khoá lại bằng test thay vì bằng trí nhớ.
    for (const slug of [
      "bao-mat",
      "khieu-nai",
      "gia",
      "thanh-toan",
      "dieu-kien-cung-cap",
      "giao-hang",
      "doi-tra",
    ] as const) {
      expect(POLICY_SLUGS).toContain(slug);
    }
  });

  it("nói đúng những cam kết mà hệ thống thật sự thực hiện", () => {
    // Ba con số này là hành vi thật của code (một zone phí phẳng, job
    // expire-unpaid maxAgeHours=24, danh sách 34 tỉnh trong seed). Nếu ai đổi
    // code mà quên đổi trang chính sách, test này vẫn xanh — nhưng nếu ai sửa
    // trang chính sách thành con số khác thì phải sửa cả test và đọc lại code.
    expect(POLICY_PAGES["giao-hang"].lead).toContain("30.000 ₫");
    expect(
      POLICY_PAGES["thanh-toan"].sections.flatMap((s) => s.paragraphs ?? []).join(" "),
    ).toContain("24 giờ");
    expect(
      POLICY_PAGES["giao-hang"].sections.flatMap((s) => s.bullets ?? []).join(" "),
    ).toContain("34 tỉnh thành");
    expect(POLICY_PAGES["doi-tra"].lead).toContain("3 ngày");
    expect(POLICY_PAGES["bao-hanh"].lead).toContain("30 ngày");
    expect(
      POLICY_PAGES["gia"].sections.flatMap((s) => s.bullets ?? []).join(" "),
    ).toContain("30.000 ₫");
  });
});
