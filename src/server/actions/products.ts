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
import { enqueueDeleteProductImage, getBoss } from "@/jobs/queue";
import { isManagedProductImageUrl } from "@/lib/product-image-url";
import { ManagedProductImageUnavailableError } from "@/lib/product-image-files";

export type ProductActionResult =
  | { ok: true }
  | { ok: false; error: string };

const productIdSchema = z.string().min(1);
const productImageCleanupUrlsSchema = z
  .array(z.string().refine(isManagedProductImageUrl))
  .min(1)
  .max(256);

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

  try {
    await createProductCore(prisma, parsed.data);
  } catch (error: unknown) {
    if (error instanceof ManagedProductImageUnavailableError) {
      return { ok: false, error: "Ảnh không còn khả dụng. Hãy tải ảnh lên lại." };
    }
    throw error;
  }

  revalidatePath("/admin/products");
  return { ok: true };
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
    const boss = await getBoss();
    await updateProductCore(prisma, idParsed.data, inputParsed.data, {
      enqueueDeleteProductImage: (tx, payload) =>
        enqueueDeleteProductImage(tx, payload, boss),
    });
  } catch (error: unknown) {
    if (error instanceof ProductBusinessError) {
      return { ok: false, error: error.message };
    }
    if (error instanceof ManagedProductImageUnavailableError) {
      return { ok: false, error: "Ảnh không còn khả dụng. Hãy tải ảnh lên lại." };
    }
    throw error;
  }

  revalidatePath("/admin/products");
  return { ok: true };
}

export async function enqueueProductImageCleanupAction(
  urls: string[],
): Promise<ProductActionResult> {
  const session = await requireAdmin();
  if (!can(session.user.role, "product", "update")) {
    redirect("/");
  }

  const parsed = productImageCleanupUrlsSchema.safeParse(urls);
  if (!parsed.success) return { ok: false, error: "Danh sách ảnh cần dọn không hợp lệ." };

  const boss = await getBoss();
  const uniqueUrls = [...new Set(parsed.data)];
  try {
    await prisma.$transaction(async (tx) => {
      for (const url of uniqueUrls) {
        await enqueueDeleteProductImage(tx, { url }, boss);
      }
    });
  } catch {
    return { ok: false, error: "Không thể lên lịch dọn ảnh. Vui lòng thử lại." };
  }
  return { ok: true };
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

  try {
    await deleteProductCore(prisma, parsed.data);
  } catch (error: unknown) {
    if (error instanceof ProductBusinessError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }

  revalidatePath("/admin/products");
  return { ok: true };
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

  try {
    await updateVariantStockCore(
      prisma,
      parsed.data.variantId,
      parsed.data.stock,
      parsed.data.expectedStock,
    );
  } catch (error: unknown) {
    if (error instanceof ProductBusinessError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }

  revalidatePath("/admin/products");
  return { ok: true };
}
