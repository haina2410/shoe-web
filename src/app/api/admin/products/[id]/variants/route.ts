import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  handleCatalogRequest,
  readCatalogJson,
} from "@/server/catalog-api/http";
import { catalogVariantSchema } from "@/server/catalog-api/schema";
import { createCatalogVariant } from "@/server/catalog-api/products";

export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handleCatalogRequest(
    request,
    "variants:create",
    "variants:create",
    async (token) => {
      const id = z
        .string()
        .min(1)
        .max(100)
        .parse((await context.params).id);
      const input = catalogVariantSchema.parse(await readCatalogJson(request));
      const result = await createCatalogVariant(
        prisma,
        token.id,
        id,
        request.headers.get("idempotency-key") ?? "",
        input,
      );
      return { ...result, status: result.replayed ? 200 : 201 };
    },
  );
}
