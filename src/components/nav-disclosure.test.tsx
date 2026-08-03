import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NavDisclosure } from "./nav-disclosure";

const ITEMS = [
  { label: "Giới thiệu công ty", href: "/gioi-thieu" },
  { label: "Chi nhánh", href: "/chi-nhanh" },
] as const;

function renderDisclosure() {
  return render(
    <div>
      <NavDisclosure
        label="Tổng quan doanh nghiệp"
        visibleLabel="Doanh nghiệp"
        items={ITEMS}
      />
      <button type="button">Ngoài menu</button>
    </div>,
  );
}

function getToggle() {
  return screen.getByRole("button", { name: "Tổng quan doanh nghiệp" });
}

describe("NavDisclosure", () => {
  it("đóng sẵn và khai báo trạng thái cho trình đọc màn hình", () => {
    renderDisclosure();

    expect(getToggle()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Chi nhánh" })).not.toBeInTheDocument();
  });

  it("mở ra danh sách liên kết khi bấm nút", async () => {
    const user = userEvent.setup();
    renderDisclosure();

    await user.click(getToggle());

    expect(getToggle()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Giới thiệu công ty" })).toHaveAttribute(
      "href",
      "/gioi-thieu",
    );
    expect(getToggle()).toHaveAttribute(
      "aria-controls",
      screen.getByRole("list").getAttribute("id"),
    );
  });

  it("mở được bằng bàn phím, và Escape đóng lại rồi trả focus về nút", async () => {
    const user = userEvent.setup();
    renderDisclosure();

    await user.tab();
    expect(getToggle()).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(screen.getByRole("link", { name: "Chi nhánh" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("link", { name: "Chi nhánh" })).not.toBeInTheDocument();
    expect(getToggle()).toHaveFocus();
  });

  it("đóng khi bấm ra ngoài menu", async () => {
    const user = userEvent.setup();
    renderDisclosure();

    await user.click(getToggle());
    await user.click(screen.getByRole("button", { name: "Ngoài menu" }));

    expect(getToggle()).toHaveAttribute("aria-expanded", "false");
  });

  it("đóng sau khi bấm một liên kết, vì điều hướng client-side không unmount menu", async () => {
    const user = userEvent.setup();
    renderDisclosure();

    await user.click(getToggle());
    await user.click(screen.getByRole("link", { name: "Chi nhánh" }));

    expect(getToggle()).toHaveAttribute("aria-expanded", "false");
  });

  it("giữ nhãn hiển thị là một phần của tên đầy đủ", () => {
    renderDisclosure();

    // WCAG 2.5.3 (Label in Name): nhãn nhìn thấy phải nằm trong tên mà trình
    // đọc màn hình đọc ra — chữ hoa/thường không tính.
    const toggle = getToggle();
    expect(toggle).toHaveTextContent("Doanh nghiệp");
    expect(toggle.getAttribute("aria-label")?.toLowerCase()).toContain(
      toggle.textContent?.trim().toLowerCase(),
    );
  });
});
