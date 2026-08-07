import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AdminToastProvider, useAdminToast } from "./admin-toast-provider";

function ToastLauncher() {
  const { show } = useAdminToast();

  return (
    <button
      type="button"
      onClick={() =>
        show({
          title: "Đã lưu thay đổi",
          description: "Sản phẩm đã được cập nhật.",
          tone: "success",
        })
      }
    >
      Hiện thông báo
    </button>
  );
}

describe("AdminToastProvider", () => {
  it("announces a toast through a live region and allows dismissal", async () => {
    const user = userEvent.setup();

    render(
      <AdminToastProvider>
        <ToastLauncher />
      </AdminToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Hiện thông báo" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Đã lưu thay đổi");
    expect(screen.getByRole("alert")).toHaveTextContent("Sản phẩm đã được cập nhật.");

    await user.click(screen.getByText("Đóng thông báo"));

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
