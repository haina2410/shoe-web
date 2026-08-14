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
        code === "STALE_STOCK"
          ? "Tồn kho đã thay đổi. Hãy tải lại trang và thử lại."
          : code === "PRODUCT_IN_USE"
            ? "Không thể xoá sản phẩm đang có dữ liệu liên quan."
          : "Không thể xoá phân loại đã phát sinh đơn hàng. Hãy đặt tồn kho về 0.",
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
  imageSets: [],
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
        imageSets: validCreateInput.imageSets,
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
      updateVariantStockAction({
        variantId: "v1",
        stock: 5,
        expectedStock: 4,
      }),
    ).rejects.toThrow("REDIRECT:/");

    expect(updateVariantStockCoreMock).not.toHaveBeenCalled();
  });

  it("createProductAction: owner trả thành công sau khi ghi và revalidate để client thông báo rồi điều hướng", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("owner"));
    createProductCoreMock.mockResolvedValue({ id: "new-1" });

    await expect(createProductAction(validCreateInput)).resolves.toEqual({ ok: true });

    expect(createProductCoreMock).toHaveBeenCalledTimes(1);
    expect(createProductCoreMock).toHaveBeenCalledWith({}, validCreateInput);
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/products");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("updateProductAction: owner trả thành công sau khi ghi và revalidate để client thông báo rồi điều hướng", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("owner"));

    await expect(
      updateProductAction("prod-1", {
        product: validCreateInput.product,
        variants: validCreateInput.variants,
        imageSets: validCreateInput.imageSets,
      }),
    ).resolves.toEqual({ ok: true });

    expect(updateProductCoreMock).toHaveBeenCalledWith(
      {},
      "prod-1",
      validCreateInput,
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/products");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("deleteProductAction: owner trả thành công sau khi ghi và revalidate để client thông báo rồi làm mới", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("owner"));

    await expect(deleteProductAction("prod-1")).resolves.toEqual({ ok: true });

    expect(deleteProductCoreMock).toHaveBeenCalledWith({}, "prod-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/products");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("deleteProductAction: lỗi xoá sản phẩm bị tham chiếu trả thông báo an toàn", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("owner"));
    deleteProductCoreMock.mockRejectedValue(
      new ProductBusinessError("PRODUCT_IN_USE"),
    );

    await expect(deleteProductAction("prod-1")).resolves.toEqual({
      ok: false,
      error: "Không thể xoá sản phẩm đang có dữ liệu liên quan.",
    });

    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("deleteProductAction: lỗi không phải ProductBusinessError được ném lại", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("owner"));
    deleteProductCoreMock.mockRejectedValue(new Error("database unavailable"));

    await expect(deleteProductAction("prod-1")).rejects.toThrow(
      "database unavailable",
    );

    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("updateVariantStockAction: owner trả thành công sau khi giữ CAS và revalidate để client thông báo rồi làm mới", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("owner"));

    await expect(
      updateVariantStockAction({
        variantId: "v1",
        stock: 8,
        expectedStock: 10,
      }),
    ).resolves.toEqual({ ok: true });

    expect(updateVariantStockCoreMock).toHaveBeenCalledWith({}, "v1", 8, 10);
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/products");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("createProductAction: input không hợp lệ (zod) → trả {ok:false} và KHÔNG ghi DB, KHÔNG redirect", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("owner"));

    const result = await createProductAction({
      product: { ...validCreateInput.product, name: "" },
      variants: validCreateInput.variants,
      imageSets: validCreateInput.imageSets,
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
      imageSets: validCreateInput.imageSets,
    });

    expect(result).toEqual({
      ok: false,
      error:
        "Không thể xoá phân loại đã phát sinh đơn hàng. Hãy đặt tồn kho về 0.",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("updateVariantStockAction: trả lỗi stale an toàn và không redirect", async () => {
    requireAdminMock.mockResolvedValue(sessionWithRole("owner"));
    updateVariantStockCoreMock.mockRejectedValue(
      new ProductBusinessError("STALE_STOCK"),
    );

    const result = await updateVariantStockAction({
      variantId: "v1",
      stock: 8,
      expectedStock: 10,
    });

    expect(updateVariantStockCoreMock).toHaveBeenCalledWith({}, "v1", 8, 10);
    expect(result).toEqual({
      ok: false,
      error: "Tồn kho đã thay đổi. Hãy tải lại trang và thử lại.",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
