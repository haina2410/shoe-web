import type { Category, PrismaClient } from "@/generated/prisma/client";
import { slugify, uniqueSlug } from "@/lib/slug";
import type { CategoryInput } from "@/lib/validation/category";

export class CategoryBusinessError extends Error {
  constructor(public readonly code: "CATEGORY_IN_USE") {
    super("Không thể xoá danh mục đang có sản phẩm.");
    this.name = "CategoryBusinessError";
  }
}

function isForeignKeyConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2003"
  );
}

export async function createCategoryCore(
  db: PrismaClient,
  input: CategoryInput,
): Promise<Category> {
  const slug = await uniqueSlug(slugify(input.name), async (candidate) => {
    const existing = await db.category.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    return existing !== null;
  });

  return db.category.create({ data: { name: input.name, slug } });
}

export async function updateCategoryCore(
  db: PrismaClient,
  id: string,
  input: CategoryInput,
): Promise<Category> {
  return db.category.update({ where: { id }, data: { name: input.name } });
}

export async function deleteCategoryCore(
  db: PrismaClient,
  id: string,
): Promise<void> {
  try {
    await db.$transaction(async (tx) => {
      const productCount = await tx.product.count({ where: { categoryId: id } });
      if (productCount > 0) {
        throw new CategoryBusinessError("CATEGORY_IN_USE");
      }
      await tx.category.delete({ where: { id } });
    });
  } catch (error: unknown) {
    if (isForeignKeyConstraintError(error)) {
      throw new CategoryBusinessError("CATEGORY_IN_USE");
    }
    throw error;
  }
}
