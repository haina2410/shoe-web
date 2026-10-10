import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContactBubble } from "./contact-bubble";

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname }));

beforeEach(() => {
  usePathname.mockReturnValue("/products");
});

describe("ContactBubble", () => {
  it("starts closed and opens the phone and fanpage choices", async () => {
    const user = userEvent.setup();
    render(<ContactBubble />);

    const trigger = screen.getByRole("button", { name: "Liên hệ" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByRole("dialog", { name: "Liên hệ leafshoes" });
    expect(within(panel).getByRole("link", { name: /Điện thoại/ })).toHaveAttribute(
      "href",
      "tel:0395069089",
    );
    expect(within(panel).getByText("0395.069.089")).toBeInTheDocument();
    const facebook = within(panel).getByRole("link", { name: /Facebook fanpage/ });
    expect(facebook).toHaveAttribute("href", "https://www.facebook.com/leafshoesvietnam/");
    expect(facebook).toHaveAttribute("target", "_blank");
    expect(facebook).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("opens by keyboard and returns focus to the trigger on Escape", async () => {
    const user = userEvent.setup();
    render(<ContactBubble />);

    await user.tab();
    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Điện thoại/ })).toHaveFocus();
    });

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Liên hệ" })).toHaveFocus();
  });

  it("dismisses when clicking outside", async () => {
    const user = userEvent.setup();
    render(<><ContactBubble /><button type="button">Ngoài liên hệ</button></>);

    await user.click(screen.getByRole("button", { name: "Liên hệ" }));
    await user.click(screen.getByRole("button", { name: "Ngoài liên hệ" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("dismisses using the close button", async () => {
    const user = userEvent.setup();
    render(<ContactBubble />);

    await user.click(screen.getByRole("button", { name: "Liên hệ" }));
    await user.click(screen.getByRole("button", { name: "Đóng liên hệ" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("dismisses after choosing the fanpage", async () => {
    const user = userEvent.setup();
    render(<ContactBubble />);

    await user.click(screen.getByRole("button", { name: "Liên hệ" }));
    await user.click(screen.getByRole("link", { name: /Facebook fanpage/ }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each(["/admin", "/admin/orders", "/admin/products/new"])(
    "hides quick contact on %s",
    (pathname) => {
      usePathname.mockReturnValue(pathname);
      render(<ContactBubble />);

      expect(screen.queryByRole("button", { name: "Liên hệ" })).not.toBeInTheDocument();
    },
  );

  it("closes an open overlay on storefront navigation", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ContactBubble />);
    await user.click(screen.getByRole("button", { name: "Liên hệ" }));

    usePathname.mockReturnValue("/cart");
    rerender(<ContactBubble />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Liên hệ" })).toHaveAttribute(
      "aria-expanded", "false",
    );
  });
});
