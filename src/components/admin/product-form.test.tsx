import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// `product-form.tsx` import `createProductAction`/`updateProductAction` từ
// `@/server/actions/products` — file đó có `"use server"` và kéo theo
// `next/headers`, `@/lib/auth` (Better Auth)… vốn không chạy được trong môi
// trường jsdom của test này. Test ở đây CHỈ quan tâm hành vi state-client
// (thêm/xoá dòng biến thể) nên mock action, không gọi Server Action thật.
vi.mock("@/server/actions/products", () => ({
  createProductAction: vi.fn(),
  updateProductAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { ProductForm } from "@/components/admin/product-form";

const categories = [{ id: "cat-1", name: "Giày Sneaker" }];

describe("ProductForm — biến thể inline", () => {
  it("bắt đầu với đúng 1 dòng biến thể", () => {
    render(<ProductForm mode="create" categories={categories} />);
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
});
