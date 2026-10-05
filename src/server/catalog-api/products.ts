import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { createProductInTransaction } from "@/server/products";
import { catalogWriteError, lockCatalogProduct } from "./writes";
import { normalizeText } from "@/lib/normalize";
import { enqueueDeleteProductImage } from "@/jobs/queue";
import {
  catalogProductUpdateSchema,
  catalogVariantSchema,
  type CatalogProductUpdateInput,
  type CatalogVariantInput,
} from "./schema";
import { CatalogApiError } from "./errors";
import { catalogProductSchema, type CatalogProductInput } from "./schema";
import { catalogMutation } from "./mutations";
import { hashSecret } from "./tokens";
import { assertCatalogImageAvailable } from "./images";
import {
  assertManagedProductImageAvailable,
  isManagedProductImageUrl,
  lockProductImageUrls,
  ManagedProductImageUnavailableError,
} from "@/lib/product-image-files";

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
  return {
    ...input,
    imageSets: await resolveCatalogImageSets(db, tokenId, input.imageSets),
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
    if (error instanceof ManagedProductImageUnavailableError) {
      throw new CatalogApiError(
        422,
        "INVALID_ASSET",
        "Image file is unavailable",
      );
    }
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

async function resolveCatalogImageSets(
  db: Prisma.TransactionClient,
  tokenId: string,
  imageSets: CatalogProductInput["imageSets"],
) {
  const ids = [
    ...new Set(
      imageSets.flatMap((set) => set.images.map((image) => image.assetId)),
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
  return imageSets.map((set) => ({
    ...set,
    images: set.images.map((image) => ({
      url: urls.get(image.assetId)!,
      position: image.position,
    })),
  }));
}

export async function updateCatalogProduct(
  db: PrismaClient,
  tokenId: string,
  id: string,
  key: string,
  raw: CatalogProductUpdateInput,
) {
  const input = catalogProductUpdateSchema.parse(raw);
  try {
    return await catalogMutation(
      db,
      tokenId,
      "products:update",
      key,
      hashSecret(JSON.stringify({ id, input })),
      async (tx) => {
        await lockCatalogProduct(tx, id);
        if (
          input.product?.categoryId &&
          !(await tx.category.findUnique({
            where: { id: input.product.categoryId },
            select: { id: true },
          }))
        )
          throw new CatalogApiError(
            422,
            "INVALID_CATEGORY",
            "Category does not exist",
          );
        if (input.imageSets !== undefined) {
          const variants = await tx.variant.findMany({
            where: { productId: id },
            select: { color: true },
          });
          const colors = new Set(variants.map((variant) => variant.color));
          if (input.imageSets.some((set) => !colors.has(set.color)))
            throw new CatalogApiError(
              422,
              "INVALID_REFERENCE",
              "Image set color must belong to an existing variant",
            );
          const imageSets = await resolveCatalogImageSets(
            tx,
            tokenId,
            input.imageSets,
          );
          const previous = await tx.productImage.findMany({
            where: { imageSet: { productId: id } },
            select: { url: true },
          });
          const incomingUrls = imageSets.flatMap((set) =>
            set.images.map((image) => image.url),
          );
          await lockProductImageUrls(tx, [
            ...previous.map((image) => image.url),
            ...incomingUrls,
          ]);
          for (const url of new Set(incomingUrls))
            await assertManagedProductImageAvailable(url);
          const kept = new Set(
            imageSets.flatMap((set) => set.images.map((image) => image.url)),
          );
          const removed = [
            ...new Set(previous.map((image) => image.url)),
          ].filter((url) => !kept.has(url));
          await tx.productImageSet.deleteMany({ where: { productId: id } });
          for (const set of imageSets)
            await tx.productImageSet.create({
              data: {
                productId: id,
                color: set.color,
                position: set.position,
                isDefault: set.isDefault,
                images: { create: set.images },
              },
            });
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
          for (const url of removed.filter(isManagedProductImageUrl))
            await enqueueDeleteProductImage(tx, { url });
        }
        return tx.product.update({
          where: { id },
          data: {
            ...input.product,
            updatedAt: new Date(),
            ...(input.product?.name === undefined
              ? {}
              : { nameNormalized: normalizeText(input.product.name) }),
          },
          include: catalogProductInclude,
        });
      },
    );
  } catch (error) {
    catalogWriteError(error);
  }
}

export async function createCatalogVariant(
  db: PrismaClient,
  tokenId: string,
  productId: string,
  key: string,
  raw: CatalogVariantInput,
) {
  const input = catalogVariantSchema.parse(raw);
  try {
    return await catalogMutation(
      db,
      tokenId,
      "variants:create",
      key,
      hashSecret(JSON.stringify({ productId, input })),
      async (tx) => {
        await lockCatalogProduct(tx, productId);
        if ((await tx.variant.count({ where: { productId } })) >= 100)
          throw new CatalogApiError(
            422,
            "VARIANT_LIMIT",
            "A product may have at most 100 variants",
          );
        if (
          await tx.variant.findUnique({
            where: { sku: input.sku },
            select: { id: true },
          })
        )
          throw new CatalogApiError(409, "SKU_CONFLICT", "SKU already exists");
        await tx.product.update({
          where: { id: productId },
          data: { updatedAt: new Date() },
        });
        return tx.variant.create({ data: { ...input, productId } });
      },
    );
  } catch (error) {
    catalogWriteError(error);
  }
}

export async function deleteCatalogProduct(
  db: PrismaClient,
  tokenId: string,
  id: string,
  key: string,
) {
  try {
    return await catalogMutation(
      db,
      tokenId,
      "products:delete",
      key,
      hashSecret(JSON.stringify({ id })),
      async (tx) => {
        await lockCatalogProduct(tx, id);
        if (await tx.orderItem.count({ where: { variant: { productId: id } } }))
          throw new CatalogApiError(
            409,
            "PRODUCT_IN_USE",
            "Product is referenced by an order; archive it instead",
          );
        const images = await tx.productImage.findMany({
          where: { imageSet: { productId: id } },
          select: { url: true },
        });
        const urls = [...new Set(images.map((image) => image.url))].filter(
          isManagedProductImageUrl,
        );
        await lockProductImageUrls(tx, urls);
        await tx.product.delete({ where: { id } });
        for (const url of urls) await enqueueDeleteProductImage(tx, { url });
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
        "PRODUCT_IN_USE",
        "Product is referenced by an order; archive it instead",
      );
    catalogWriteError(error);
  }
}
