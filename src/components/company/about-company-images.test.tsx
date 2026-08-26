import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ABOUT_COMPANY_IMAGES } from "@/lib/storefront-assets";
import { AboutCompanyImages } from "./about-company-images";

describe("AboutCompanyImages", () => {
  it("renders the company story with two supporting images", () => {
    const { container } = render(<AboutCompanyImages />);

    expect(screen.getByRole("heading", { level: 2, name: "Từ xưởng đến từng đôi giày" })).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(2);
    expect(container.querySelectorAll("figure")).toHaveLength(2);

    for (const image of Object.values(ABOUT_COMPANY_IMAGES)) {
      expect(screen.getByRole("img", { name: image.alt })).toHaveAttribute(
        "width",
        String(image.width),
      );
      expect(screen.getByRole("img", { name: image.alt })).toHaveAttribute(
        "height",
        String(image.height),
      );
      expect(screen.getByText(image.caption)).toBeInTheDocument();
    }
  });

  it("reports responsive widths that match the supporting grid", () => {
    render(<AboutCompanyImages />);

    for (const image of [ABOUT_COMPANY_IMAGES.production, ABOUT_COMPANY_IMAGES.showroom]) {
      expect(screen.getByRole("img", { name: image.alt })).toHaveAttribute(
        "sizes",
        "(max-width: 639px) calc(100vw - 2rem), (max-width: 768px) calc((100vw - 3.5rem) / 2), 356px",
      );
    }
  });
});
