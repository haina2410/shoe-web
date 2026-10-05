import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { enqueueDeleteProductImage } from "@/jobs/queue";
import {
  isManagedProductImageUrl,
  lockProductImageUrls,
} from "@/lib/product-image-files";
import { CatalogApiError } from "./errors";
import { catalogMutation } from "./mutations";
import {
  catalogVariantUpdateSchema,
  type CatalogVariantUpdateInput,
} from "./schema";
import { hashSecret } from "./tokens";
import { catalogWriteError, lockCatalogProduct } from "./writes";

async function findCatalogVariant(
  tx: Prisma.TransactionClient,
  productId: string,
  id: string,
) {
  const variant = await tx.variant.findFirst({ where: { id, productId } });
  if (!variant)
    throw new CatalogApiError(
      404,
      "NOT_FOUND",
      "Variant not found in this product",
    );
  return variant;
}

async function removeUnusedColorImages(
  tx: Prisma.TransactionClient,
  productId: string,
  color: string,
) {
  if (await tx.variant.count({ where: { productId, color } })) return;
  const set = await tx.productImageSet.findUnique({
    where: { productId_color: { productId, color } },
    include: { images: true },
  });
  if (!set) return;
  const urls = [...new Set(set.images.map((image) => image.url))].filter(
    isManagedProductImageUrl,
  );
  await lockProductImageUrls(tx, urls);
  await tx.productImageSet.delete({ where: { id: set.id } });
  if (set.isDefault) {
    const replacement = await tx.productImageSet.findFirst({
      where: { productId },
      orderBy: [{ position: "asc" }, { id: "asc" }],
    });
    if (replacement)
      await tx.productImageSet.update({
        where: { id: replacement.id },
        data: { isDefault: true },
      });
  }
  for (const url of urls) await enqueueDeleteProductImage(tx, { url });
}

export async function updateCatalogVariant(
  db: PrismaClient,
  tokenId: string,
  productId: string,
  id: string,
  key: string,
  raw: CatalogVariantUpdateInput,
) {
  const input = catalogVariantUpdateSchema.parse(raw);
  try {
    return await catalogMutation(
      db,
      tokenId,
      "variants:update",
      key,
      hashSecret(JSON.stringify({ productId, id, input })),
      async (tx) => {
        await lockCatalogProduct(tx, productId);
        const previous = await findCatalogVariant(tx, productId, id);
        if (input.sku !== undefined) {
          const conflict = await tx.variant.findUnique({
            where: { sku: input.sku },
            select: { id: true },
          });
          if (conflict && conflict.id !== id)
            throw new CatalogApiError(
              409,
              "SKU_CONFLICT",
              "SKU already exists",
            );
        }
        const { expectedStock, ...data } = input;
        const updated = await tx.variant.updateMany({
          where: {
            id,
            productId,
            ...(expectedStock === undefined ? {} : { stock: expectedStock }),
          },
          data,
        });
        if (updated.count !== 1)
          throw new CatalogApiError(
            409,
            "STALE_STOCK",
            "Stock changed; read the current variant and retry with a new key",
          );
        if (input.color !== undefined && input.color !== previous.color)
          await removeUnusedColorImages(tx, productId, previous.color);
        await tx.product.update({
          where: { id: productId },
          data: { updatedAt: new Date() },
        });
        return tx.variant.findUniqueOrThrow({ where: { id } });
      },
    );
  } catch (error) {
    catalogWriteError(error);
  }
}

export async function deleteCatalogVariant(
  db: PrismaClient,
  tokenId: string,
  productId: string,
  id: string,
  key: string,
) {
  try {
    return await catalogMutation(
      db,
      tokenId,
      "variants:delete",
      key,
      hashSecret(JSON.stringify({ productId, id })),
      async (tx) => {
        await lockCatalogProduct(tx, productId);
        const variant = await findCatalogVariant(tx, productId, id);
        if (await tx.orderItem.count({ where: { variantId: id } }))
          throw new CatalogApiError(
            409,
            "VARIANT_IN_USE",
            "Variant is referenced by an order; set its stock to zero instead",
          );
        if ((await tx.variant.count({ where: { productId } })) <= 1)
          throw new CatalogApiError(
            409,
            "LAST_VARIANT",
            "A product must retain at least one variant",
          );
        await tx.variant.delete({ where: { id } });
        await removeUnusedColorImages(tx, productId, variant.color);
        await tx.product.update({
          where: { id: productId },
          data: { updatedAt: new Date() },
        });
        return { id, productId, deleted: true };
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
        "VARIANT_IN_USE",
        "Variant is referenced by an order; set its stock to zero instead",
      );
    catalogWriteError(error);
  }
}
