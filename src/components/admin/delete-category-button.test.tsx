import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { deleteCategoryActionMock, refreshMock, showToastMock } = vi.hoisted(
  () => ({
    deleteCategoryActionMock: vi.fn(),
    refreshMock: vi.fn(),
    showToastMock: vi.fn(),
  }),
);

vi.mock("@/server/actions/categories", () => ({
  deleteCategoryAction: deleteCategoryActionMock,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));
vi.mock("@/components/admin/admin-toast-provider", () => ({
  useAdminToast: () => ({ show: showToastMock }),
}));

import { DeleteCategoryButton } from "./delete-category-button";

describe("DeleteCategoryButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteCategoryActionMock.mockResolvedValue({ ok: true });
  });

  it("blocks deletion when the category contains products", async () => {
    const user = userEvent.setup();
    render(
      <DeleteCategoryButton
        categoryId="cat-1"
        categoryName="Sneaker"
        productCount={2}
      />,
    );

    const button = screen.getByRole("button", { name: "Xoá" });
    expect(button).toBeDisabled();
    expect(screen.getByText("Hãy chuyển hoặc xoá 2 sản phẩm trước.")).toBeInTheDocument();
    await user.click(button);
    expect(deleteCategoryActionMock).not.toHaveBeenCalled();
  });

  it("requires confirmation before deleting an empty category", async () => {
    const user = userEvent.setup();
    render(
      <DeleteCategoryButton
        categoryId="cat-1"
        categoryName="Sneaker"
        productCount={0}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Xoá" }));
    expect(deleteCategoryActionMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog", { name: "Xoá danh mục" })).toHaveTextContent(
      "Sneaker",
    );

    await user.click(screen.getByRole("button", { name: "Xác nhận xoá" }));

    await waitFor(() => {
      expect(deleteCategoryActionMock).toHaveBeenCalledWith("cat-1");
      expect(showToastMock).toHaveBeenCalledWith({
        title: "Đã xoá danh mục",
        description: "Danh mục đã được xoá.",
        tone: "success",
      });
      expect(refreshMock).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps a concurrent in-use error inside the dialog", async () => {
    deleteCategoryActionMock.mockResolvedValue({
      ok: false,
      error: "Không thể xoá danh mục đang có sản phẩm.",
    });
    const user = userEvent.setup();
    render(
      <DeleteCategoryButton
        categoryId="cat-1"
        categoryName="Sneaker"
        productCount={0}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Xoá" }));
    await user.click(screen.getByRole("button", { name: "Xác nhận xoá" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Không thể xoá danh mục đang có sản phẩm.",
    );
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
