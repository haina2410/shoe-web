import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// `product-form.tsx` import `createProductAction`/`updateProductAction` từ
// `@/server/actions/products` — file đó có `"use server"` và kéo theo
// `next/headers`, `@/lib/auth` (Better Auth)… vốn không chạy được trong môi
// trường jsdom của test này. Test ở đây CHỈ quan tâm hành vi state-client
// (thêm/xoá dòng biến thể) nên mock action, không gọi Server Action thật.
const {
  createProductActionMock,
  updateProductActionMock,
  pushMock,
  showToastMock,
} = vi.hoisted(() => ({
  createProductActionMock: vi.fn(),
  updateProductActionMock: vi.fn(),
  pushMock: vi.fn(),
  showToastMock: vi.fn(),
}));

vi.mock("@/server/actions/products", () => ({
  createProductAction: createProductActionMock,
  updateProductAction: updateProductActionMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/components/admin/admin-toast-provider", () => ({
  useAdminToast: () => ({ show: showToastMock }),
}));

import { ProductForm } from "@/components/admin/product-form";

const categories = [{ id: "cat-1", name: "Giày Sneaker" }];
const editInitial = {
  product: {
    name: "Giày thử",
    description: "",
    categoryId: "cat-1",
    basePrice: 250_000,
    status: "ACTIVE" as const,
  },
  variants: [
    {
      id: "variant-1",
      size: "42",
      color: "Đen",
      sku: "SKU-001",
      priceOverride: null,
      stock: 5,
    },
  ],
  images: [],
};

async function fillRequiredProductFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Tên sản phẩm"), "Giày mới");
  await user.type(screen.getByLabelText("Giá (VND)"), "250000");
  await user.type(screen.getByLabelText("Size"), "42");
  await user.type(screen.getByLabelText("Màu"), "Đen");
  await user.type(screen.getByLabelText("SKU"), "SKU-002");
}

