import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAdminMock,
  redirectMock,
  revalidatePathMock,
  setHomeHeroProductMock,
} = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  revalidatePathMock: vi.fn(),
  setHomeHeroProductMock: vi.fn(),
}));

vi.mock("@/lib/auth-guard", () => ({ requireAdmin: requireAdminMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/server/storefront-setting", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/storefront-setting")>()),
  setHomeHeroProduct: setHomeHeroProductMock,
}));

import { setHomeHeroProductAction } from "./storefront";
import { HomeHeroIneligibleError } from "@/server/storefront-setting";

describe("setHomeHeroProductAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks staff from changing the home page selection", async () => {
    requireAdminMock.mockResolvedValue({ user: { role: "staff" } });

    await expect(setHomeHeroProductAction("product-1")).rejects.toThrow(
      "REDIRECT:/",
    );
    expect(setHomeHeroProductMock).not.toHaveBeenCalled();
  });

  it("saves an owner's selection and refreshes the home page", async () => {
    requireAdminMock.mockResolvedValue({ user: { role: "owner" } });

    await expect(setHomeHeroProductAction("product-1")).resolves.toEqual({
      ok: true,
    });
    expect(setHomeHeroProductMock).toHaveBeenCalledWith({}, "product-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/");
  });

  it("returns a useful error when the product has no public image", async () => {
    requireAdminMock.mockResolvedValue({ user: { role: "owner" } });
    setHomeHeroProductMock.mockRejectedValue(new HomeHeroIneligibleError());

    await expect(setHomeHeroProductAction("product-1")).resolves.toEqual({
      ok: false,
      error: "Sản phẩm phải đang bán và có ảnh để hiển thị ở trang chủ.",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
