import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useAdminToast } from "@/components/admin/admin-toast-provider";

vi.mock("@/lib/auth-guard", () => ({ requireAdmin: vi.fn() }));

const { default: AdminLayout } = await import("./layout");

function ToastLauncher() {
  const { show } = useAdminToast();

  return (
    <button type="button" onClick={() => show({ title: "Thông báo từ trang" })}>
      Hiện toast
    </button>
  );
}

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

  it("mounts the toast provider around admin children", async () => {
    const user = userEvent.setup();

    render(await AdminLayout({ children: <ToastLauncher /> }));
    await user.click(screen.getByRole("button", { name: "Hiện toast" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Thông báo từ trang");
  });
});
