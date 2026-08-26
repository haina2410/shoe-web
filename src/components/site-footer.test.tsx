import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { STORE_INFO } from "@/lib/storefront-content";
import { SiteFooter } from "./site-footer";

describe("SiteFooter", () => {
  it("hiển thị thông tin doanh nghiệp và các kênh liên hệ chính thức", () => {
    render(<SiteFooter />);

    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.getByText(STORE_INFO.legalName)).toBeInTheDocument();
    expect(screen.getByText(STORE_INFO.businessLine)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: STORE_INFO.phoneDisplay })).toHaveAttribute(
      "href",
      "tel:0395069089",
    );
    expect(screen.getByRole("link", { name: STORE_INFO.email })).toHaveAttribute(
      "href",
      "mailto:leafshoesvn@gmail.com",
    );
  });

  it("dẫn tới mọi trang doanh nghiệp và chính sách", () => {
    render(<SiteFooter />);

    for (const [name, href] of [
      ["Giới thiệu công ty", "/gioi-thieu"],
      ["Nhà máy & hoạt động kinh doanh", "/nha-may"],
      ["Chi nhánh", "/chi-nhanh"],
      ["Tra cứu đơn hàng", "/orders"],
      ["Hướng dẫn mua hàng và hỗ trợ", "/chinh-sach/huong-dan-mua-hang"],
      ["Chính sách giá", "/chinh-sach/gia"],
      ["Chính sách thanh toán", "/chinh-sach/thanh-toan"],
      ["Chính sách giao hàng", "/chinh-sach/giao-hang"],
      ["Chính sách đổi trả và hoàn tiền", "/chinh-sach/doi-tra"],
      ["Chính sách bảo hành", "/chinh-sach/bao-hanh"],
      ["Điều kiện cung cấp hàng hoá", "/chinh-sach/dieu-kien-cung-cap"],
      ["Tiếp nhận và giải quyết khiếu nại", "/chinh-sach/khieu-nai"],
      ["Chính sách bảo mật thông tin", "/chinh-sach/bao-mat"],
    ] as const) {
      expect(screen.getByRole("link", { name }), name).toHaveAttribute("href", href);
    }
  });

  it("gom liên kết thành các vùng điều hướng có tên", () => {
    render(<SiteFooter />);

    for (const name of ["Mua sắm", "Tổng quan doanh nghiệp", "Chính sách"]) {
      expect(screen.getByRole("navigation", { name })).toBeInTheDocument();
    }
  });

  it("không chèn tên hoặc chức danh cá nhân không thuộc thông tin doanh nghiệp", () => {
    render(<SiteFooter />);

    expect(screen.queryByText(/Sophie Dinh|Manager director/i)).not.toBeInTheDocument();
  });
});
