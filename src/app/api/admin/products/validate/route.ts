import { prisma } from "@/lib/prisma";
import {
  handleCatalogRequest,
  readCatalogJson,
} from "@/server/catalog-api/http";
import { catalogProductSchema } from "@/server/catalog-api/schema";
import { validateCatalogProduct } from "@/server/catalog-api/products";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return handleCatalogRequest(
    request,
    "products:create",
    "products:validate",
    async (token) => {
      const input = catalogProductSchema.parse(await readCatalogJson(request));
      await validateCatalogProduct(prisma, token.id, input);
      return { data: { valid: true, product: input } };
    },
  );
}
