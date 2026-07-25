import { describe, it, expect, vi, beforeEach } from "vitest";

// `vi.mock(...)` bị hoist lên đầu file bởi vitest — mọi biến các factory bên
// dưới tham chiếu tới phải khai báo qua `vi.hoisted` để tránh lỗi
// "Cannot access '...' before initialization".
const {
  requireAdminMock,
  redirectMock,
  revalidatePathMock,
  createProductCoreMock,
  updateProductCoreMock,
  deleteProductCoreMock,
  updateVariantStockCoreMock,
  ProductBusinessErrorMock,
} = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  redirectMock: vi.fn((path: string) => {
    // `redirect()` thật của Next.js ném lỗi control-flow — mô phỏng lại để code
    // sau lời gọi redirect() trong action không tiếp tục chạy.
    throw new Error(`REDIRECT:${path}`);
  }),
  revalidatePathMock: vi.fn(),
  createProductCoreMock: vi.fn(),
  updateProductCoreMock: vi.fn(),
  deleteProductCoreMock: vi.fn(),
  updateVariantStockCoreMock: vi.fn(),
  ProductBusinessErrorMock: class ProductBusinessError extends Error {
    constructor(public readonly code: string) {
      super(
        "Không thể xoá phân loại đã phát sinh đơn hàng. Hãy đặt tồn kho về 0.",
      );
      this.name = "ProductBusinessError";
    }
  },
}));

vi.mock("@/lib/auth-guard", () => ({
  requireAdmin: requireAdminMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/server/products", () => ({
  createProductCore: createProductCoreMock,
  updateProductCore: updateProductCoreMock,
  deleteProductCore: deleteProductCoreMock,
  updateVariantStockCore: updateVariantStockCoreMock,
  ProductBusinessError: ProductBusinessErrorMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

// Import SAU khi mock đã đăng ký (vi.mock được hoist lên đầu file bởi vitest).
import {
  createProductAction,
  updateProductAction,
  deleteProductAction,
  updateVariantStockAction,
} from "@/server/actions/products";
import { ProductBusinessError } from "@/server/products";
import type { CreateProductInput } from "@/lib/validation/product";

function sessionWithRole(role: string) {
  return {
    user: { id: "u1", email: "u1@test.local", role },
    session: { id: "s1" },
  };
}

const validCreateInput: CreateProductInput = {
  product: {
    name: "Giày Thử Nghiệm",
    categoryId: "cat-1",
    basePrice: 100000,
    status: "DRAFT",
  },
  variants: [
    { size: "40", color: "Đen", sku: "SKU-TEST-1", priceOverride: null, stock: 5 },
  ],
  images: [],
};

describe("product actions — authz (role staff bị chặn)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createProductAction: staff bị chặn — redirect('/') và KHÔNG gọi createProductCore", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("staff"));

    await expect(createProductAction(validCreateInput)).rejects.toThrow("REDIRECT:/");

    expect(redirectMock).toHaveBeenCalledWith("/");
    expect(createProductCoreMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("updateProductAction: staff bị chặn — KHÔNG gọi updateProductCore", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("staff"));

    await expect(
      updateProductAction("prod-1", {
        product: validCreateInput.product,
        variants: validCreateInput.variants,
        images: validCreateInput.images,
      }),
    ).rejects.toThrow("REDIRECT:/");

    expect(updateProductCoreMock).not.toHaveBeenCalled();
  });

  it("deleteProductAction: staff bị chặn — KHÔNG gọi deleteProductCore", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("staff"));

    await expect(deleteProductAction("prod-1")).rejects.toThrow("REDIRECT:/");

    expect(deleteProductCoreMock).not.toHaveBeenCalled();
  });

  it("updateVariantStockAction: staff CÓ quyền (product:read không chặn update tồn?) — thực ra staff cũng bị chặn vì update không nằm trong quyền staff", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("staff"));

    await expect(
      updateVariantStockAction({ variantId: "v1", stock: 5 }),
    ).rejects.toThrow("REDIRECT:/");

    expect(updateVariantStockCoreMock).not.toHaveBeenCalled();
  });

  it("createProductAction: owner qua được authz — gọi createProductCore rồi revalidatePath + redirect thành công", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("owner"));
    createProductCoreMock.mockResolvedValue({ id: "new-1" });

    await expect(createProductAction(validCreateInput)).rejects.toThrow(
      "REDIRECT:/admin/products",
    );

    expect(createProductCoreMock).toHaveBeenCalledTimes(1);
    expect(createProductCoreMock).toHaveBeenCalledWith({}, validCreateInput);
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/products");
    expect(redirectMock).toHaveBeenCalledWith("/admin/products");
  });

  it("createProductAction: input không hợp lệ (zod) → trả {ok:false} và KHÔNG ghi DB, KHÔNG redirect", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("owner"));

    const result = await createProductAction({
      product: { ...validCreateInput.product, name: "" },
      variants: validCreateInput.variants,
      images: validCreateInput.images,
    });

    expect(result.ok).toBe(false);
    expect(createProductCoreMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("updateProductAction: trả lỗi nghiệp vụ xoá phân loại an toàn, không rò lỗi Prisma hoặc redirect", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("owner"));
    updateProductCoreMock.mockRejectedValue(
      new ProductBusinessError("VARIANT_IN_USE"),
    );

    const result = await updateProductAction("prod-1", {
      product: validCreateInput.product,
      variants: validCreateInput.variants,
      images: validCreateInput.images,
    });

    expect(result).toEqual({
      ok: false,
      error:
        "Không thể xoá phân loại đã phát sinh đơn hàng. Hãy đặt tồn kho về 0.",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
