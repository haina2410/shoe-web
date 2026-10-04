import { prisma } from "@/lib/prisma";
import {
  handleCatalogRequest,
  readBoundedBody,
} from "@/server/catalog-api/http";
import { uploadCatalogImage } from "@/server/catalog-api/images";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return handleCatalogRequest(
    request,
    "images:write",
    "images:write",
    async (token) => {
      const bytes = await readBoundedBody(request, 5 * 1024 * 1024);
      const result = await uploadCatalogImage(
        prisma,
        token.id,
        request.headers.get("idempotency-key") ?? "",
        bytes,
        request.headers.get("content-type") ?? "",
      );
      return { ...result, status: result.replayed ? 200 : 201 };
    },
  );
}
