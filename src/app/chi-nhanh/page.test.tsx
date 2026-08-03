import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ChiNhanhPage from "./page";
import { WORKING_HOURS } from "@/lib/company-content";
import { STORE_INFO } from "@/lib/storefront-content";

describe("ChiNhanhPage", () => {
  it("hiển thị thẻ địa chỉ với giờ làm việc và các kênh liên hệ bấm được", () => {
    render(<ChiNhanhPage />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Trụ sở & xưởng sản xuất" }),
    ).toBeInTheDocument();
    expect(screen.getByText(STORE_INFO.address)).toBeInTheDocument();
    expect(screen.getByText(WORKING_HOURS)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: STORE_INFO.phoneDisplay })).toHaveAttribute(
      "href",
      `tel:${STORE_INFO.phoneDigits}`,
    );
    expect(screen.getByRole("link", { name: STORE_INFO.email })).toHaveAttribute(
      "href",
      `mailto:${STORE_INFO.email}`,
    );
  });

  it("mở bản đồ theo đúng địa chỉ cửa hàng trong tab mới", () => {
    render(<ChiNhanhPage />);

    const mapLink = screen.getByRole("link", { name: "Mở trên bản đồ" });
    expect(mapLink).toHaveAttribute("target", "_blank");
    expect(mapLink).toHaveAttribute("rel", "noreferrer");
    expect(mapLink.getAttribute("href")).toContain(encodeURIComponent(STORE_INFO.address));
  });

  it("dẫn tới Zalo chính thức của cửa hàng", () => {
    render(<ChiNhanhPage />);

    expect(screen.getByRole("link", { name: "Nhắn Zalo" })).toHaveAttribute(
      "href",
      STORE_INFO.zaloUrl,
    );
  });
});
