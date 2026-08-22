import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const {
  createCategoryActionMock,
  updateCategoryActionMock,
  pushMock,
  showToastMock,
} = vi.hoisted(() => ({
  createCategoryActionMock: vi.fn(),
  updateCategoryActionMock: vi.fn(),
  pushMock: vi.fn(),
  showToastMock: vi.fn(),
}));

vi.mock("@/server/actions/categories", () => ({
  createCategoryAction: createCategoryActionMock,
  updateCategoryAction: updateCategoryActionMock,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock("@/components/admin/admin-toast-provider", () => ({
  useAdminToast: () => ({ show: showToastMock }),
}));

import { CategoryForm } from "./category-form";

describe("CategoryForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createCategoryActionMock.mockResolvedValue({ ok: true });
    updateCategoryActionMock.mockResolvedValue({ ok: true });
  });

  it("creates a category and returns to the category list", async () => {
    const user = userEvent.setup();
    render(<CategoryForm mode="create" />);

    await user.type(screen.getByRole("textbox", { name: "Tên danh mục" }), "Giày trẻ em");
    await user.click(screen.getByRole("button", { name: "Tạo danh mục" }));

    await waitFor(() => {
      expect(createCategoryActionMock).toHaveBeenCalledWith({ name: "Giày trẻ em" });
      expect(showToastMock).toHaveBeenCalledWith({
        title: "Đã tạo danh mục",
        description: "Danh mục đã được lưu.",
        tone: "success",
      });
      expect(pushMock).toHaveBeenCalledWith("/admin/categories");
    });
  });

  it("updates the current category", async () => {
    const user = userEvent.setup();
    render(
      <CategoryForm
        mode="edit"
        categoryId="cat-1"
        initialName="Sneaker"
      />,
    );

    const name = screen.getByRole("textbox", { name: "Tên danh mục" });
    await user.clear(name);
    await user.type(name, "Giày sneaker");
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));

    await waitFor(() => {
      expect(updateCategoryActionMock).toHaveBeenCalledWith("cat-1", {
        name: "Giày sneaker",
      });
      expect(pushMock).toHaveBeenCalledWith("/admin/categories");
    });
  });

  it("shows action validation errors without navigating", async () => {
    createCategoryActionMock.mockResolvedValue({
      ok: false,
      error: "Tên danh mục không hợp lệ.",
    });
    const user = userEvent.setup();
    render(<CategoryForm mode="create" />);

    await user.type(screen.getByRole("textbox", { name: "Tên danh mục" }), "Tên lỗi");
    await user.click(screen.getByRole("button", { name: "Tạo danh mục" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tên danh mục không hợp lệ.",
    );
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("locks the form while saving", async () => {
    let resolveAction: ((value: { ok: true }) => void) | undefined;
    createCategoryActionMock.mockImplementation(
      () => new Promise((resolve) => { resolveAction = resolve; }),
    );
    const user = userEvent.setup();
    render(<CategoryForm mode="create" />);

    const name = screen.getByRole("textbox", { name: "Tên danh mục" });
    await user.type(name, "Giày lười");
    await user.click(screen.getByRole("button", { name: "Tạo danh mục" }));

    expect(screen.getByRole("button", { name: /Đang lưu…/ })).toBeDisabled();
    expect(name).toBeDisabled();

    resolveAction?.({ ok: true });
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/admin/categories"));
  });
});
