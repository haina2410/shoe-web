import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handleCatalogRequest } from "@/server/catalog-api/http";
import { catalogProductInclude } from "@/server/catalog-api/products";
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
