import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { createProductInTransaction } from "@/server/products";
import { CatalogApiError } from "./errors";
import { catalogProductSchema, type CatalogProductInput } from "./schema";
import { catalogMutation } from "./mutations";
import { hashSecret } from "./tokens";
import { assertCatalogImageAvailable } from "./images";

export const catalogProductInclude = {
  variants: { orderBy: { sku: "asc" as const } },
  imageSets: {
    orderBy: { position: "asc" as const },
    include: { images: { orderBy: { position: "asc" as const } } },
  },
};

export async function validateCatalogProduct(
  db: Prisma.TransactionClient,
  tokenId: string,
  input: CatalogProductInput,
) {
  const category = await db.category.findUnique({
    where: { id: input.product.categoryId },
    select: { id: true },
  });
  if (!category)
    throw new CatalogApiError(
      422,
      "INVALID_CATEGORY",
      "Category does not exist",
    );
  const conflicts = await db.variant.findMany({
    where: { sku: { in: input.variants.map((variant) => variant.sku) } },
    select: { sku: true },
  });
  if (conflicts.length)
    throw new CatalogApiError(
      409,
      "SKU_CONFLICT",
      `Existing SKUs: ${conflicts.map((v) => v.sku).join(", ")}`,
    );
  const ids = [
    ...new Set(
      input.imageSets.flatMap((set) =>
        set.images.map((image) => image.assetId),
      ),
    ),
  ];
  const assets = await db.catalogApiAsset.findMany({
    where: {
      id: { in: ids },
      tokenId,
      OR: [{ attachedAt: { not: null } }, { expiresAt: { gt: new Date() } }],
    },
  });
  if (assets.length !== ids.length)
    throw new CatalogApiError(
      422,
      "INVALID_ASSET",
      "Image assets must exist, belong to this credential, and not be expired",
    );
  await Promise.all(
    assets.map((asset) => assertCatalogImageAvailable(asset.url)),
  );
  const urls = new Map(assets.map((asset) => [asset.id, asset.url]));
  return {
    ...input,
    imageSets: input.imageSets.map((set) => ({
      ...set,
      images: set.images.map((image) => ({
        url: urls.get(image.assetId)!,
        position: image.position,
      })),
    })),
  };
}

export async function createCatalogProduct(
  db: PrismaClient,
  tokenId: string,
  key: string,
  raw: CatalogProductInput,
) {
  const input = catalogProductSchema.parse(raw);
  try {
    return await catalogMutation(
      db,
      tokenId,
      "products:create",
      key,
      hashSecret(JSON.stringify(input)),
      async (tx) => {
        const count = await tx.catalogApiAudit.count({
          where: { tokenId, operation: "products:create" },
        });
        if (count >= 10000)
          throw new CatalogApiError(
            429,
            "PRODUCT_QUOTA",
            "Credential product quota reached",
          );
        const resolved = await validateCatalogProduct(tx, tokenId, input);
        const product = await createProductInTransaction(tx, resolved);
        await tx.catalogApiAsset.updateMany({
          where: {
            tokenId,
            id: {
              in: input.imageSets.flatMap((set) =>
                set.images.map((image) => image.assetId),
              ),
            },
          },
          data: { attachedAt: new Date() },
        });
        return tx.product.findUniqueOrThrow({
          where: { id: product.id },
          include: catalogProductInclude,
        });
      },
    );
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error) {
      if (error.code === "P2002")
        throw new CatalogApiError(
          409,
          "CATALOG_CONFLICT",
          "A SKU or product slug was created concurrently; validate and retry",
        );
      if (error.code === "P2003")
        throw new CatalogApiError(
          422,
          "INVALID_REFERENCE",
          "A referenced catalog record no longer exists",
        );
    }
    throw error;
  }
}
