import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  updateCatalogCategory,
  deleteCatalogCategory,
} from "@/server/catalog-api/categories";
import {
  handleCatalogRequest,
  readCatalogJson,
  requireEmptyCatalogBody,
} from "@/server/catalog-api/http";
import { catalogCategorySchema } from "@/server/catalog-api/schema";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) {
  return handleCatalogRequest(
    request,
    "categories:update",
    "categories:update",
    async (token) => {
      const id = z
        .string()
        .min(1)
        .max(100)
        .parse((await context.params).id);
      const input = catalogCategorySchema.parse(await readCatalogJson(request));
      return updateCatalogCategory(
        prisma,
        token.id,
        id,
        request.headers.get("idempotency-key") ?? "",
        input,
      );
    },
  );
}
export async function DELETE(request: Request, context: Context) {
  return handleCatalogRequest(
    request,
    "categories:delete",
    "categories:delete",
    async (token) => {
      const id = z
        .string()
        .min(1)
        .max(100)
        .parse((await context.params).id);
      await requireEmptyCatalogBody(request);
      return deleteCatalogCategory(
        prisma,
        token.id,
        id,
        request.headers.get("idempotency-key") ?? "",
      );
    },
  );
}
