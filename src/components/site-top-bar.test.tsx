import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SiteTopBar } from "./site-top-bar";
import { STORE_INFO } from "@/lib/storefront-content";

describe("SiteTopBar", () => {
  it("cho gọi điện và gửi email trực tiếp từ mọi trang", () => {
    render(<SiteTopBar />);

    expect(screen.getByRole("link", { name: STORE_INFO.phoneDisplay })).toHaveAttribute(
      "href",
      `tel:${STORE_INFO.phoneDigits}`,
    );
    expect(screen.getByRole("link", { name: STORE_INFO.email })).toHaveAttribute(
      "href",
      `mailto:${STORE_INFO.email}`,
    );
  });

  it("hiển thị địa chỉ cửa hàng", () => {
    render(<SiteTopBar />);

    expect(screen.getByText(STORE_INFO.address)).toBeInTheDocument();
  });

  it("giữ điểm chạm đủ lớn cho mobile", () => {
    render(<SiteTopBar />);

    for (const link of screen.getAllByRole("link")) {
      expect(link.className).toMatch(/min-h-11/);
    }
  });
});
