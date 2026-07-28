import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./login-form", () => ({
  LoginForm: () => <form aria-label="Biểu mẫu đăng nhập" />,
}));

import LoginPage from "./page";

describe("LoginPage", () => {
  it("giải thích đây là khu vực quản trị bị giới hạn", () => {
    render(<LoginPage />);

    expect(
      screen.getByRole("heading", { name: "Đăng nhập quản trị" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/chỉ dành cho chủ cửa hàng và nhân viên/i),
    ).toBeInTheDocument();
  });
});