describe("ProductForm — biến thể inline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createProductActionMock.mockResolvedValue({
      ok: false,
      error: "test stop",
    });
    updateProductActionMock.mockResolvedValue({
      ok: false,
      error: "test stop",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("bắt đầu với đúng 1 dòng biến thể", () => {
    render(<ProductForm mode="create" categories={categories} />);
    expect(
      screen.getByRole("region", { name: "Danh sách biến thể" }),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId("variant-row")).toHaveLength(1);
  });

  it("bấm 'Thêm biến thể' → tăng số dòng", async () => {
    const user = userEvent.setup();
    render(<ProductForm mode="create" categories={categories} />);

    await user.click(screen.getByRole("button", { name: "Thêm biến thể" }));

    expect(screen.getAllByTestId("variant-row")).toHaveLength(2);
  });

  it("bấm 'Xoá dòng' trên dòng thứ 2 → giảm số dòng về 1", async () => {
    const user = userEvent.setup();
    render(<ProductForm mode="create" categories={categories} />);

    await user.click(screen.getByRole("button", { name: "Thêm biến thể" }));
    expect(screen.getAllByTestId("variant-row")).toHaveLength(2);

    const removeButtons = screen.getAllByRole("button", { name: "Xoá dòng" });
    await user.click(removeButtons[1]);

    expect(screen.getAllByTestId("variant-row")).toHaveLength(1);
  });

  it("không thể xoá được dòng biến thể cuối cùng (nút bị disable)", async () => {
    render(<ProductForm mode="create" categories={categories} />);

    const removeButtons = screen.getAllByRole("button", { name: "Xoá dòng" });
    expect(removeButtons).toHaveLength(1);
    expect(removeButtons[0]).toBeDisabled();

    expect(screen.getAllByTestId("variant-row")).toHaveLength(1);
  });

  it("gửi stock ban đầu làm expectedStock khi sửa một variant hiện có", async () => {
    const user = userEvent.setup();
    render(
      <ProductForm
        mode="edit"
        productId="product-1"
        categories={categories}
        initial={editInitial}
      />,
    );

    const stock = screen.getByLabelText("Tồn kho");
    await user.clear(stock);
    await user.type(stock, "12");
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));

    await waitFor(() => {
      expect(updateProductActionMock).toHaveBeenCalledWith(
        "product-1",
        expect.objectContaining({
          variants: [
            expect.objectContaining({
              id: "variant-1",
              stock: 12,
              expectedStock: 5,
            }),
          ],
        }),
      );
    });
  });

  it("locks submitted fields and competing controls while a save is pending", async () => {
    let resolveAction: ((value: { ok: true }) => void) | undefined;
    createProductActionMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve;
        }),
    );
    render(<ProductForm mode="create" categories={categories} />);

    fireEvent.submit(screen.getByRole("form", { name: "Thông tin sản phẩm" }));
    fireEvent.submit(screen.getByRole("form", { name: "Thông tin sản phẩm" }));

    expect(createProductActionMock).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Tên sản phẩm")).toBeDisabled();
    expect(screen.getByLabelText("Danh mục")).toBeDisabled();
    expect(screen.getByLabelText("Giá (VND)")).toBeDisabled();
    expect(screen.getByLabelText("Trạng thái")).toBeDisabled();
    expect(screen.getByLabelText("Mô tả")).toBeDisabled();
    expect(screen.getByLabelText("Size")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Thêm biến thể" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Huỷ" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Đang lưu…" })).toBeDisabled();
    expect(screen.getByRole("status", { name: "Đang lưu…" })).toBeInTheDocument();

    resolveAction?.({ ok: true });
    await screen.findByRole("button", { name: "Tạo sản phẩm" });
  });

  it("blocks product mutation and navigation until image upload completes", async () => {
    let resolveUpload:
      | ((response: { ok: boolean; json: () => Promise<{ url: string }> }) => void)
      | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<{ ok: boolean; json: () => Promise<{ url: string }> }>((resolve) => {
          resolveUpload = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <ProductForm
        mode="create"
        categories={categories}
        initial={{
          ...editInitial,
          images: [{ url: "/uploads/existing.webp", position: 0 }],
        }}
      />,
    );

    await user.upload(
      screen.getByLabelText("+ Thêm ảnh"),
      new File(["image"], "shoe.webp", { type: "image/webp" }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    expect(screen.getByRole("button", { name: "Tạo sản phẩm" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Huỷ" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Thêm biến thể" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Xoá ảnh" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("form", { name: "Thông tin sản phẩm" }));
    expect(createProductActionMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();

    resolveUpload?.({
      ok: true,
      json: async () => ({ url: "/uploads/shoe.webp" }),
    });
    await screen.findByRole("button", { name: "Tạo sản phẩm" });
    await user.click(screen.getByRole("button", { name: "Tạo sản phẩm" }));

    await waitFor(() => {
      expect(createProductActionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          images: [
            { url: "/uploads/existing.webp", position: 0 },
            { url: "/uploads/shoe.webp", position: 1 },
          ],
        }),
      );
    });
  });

  it("retains entered values and shows a safe error when the save fails", async () => {
    createProductActionMock.mockResolvedValue({
      ok: false,
      error: "SKU đã tồn tại.",
    });
    const user = userEvent.setup();
    render(<ProductForm mode="create" categories={categories} />);

    await fillRequiredProductFields(user);
    await user.click(screen.getByRole("button", { name: "Tạo sản phẩm" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("SKU đã tồn tại.");
    expect(screen.getByLabelText("Tên sản phẩm")).toHaveValue("Giày mới");
  });

  it("announces success before navigating to the product list", async () => {
    createProductActionMock.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<ProductForm mode="create" categories={categories} />);

    await fillRequiredProductFields(user);
    await user.click(screen.getByRole("button", { name: "Tạo sản phẩm" }));

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith({
        title: "Đã tạo sản phẩm",
        description: "Sản phẩm đã được lưu.",
        tone: "success",
      });
      expect(pushMock).toHaveBeenCalledWith("/admin/products");
    });
  });
});
