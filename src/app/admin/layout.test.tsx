import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-guard", () => ({ requireAdmin: vi.fn() }));

const { default: AdminLayout } = await import("./layout");

describe("AdminLayout", () => {
  it("renders admin navigation before the child page content", async () => {
    render(await AdminLayout({ children: <div>Trang quản trị hiện tại</div> }));

    const navigation = screen.getByRole("navigation", {
      name: "Điều hướng quản trị",
    });
    const content = screen.getByText("Trang quản trị hiện tại");

    expect(navigation.compareDocumentPosition(content)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
});
