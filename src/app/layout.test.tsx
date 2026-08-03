import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { STORE_INFO } from "@/lib/storefront-content";

vi.mock("next/font/google", () => ({
  Be_Vietnam_Pro: () => ({ variable: "--font-sans" }),
}));
vi.mock("@/components/cart-hydrator", () => ({ CartHydrator: () => null }));
vi.mock("@/components/site-header", () => ({ SiteHeader: () => <header /> }));
vi.mock("@/components/site-footer", () => ({ SiteFooter: () => <footer /> }));

const { default: RootLayout } = await import("./layout");

describe("RootLayout", () => {
  it("cung cấp liên kết bỏ qua điều hướng đến vùng nội dung chính ổn định", () => {
    const rootLayout = RootLayout({ children: <h1>Nội dung</h1> });
    const body = rootLayout.props.children;
    render(body.props.children);

    expect(screen.getByRole("link", { name: "Bỏ qua điều hướng" })).toHaveAttribute(
      "href",
      "#main-content",
    );
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
  });

  it("đặt thanh liên hệ trên cùng, trước cả header, ở mọi trang", () => {
    const rootLayout = RootLayout({ children: <h1>Nội dung</h1> });
    const body = rootLayout.props.children;
    render(body.props.children);

    const phone = screen.getByRole("link", { name: STORE_INFO.phoneDisplay });
    expect(phone).toHaveAttribute("href", `tel:${STORE_INFO.phoneDigits}`);
    expect(
      phone.compareDocumentPosition(screen.getByRole("main")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
