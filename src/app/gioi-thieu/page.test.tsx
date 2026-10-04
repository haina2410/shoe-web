import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import GioiThieuPage from "./page";

describe("GioiThieuPage", () => {
  it("renders company photography alongside the existing About content", () => {
    render(<GioiThieuPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Giới thiệu công ty" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Từ xưởng đến từng đôi giày" })).toBeInTheDocument();
    expect(screen.getByText("Chúng tôi làm gì")).toBeInTheDocument();
    expect(screen.getByText(/sản xuất giày dép và phụ liệu dép/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Những đôi dép đang được hoàn thiện tại xưởng leafshoes" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Khu trưng bày giày dép tại leafshoes Việt Nam" })).toBeInTheDocument();
  });
});
