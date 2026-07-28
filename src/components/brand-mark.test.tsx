import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrandMark } from "./brand-mark";

describe("BrandMark", () => {
  it("hiển thị wordmark và ẩn biểu tượng trang trí khỏi công nghệ hỗ trợ", () => {
    render(<BrandMark />);

    expect(screen.getByText("leafshoes")).toBeInTheDocument();
    expect(screen.getByTestId("leaf-mark")).toHaveAttribute("aria-hidden", "true");
  });
});
