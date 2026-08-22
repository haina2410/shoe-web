"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import {
  categoryInputSchema,
  type CategoryInput,
} from "@/lib/validation/category";
import {
  CategoryBusinessError,
  createCategoryCore,
  deleteCategoryCore,
  updateCategoryCore,
} from "@/server/categories";

export type CategoryActionResult =
  | { ok: true }
  | { ok: false; error: string };

const categoryIdSchema = z.string().min(1);

function revalidateCategoryPaths() {
  revalidatePath("/admin/categories");
  revalidatePath("/admin/products");
  revalidatePath("/products");
}

export async function createCategoryAction(
  input: CategoryInput,
): Promise<CategoryActionResult> {
  const session = await requireAdmin();
  if (!can(session.user.role, "category", "create")) {
    redirect("/");
  }

  const parsed = categoryInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }

  await createCategoryCore(prisma, parsed.data);
  revalidateCategoryPaths();
  return { ok: true };
}

export async function updateCategoryAction(
  id: string,
  input: CategoryInput,
): Promise<CategoryActionResult> {
  const session = await requireAdmin();
  if (!can(session.user.role, "category", "update")) {
    redirect("/");
  }

  const idParsed = categoryIdSchema.safeParse(id);
  const inputParsed = categoryInputSchema.safeParse(input);
  if (!idParsed.success) {
    return { ok: false, error: idParsed.error.message };
  }
  if (!inputParsed.success) {
    return { ok: false, error: inputParsed.error.message };
  }

  await updateCategoryCore(prisma, idParsed.data, inputParsed.data);
  revalidateCategoryPaths();
  return { ok: true };
}

export async function deleteCategoryAction(
  id: string,
): Promise<CategoryActionResult> {
  const session = await requireAdmin();
  if (!can(session.user.role, "category", "delete")) {
    redirect("/");
  }

  const parsed = categoryIdSchema.safeParse(id);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }

  try {
    await deleteCategoryCore(prisma, parsed.data);
  } catch (error: unknown) {
    if (error instanceof CategoryBusinessError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }

  revalidateCategoryPaths();
  return { ok: true };
}
