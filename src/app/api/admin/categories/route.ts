import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handleCatalogRequest } from "@/server/catalog-api/http";

export const runtime = "nodejs";
const paginationSchema = z.object({
  cursor: z.string().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export async function GET(request: Request) {
  return handleCatalogRequest(
    request,
    "catalog:read",
    "categories:list",
    async () => {
      const { cursor, limit } = paginationSchema.parse(
        Object.fromEntries(new URL(request.url).searchParams),
      );
      const records = await prisma.category.findMany({
        where: cursor ? { id: { gt: cursor } } : undefined,
        orderBy: { id: "asc" },
        take: limit + 1,
        select: { id: true, name: true, slug: true, parentId: true },
      });
      const data = records.slice(0, limit);
      return {
        data,
        nextCursor: records.length > limit ? data[data.length - 1].id : null,
      };
    },
  );
}
