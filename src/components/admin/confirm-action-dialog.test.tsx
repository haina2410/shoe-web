import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmActionDialog } from "./confirm-action-dialog";

function renderDialog(overrides: Partial<React.ComponentProps<typeof ConfirmActionDialog>> = {}) {
  const onConfirm = vi.fn();
  const user = userEvent.setup();

  render(
    <ConfirmActionDialog
      trigger={<button type="button">Xóa sản phẩm</button>}
      title="Xóa sản phẩm"
      subject="Giày chạy bộ"
      description="Thao tác này không thể hoàn tác."
      confirmLabel="Xóa"
      pendingLabel="Đang xóa"
      confirmVariant="destructive"
      isPending={false}
      onConfirm={onConfirm}
      {...overrides}
    />,
  );

  return { onConfirm, user };
}

describe("ConfirmActionDialog", () => {
  it("calls the confirmation handler only after explicit approval", async () => {
    const { onConfirm, user } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Xóa sản phẩm" }));
    expect(screen.getByRole("alertdialog", { name: "Xóa sản phẩm" })).toBeInTheDocument();
    expect(screen.getByText("Giày chạy bộ")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Xóa" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("cancels with the cancel action or Escape without calling the handler", async () => {
    const { onConfirm, user } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Xóa sản phẩm" }));
    await user.click(screen.getByRole("button", { name: "Hủy" }));
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Xóa sản phẩm" }));
    await user.keyboard("{Escape}");
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("locks dismissal and confirmation while the action is pending", async () => {
    const { onConfirm, user } = renderDialog({ isPending: true });

    await user.click(screen.getByRole("button", { name: "Xóa sản phẩm" }));
    await user.keyboard("{Escape}");

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đang xóa" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Hủy" })).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("returns focus to the trigger after cancellation", async () => {
    const { user } = renderDialog();
    const trigger = screen.getByRole("button", { name: "Xóa sản phẩm" });

    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Hủy" }));

    expect(trigger).toHaveFocus();
  });
});
