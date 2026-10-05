import type { PrismaClient } from "@/generated/prisma/client";
import { slugify, uniqueSlug } from "@/lib/slug";
import { CatalogApiError } from "./errors";
import { catalogMutation } from "./mutations";
import { catalogCategorySchema, type CatalogCategoryInput } from "./schema";
import { hashSecret } from "./tokens";
import { catalogWriteError } from "./writes";

export async function createCatalogCategory(
  db: PrismaClient,
  tokenId: string,
  key: string,
  raw: CatalogCategoryInput,
) {
  const input = catalogCategorySchema.parse(raw);
  try {
    return await catalogMutation(
      db,
      tokenId,
      "categories:create",
      key,
      hashSecret(JSON.stringify(input)),
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('catalog-category-create', 0))::text`;
        const slug = await uniqueSlug(
          slugify(input.name),
          async (candidate) =>
            (await tx.category.findUnique({
              where: { slug: candidate },
              select: { id: true },
            })) !== null,
        );
        return tx.category.create({ data: { name: input.name, slug } });
      },
    );
  } catch (error) {
    catalogWriteError(error);
  }
}

export async function updateCatalogCategory(
  db: PrismaClient,
  tokenId: string,
  id: string,
  key: string,
  raw: CatalogCategoryInput,
) {
  const input = catalogCategorySchema.parse(raw);
  try {
    return await catalogMutation(
      db,
      tokenId,
      "categories:update",
      key,
      hashSecret(JSON.stringify({ id, input })),
      async (tx) => {
        const rows = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM category WHERE id = ${id} FOR UPDATE`;
        if (!rows.length)
          throw new CatalogApiError(404, "NOT_FOUND", "Category not found");
        return tx.category.update({
          where: { id },
          data: { name: input.name },
        });
      },
    );
  } catch (error) {
    catalogWriteError(error);
  }
}

export async function deleteCatalogCategory(
  db: PrismaClient,
  tokenId: string,
  id: string,
  key: string,
) {
  try {
    return await catalogMutation(
      db,
      tokenId,
      "categories:delete",
      key,
      hashSecret(JSON.stringify({ id })),
      async (tx) => {
        const rows = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM category WHERE id = ${id} FOR UPDATE`;
        if (!rows.length)
          throw new CatalogApiError(404, "NOT_FOUND", "Category not found");
        if (
          (await tx.product.count({ where: { categoryId: id } })) ||
          (await tx.category.count({ where: { parentId: id } }))
        )
          throw new CatalogApiError(
            409,
            "CATEGORY_IN_USE",
            "Category has products or child categories",
          );
        await tx.category.delete({ where: { id } });
        return { id, deleted: true };
      },
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2003"
    )
      throw new CatalogApiError(
        409,
        "CATEGORY_IN_USE",
        "Category has products or child categories",
      );
    catalogWriteError(error);
  }
}
