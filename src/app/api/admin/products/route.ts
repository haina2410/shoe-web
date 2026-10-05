import { listCatalogProducts } from "@/server/catalog-api/queries";
import { prisma } from "@/lib/prisma";
import {
  handleCatalogRequest,
  readCatalogJson,
} from "@/server/catalog-api/http";
import { catalogProductSchema } from "@/server/catalog-api/schema";
import { createCatalogProduct } from "@/server/catalog-api/products";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return handleCatalogRequest(
    request,
    "products:create",
    "products:create",
    async (token) => {
      const input = catalogProductSchema.parse(await readCatalogJson(request));
      const result = await createCatalogProduct(
        prisma,
        token.id,
        request.headers.get("idempotency-key") ?? "",
        input,
      );
      return { ...result, status: result.replayed ? 200 : 201 };
    },
  );
}

export async function GET(request: Request) {
  return handleCatalogRequest(
    request,
    "catalog:read",
    "products:list",
    async () =>
      listCatalogProducts(
        prisma,
        Object.fromEntries(new URL(request.url).searchParams),
      ),
  );
}
