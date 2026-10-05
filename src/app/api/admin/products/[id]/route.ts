import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { catalogProductUpdateSchema } from "@/server/catalog-api/schema";
import {
  catalogProductInclude,
  updateCatalogProduct,
  deleteCatalogProduct,
} from "@/server/catalog-api/products";
import {
  handleCatalogRequest,
  readCatalogJson,
  requireEmptyCatalogBody,
} from "@/server/catalog-api/http";
import { CatalogApiError } from "@/server/catalog-api/errors";

export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleCatalogRequest(
    request,
    "catalog:read",
    "products:read",
    async () => {
      const id = z
        .string()
        .min(1)
        .max(100)
        .parse((await context.params).id);
      const data = await prisma.product.findUnique({
        where: { id },
        include: catalogProductInclude,
      });
      if (!data)
        throw new CatalogApiError(404, "NOT_FOUND", "Product not found");
      return { data };
    },
  );
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleCatalogRequest(
    request,
    "products:update",
    "products:update",
    async (token) => {
      const id = z
        .string()
        .min(1)
        .max(100)
        .parse((await context.params).id);
      const input = catalogProductUpdateSchema.parse(
        await readCatalogJson(request),
      );
      return updateCatalogProduct(
        prisma,
        token.id,
        id,
        request.headers.get("idempotency-key") ?? "",
        input,
      );
    },
  );
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleCatalogRequest(
    request,
    "products:delete",
    "products:delete",
    async (token) => {
      const id = z
        .string()
        .min(1)
        .max(100)
        .parse((await context.params).id);
      await requireEmptyCatalogBody(request);
      return deleteCatalogProduct(
        prisma,
        token.id,
        id,
        request.headers.get("idempotency-key") ?? "",
      );
    },
  );
}
