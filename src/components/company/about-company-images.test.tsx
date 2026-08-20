import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ABOUT_COMPANY_IMAGES } from "@/lib/storefront-assets";
import { AboutCompanyImages } from "./about-company-images";

describe("AboutCompanyImages", () => {
  it("renders the company story with one leading image and two supporting images", () => {
    const { container } = render(<AboutCompanyImages />);

    expect(screen.getByRole("heading", { level: 2, name: "Từ xưởng đến từng đôi giày" })).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(3);
    expect(container.querySelectorAll("figure")).toHaveLength(3);

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

  it("reports responsive widths that match the content column and supporting grid", () => {
    render(<AboutCompanyImages />);

    expect(
      screen.getByRole("img", { name: ABOUT_COMPANY_IMAGES.hero.alt }),
    ).toHaveAttribute("sizes", "(max-width: 768px) calc(100vw - 2rem), 736px");

    for (const image of [ABOUT_COMPANY_IMAGES.production, ABOUT_COMPANY_IMAGES.showroom]) {
      expect(screen.getByRole("img", { name: image.alt })).toHaveAttribute(
        "sizes",
        "(max-width: 639px) calc(100vw - 2rem), (max-width: 768px) calc((100vw - 3.5rem) / 2), 356px",
      );
    }
  });
});
