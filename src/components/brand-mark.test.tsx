import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrandMark } from "./brand-mark";

describe("BrandMark", () => {
  it("hiển thị wordmark và ẩn biểu tượng trang trí khỏi công nghệ hỗ trợ", () => {
    render(<BrandMark />);

    expect(screen.getByText("leafshoes")).toBeInTheDocument();
    expect(screen.getByTestId("leaf-mark")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("phân phối biểu tượng nhỏ qua tối ưu hóa ảnh của Next", () => {
    render(<BrandMark />);

    const mark = screen.getByTestId("leaf-mark");

    expect(mark).toHaveAttribute(
      "src",
      expect.stringContaining(
        "/_next/image?url=%2Fbrand%2Fleafshoes-mark.png&w=64&q=75",
      ),
    );
    expect(mark).toHaveAttribute(
      "srcset",
      expect.stringContaining(
        "/_next/image?url=%2Fbrand%2Fleafshoes-mark.png&w=32&q=75 1x",
      ),
    );
  });
});
