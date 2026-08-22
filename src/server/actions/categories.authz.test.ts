import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAdminMock,
  redirectMock,
  revalidatePathMock,
  createCategoryCoreMock,
  updateCategoryCoreMock,
  deleteCategoryCoreMock,
  CategoryBusinessErrorMock,
} = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  revalidatePathMock: vi.fn(),
  createCategoryCoreMock: vi.fn(),
  updateCategoryCoreMock: vi.fn(),
  deleteCategoryCoreMock: vi.fn(),
  CategoryBusinessErrorMock: class CategoryBusinessError extends Error {
    constructor(public readonly code: string) {
      super("Không thể xoá danh mục đang có sản phẩm.");
      this.name = "CategoryBusinessError";
    }
  },
}));

vi.mock("@/lib/auth-guard", () => ({ requireAdmin: requireAdminMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/server/categories", () => ({
  createCategoryCore: createCategoryCoreMock,
  updateCategoryCore: updateCategoryCoreMock,
  deleteCategoryCore: deleteCategoryCoreMock,
  CategoryBusinessError: CategoryBusinessErrorMock,
}));

import {
  createCategoryAction,
  deleteCategoryAction,
  updateCategoryAction,
} from "./categories";
import { CategoryBusinessError } from "@/server/categories";

function sessionWithRole(role: string) {
  return {
    user: { id: "u1", email: "u1@test.local", role },
    session: { id: "s1" },
  };
}

describe("category actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteCategoryCoreMock.mockResolvedValue(undefined);
  });

  it.each([
    ["create", () => createCategoryAction({ name: "Sneaker" })],
    ["update", () => updateCategoryAction("cat-1", { name: "Sneaker" })],
    ["delete", () => deleteCategoryAction("cat-1")],
  ])("blocks staff from %s", async (_operation, action) => {
    requireAdminMock.mockResolvedValue(sessionWithRole("staff"));

    await expect(action()).rejects.toThrow("REDIRECT:/");

    expect(createCategoryCoreMock).not.toHaveBeenCalled();
    expect(updateCategoryCoreMock).not.toHaveBeenCalled();
    expect(deleteCategoryCoreMock).not.toHaveBeenCalled();
  });

  it("creates a trimmed category for owners", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("owner"));

    await expect(
      createCategoryAction({ name: "  Giày trẻ em  " }),
    ).resolves.toEqual({ ok: true });

    expect(createCategoryCoreMock).toHaveBeenCalledWith({}, { name: "Giày trẻ em" });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/categories");
  });

  it("rejects invalid input without writing", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("owner"));

    const result = await createCategoryAction({ name: " " });

    expect(result.ok).toBe(false);
    expect(createCategoryCoreMock).not.toHaveBeenCalled();
  });

  it("updates a category for owners", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("owner"));

    await expect(
      updateCategoryAction("cat-1", { name: "Giày chạy bộ" }),
    ).resolves.toEqual({ ok: true });

    expect(updateCategoryCoreMock).toHaveBeenCalledWith({}, "cat-1", {
      name: "Giày chạy bộ",
    });
  });

  it("returns the guarded deletion message", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("owner"));
    deleteCategoryCoreMock.mockRejectedValue(
      new CategoryBusinessError("CATEGORY_IN_USE"),
    );

    await expect(deleteCategoryAction("cat-1")).resolves.toEqual({
      ok: false,
      error: "Không thể xoá danh mục đang có sản phẩm.",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("deletes an empty category for owners", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("owner"));

    await expect(deleteCategoryAction("cat-1")).resolves.toEqual({ ok: true });

    expect(deleteCategoryCoreMock).toHaveBeenCalledWith({}, "cat-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/categories");
  });
});
