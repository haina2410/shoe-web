import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminSpinner } from "./admin-spinner";

describe("AdminSpinner", () => {
  it("announces a default visually hidden loading label", () => {
    render(<AdminSpinner />);

    expect(screen.getByRole("status", { name: "Đang tải" })).toBeInTheDocument();
  });

  it("uses a supplied accessible label", () => {
    render(<AdminSpinner label="Đang lưu đơn hàng" />);

    expect(
      screen.getByRole("status", { name: "Đang lưu đơn hàng" }),
    ).toBeInTheDocument();
  });
});
