import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  updateCatalogVariant,
  deleteCatalogVariant,
} from "@/server/catalog-api/variants";
import {
  handleCatalogRequest,
  readCatalogJson,
  requireEmptyCatalogBody,
} from "@/server/catalog-api/http";
import { catalogVariantUpdateSchema } from "@/server/catalog-api/schema";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; variantId: string }> };
const paramsSchema = z.object({
  id: z.string().min(1).max(100),
  variantId: z.string().min(1).max(100),
});
export async function PATCH(request: Request, context: Context) {
  return handleCatalogRequest(
    request,
    "variants:update",
    "variants:update",
    async (token) => {
      const { id, variantId } = paramsSchema.parse(await context.params);
      const input = catalogVariantUpdateSchema.parse(
        await readCatalogJson(request),
      );
      return updateCatalogVariant(
        prisma,
        token.id,
        id,
        variantId,
        request.headers.get("idempotency-key") ?? "",
        input,
      );
    },
  );
}
export async function DELETE(request: Request, context: Context) {
  return handleCatalogRequest(
    request,
    "variants:delete",
    "variants:delete",
    async (token) => {
      const { id, variantId } = paramsSchema.parse(await context.params);
      await requireEmptyCatalogBody(request);
      return deleteCatalogVariant(
        prisma,
        token.id,
        id,
        variantId,
        request.headers.get("idempotency-key") ?? "",
      );
    },
  );
}
