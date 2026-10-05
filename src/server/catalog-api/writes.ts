import type { Prisma } from "@/generated/prisma/client";
import { ManagedProductImageUnavailableError } from "@/lib/product-image-files";
import { CatalogApiError } from "./errors";

export function catalogWriteError(error: unknown): never {
  if (error instanceof ManagedProductImageUnavailableError)
    throw new CatalogApiError(
      422,
      "INVALID_ASSET",
      "Image file is unavailable",
    );
  if (typeof error === "object" && error !== null && "code" in error) {
    if (error.code === "P2002")
      throw new CatalogApiError(
        409,
        "CATALOG_CONFLICT",
        "A SKU, size/color combination, or slug already exists",
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

export async function lockCatalogProduct(
  tx: Prisma.TransactionClient,
  id: string,
) {
  const rows = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT id FROM product WHERE id = ${id} FOR UPDATE`;
  if (!rows.length)
    throw new CatalogApiError(404, "NOT_FOUND", "Product not found");
}
