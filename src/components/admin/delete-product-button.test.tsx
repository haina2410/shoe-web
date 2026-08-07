import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { deleteProductActionMock, refreshMock, showToastMock } = vi.hoisted(
  () => ({
    deleteProductActionMock: vi.fn(),
    refreshMock: vi.fn(),
    showToastMock: vi.fn(),
  }),
);

vi.mock("@/server/actions/products", () => ({
  deleteProductAction: deleteProductActionMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("@/components/admin/admin-toast-provider", () => ({
  useAdminToast: () => ({ show: showToastMock }),
}));

import { DeleteProductButton } from "./delete-product-button";

describe("DeleteProductButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteProductActionMock.mockResolvedValue({ ok: true });
  });

  it("requires explicit destructive confirmation that names the product and consequence", async () => {
    const user = userEvent.setup();
    render(<DeleteProductButton productId="product-1" productName="Giày chạy bộ" />);

    await user.click(screen.getByRole("button", { name: "Xoá" }));

    expect(deleteProductActionMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog", { name: "Xoá sản phẩm" })).toHaveTextContent(
      "Giày chạy bộ",
    );
    expect(screen.getByRole("alertdialog")).toHaveTextContent("không thể hoàn tác");

    await user.click(screen.getByRole("button", { name: "Xác nhận xoá" }));

    expect(deleteProductActionMock).toHaveBeenCalledWith("product-1");
  });

  it("does not call the action after cancellation", async () => {
    const user = userEvent.setup();
    render(<DeleteProductButton productId="product-1" productName="Giày chạy bộ" />);

    await user.click(screen.getByRole("button", { name: "Xoá" }));
    await user.click(screen.getByRole("button", { name: "Hủy" }));

    expect(deleteProductActionMock).not.toHaveBeenCalled();
  });

  it("locks confirmation while deletion is pending", async () => {
    let resolveAction: ((value: { ok: true }) => void) | undefined;
    deleteProductActionMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<DeleteProductButton productId="product-1" productName="Giày chạy bộ" />);

    await user.click(screen.getByRole("button", { name: "Xoá" }));
    await user.click(screen.getByRole("button", { name: "Xác nhận xoá" }));

    expect(screen.getByRole("button", { name: "Đang xoá…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Hủy" })).toBeDisabled();

    resolveAction?.({ ok: true });
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
  });

  it("keeps the action's restricted-deletion result inline", async () => {
    deleteProductActionMock.mockResolvedValue({
      ok: false,
      error: "Không thể xoá sản phẩm đang có dữ liệu liên quan.",
    });
    const user = userEvent.setup();
    render(<DeleteProductButton productId="product-1" productName="Giày chạy bộ" />);

    await user.click(screen.getByRole("button", { name: "Xoá" }));
    await user.click(screen.getByRole("button", { name: "Xác nhận xoá" }));

    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      "Không thể xoá sản phẩm đang có dữ liệu liên quan.",
    );
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("keeps unexpected action rejections safe", async () => {
    deleteProductActionMock.mockRejectedValue(
      new Error("database connection reset"),
    );
    const user = userEvent.setup();
    render(<DeleteProductButton productId="product-1" productName="Giày chạy bộ" />);

    await user.click(screen.getByRole("button", { name: "Xoá" }));
    await user.click(screen.getByRole("button", { name: "Xác nhận xoá" }));

    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      "Không thể xoá sản phẩm lúc này. Vui lòng thử lại.",
    );
    expect(screen.queryByText(/connection reset/)).not.toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("announces success then refreshes the product list", async () => {
    const user = userEvent.setup();
    render(<DeleteProductButton productId="product-1" productName="Giày chạy bộ" />);

    await user.click(screen.getByRole("button", { name: "Xoá" }));
    await user.click(screen.getByRole("button", { name: "Xác nhận xoá" }));

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith({
        title: "Đã xoá sản phẩm",
        description: "Sản phẩm đã được xoá khỏi danh mục.",
        tone: "success",
      });
      expect(refreshMock).toHaveBeenCalledTimes(1);
    });
  });
});
