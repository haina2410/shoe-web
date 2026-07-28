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
      "mailto:leafshoes.vn@gmail.com",
    );
  });

  it("không chèn tên hoặc chức danh cá nhân không thuộc thông tin doanh nghiệp", () => {
    render(<SiteFooter />);

    expect(screen.queryByText(/Sophie Dinh|Manager director/i)).not.toBeInTheDocument();
  });
});
