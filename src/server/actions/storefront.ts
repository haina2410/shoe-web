"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import {
  HomeHeroIneligibleError,
  setHomeHeroProduct,
} from "@/server/storefront-setting";

const heroProductIdSchema = z.string().trim().min(1).max(100).nullable();

export async function setHomeHeroProductAction(productId: string | null) {
  const session = await requireAdmin();
  if (!can(session.user.role, "product", "update")) redirect("/");

  const parsed = heroProductIdSchema.safeParse(productId);
  if (!parsed.success) {
    return { ok: false as const, error: "Sản phẩm không hợp lệ." };
  }

  try {
    await setHomeHeroProduct(prisma, parsed.data);
  } catch (error) {
    if (error instanceof HomeHeroIneligibleError) {
      return {
        ok: false as const,
        error: "Sản phẩm phải đang bán và có ảnh để hiển thị ở trang chủ.",
      };
    }
    throw error;
  }

  revalidatePath("/");
  return { ok: true as const };
}
