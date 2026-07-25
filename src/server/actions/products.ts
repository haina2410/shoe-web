"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { can } from "@/lib/rbac";
import {
  createProductInputSchema,
  updateProductInputSchema,
  updateVariantStockSchema,
  type CreateProductInput,
  type UpdateProductInput,
  type UpdateVariantStockInput,
} from "@/lib/validation/product";
import {
  createProductCore,
  updateProductCore,
  deleteProductCore,
  updateVariantStockCore,
  ProductBusinessError,
} from "@/server/products";
import { z } from "zod";

/**
 * `src/server/actions/products.ts` — Server Actions (`"use server"`), lớp MỎNG
 * bọc ngoài `src/server/products.ts` (hàm core thuần).
 *
 * Theo `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`: một
 * Server Action là entry point POST không tin cậy — "render-time gating is not
 * a security boundary". Vì vậy MỖI action ở đây tự:
 *   1) `requireAdmin()` — xác thực session thật (không chỉ dựa render/layout).
 *   2) `can(role, "product", action)` — authz thật; KHÔNG suy diễn từ
 *      `requireAdmin()` (staff cũng qua được `requireAdmin`, nhưng
 *      `can("staff","product","create")` = false).
 *   3) `safeParse` input bằng zod — input luôn coi là untrusted, kể cả khi
 *      TypeScript đã gõ kiểu ở caller.
 *   4) Gọi `*Core(prisma, …)`.
 *   5) `revalidatePath` TRƯỚC `redirect` (vì `redirect()` throw — code sau nó
 *      không chạy).
 *
 * Theo nguyên tắc "client chỉ gửi id + thay đổi, đọc lại phần còn lại từ
 * nguồn tin cậy": `deleteProductAction`/`updateVariantStockAction` chỉ nhận
 * id (+ giá trị mới) — không nhận cả bản ghi. `create`/`updateProductAction`
 * nhận toàn bộ nội dung sản phẩm vì đó CHÍNH LÀ thay đổi mà admin đang thực
 * hiện qua form (không có khái niệm "chủ sở hữu" riêng — quyền được RBAC gác).
 */

export type ProductActionResult = { ok: false; error: string };

const productIdSchema = z.string().min(1);

export async function createProductAction(
  input: CreateProductInput,
): Promise<ProductActionResult> {
  const session = await requireAdmin();
  if (!can(session.user.role, "product", "create")) {
    redirect("/");
  }

  const parsed = createProductInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }

  await createProductCore(prisma, parsed.data);

  revalidatePath("/admin/products");
  redirect("/admin/products");
}

export async function updateProductAction(
  id: string,
  input: UpdateProductInput,
): Promise<ProductActionResult> {
  const session = await requireAdmin();
  if (!can(session.user.role, "product", "update")) {
    redirect("/");
  }

  const idParsed = productIdSchema.safeParse(id);
  if (!idParsed.success) {
    return { ok: false, error: idParsed.error.message };
  }
  const inputParsed = updateProductInputSchema.safeParse(input);
  if (!inputParsed.success) {
    return { ok: false, error: inputParsed.error.message };
  }

  try {
    await updateProductCore(prisma, idParsed.data, inputParsed.data);
  } catch (error: unknown) {
    if (error instanceof ProductBusinessError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }

  revalidatePath("/admin/products");
  redirect("/admin/products");
}

export async function deleteProductAction(
  id: string,
): Promise<ProductActionResult> {
  const session = await requireAdmin();
  if (!can(session.user.role, "product", "delete")) {
    redirect("/");
  }

  const parsed = productIdSchema.safeParse(id);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }

  await deleteProductCore(prisma, parsed.data);

  revalidatePath("/admin/products");
  redirect("/admin/products");
}

export async function updateVariantStockAction(
  input: UpdateVariantStockInput,
): Promise<ProductActionResult> {
  const session = await requireAdmin();
  if (!can(session.user.role, "product", "update")) {
    redirect("/");
  }

  const parsed = updateVariantStockSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }

  await updateVariantStockCore(prisma, parsed.data.variantId, parsed.data.stock);

  revalidatePath("/admin/products");
  redirect("/admin/products");
}
