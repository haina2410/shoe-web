import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { requireAdminMock, findUniqueMock, notFoundMock } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  findUniqueMock: vi.fn(),
  notFoundMock: vi.fn(() => { throw new Error("NOT_FOUND"); }),
}));

vi.mock("@/lib/auth-guard", () => ({ requireAdmin: requireAdminMock }));
vi.mock("@/lib/prisma", () => ({
  prisma: { category: { findUnique: findUniqueMock } },
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  notFound: notFoundMock,
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/components/admin/admin-toast-provider", () => ({
  useAdminToast: () => ({ show: vi.fn() }),
}));

import EditCategoryPage from "./page";

describe("EditCategoryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUniqueMock.mockResolvedValue({
      id: "cat-1",
      name: "Sneaker",
      slug: "sneaker",
    });
  });

  it("awaits params and renders the existing category", async () => {
    render(await EditCategoryPage({ params: Promise.resolve({ id: "cat-1" }) }));

    expect(requireAdminMock).toHaveBeenCalledTimes(1);
    expect(findUniqueMock).toHaveBeenCalledWith({ where: { id: "cat-1" } });
    expect(screen.getByRole("heading", { name: "Sửa danh mục" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Tên danh mục" })).toHaveValue("Sneaker");
    expect(screen.getByText("Đường dẫn: /products?categorySlug=sneaker")).toBeInTheDocument();
  });

  it("returns not found for an unknown category", async () => {
    findUniqueMock.mockResolvedValue(null);

    await expect(
      EditCategoryPage({ params: Promise.resolve({ id: "missing" }) }),
    ).rejects.toThrow("NOT_FOUND");
  });
});
