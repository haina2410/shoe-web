import { useEffect } from "react";
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

function ToastCallbackCapture({
  onCapture,
}: {
  onCapture: (show: ReturnType<typeof useAdminToast>["show"]) => void;
}) {
  const { show } = useAdminToast();

  useEffect(() => {
    onCapture(show);
  }, [onCapture, show]);

  return null;
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

  it("delivers a stale completion callback to the remounted live region", async () => {
    let staleShow: ReturnType<typeof useAdminToast>["show"] | undefined;
    const captureFirstShow = (show: ReturnType<typeof useAdminToast>["show"]) => {
      staleShow ??= show;
    };

    const { rerender } = render(
      <AdminToastProvider key="first">
        <ToastCallbackCapture onCapture={captureFirstShow} />
      </AdminToastProvider>,
    );

    await waitFor(() => {
      expect(staleShow).toBeTypeOf("function");
    });

    rerender(
      <AdminToastProvider key="second">
        <ToastCallbackCapture onCapture={captureFirstShow} />
      </AdminToastProvider>,
    );

    staleShow?.({
      title: "Đã đối soát giao dịch",
      description: "Kết quả mới đã được tải.",
      tone: "success",
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("Đã đối soát giao dịch");
    expect(screen.getByRole("alert")).toHaveTextContent("Kết quả mới đã được tải.");

    await userEvent.setup().click(screen.getByText("Đóng thông báo"));

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});
