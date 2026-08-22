import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { requireAdminMock, findManyMock } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  findManyMock: vi.fn(),
}));

vi.mock("@/lib/auth-guard", () => ({ requireAdmin: requireAdminMock }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/components/admin/admin-toast-provider", () => ({
  useAdminToast: () => ({ show: vi.fn() }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { category: { findMany: findManyMock } },
}));

import AdminCategoriesPage from "./page";

describe("AdminCategoriesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue({ user: { role: "owner" } });
    findManyMock.mockResolvedValue([
      {
        id: "cat-1",
        name: "Sneaker",
        slug: "sneaker",
        products: [
          { id: "product-1", name: "Sneaker lá xanh" },
          { id: "product-2", name: "Sneaker đô thị" },
        ],
      },
      { id: "cat-2", name: "Phụ kiện", slug: "phu-kien", products: [] },
    ]);
  });

  it("lists categories with their products and management actions", async () => {
    render(await AdminCategoriesPage());

    expect(screen.getByRole("heading", { name: "Danh mục" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Thêm danh mục" })).toHaveAttribute(
      "href",
      "/admin/categories/new",
    );
    expect(screen.getByRole("cell", { name: "sneaker" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sneaker lá xanh" })).toHaveAttribute(
      "href",
      "/admin/products/product-1/edit",
    );
    expect(screen.getByRole("link", { name: "Sneaker đô thị" })).toHaveAttribute(
      "href",
      "/admin/products/product-2/edit",
    );
    expect(screen.getByRole("link", { name: "Sửa Sneaker" })).toHaveAttribute(
      "href",
      "/admin/categories/cat-1/edit",
    );
    expect(screen.getByText("Chưa có sản phẩm")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Xoá" })[0]).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Xoá" })[1]).toBeEnabled();
  });

  it("shows a useful empty state", async () => {
    findManyMock.mockResolvedValue([]);

    render(await AdminCategoriesPage());

    expect(screen.getByRole("heading", { name: "Chưa có danh mục" })).toBeInTheDocument();
    expect(screen.getByText(/Thêm danh mục đầu tiên/)).toBeInTheDocument();
  });

  it("keeps category details visible but hides mutations from staff", async () => {
    requireAdminMock.mockResolvedValue({ user: { role: "staff" } });

    render(await AdminCategoriesPage());

    expect(screen.getByText("Sneaker")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sneaker lá xanh" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Thêm danh mục" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sửa Sneaker" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xoá" })).not.toBeInTheDocument();
  });

  it("authenticates before querying categories", async () => {
    await AdminCategoriesPage();

    expect(requireAdminMock.mock.invocationCallOrder[0]).toBeLessThan(
      findManyMock.mock.invocationCallOrder[0],
    );
  });
});
