import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { normalizeText } from "@/lib/normalize";
import { catalogProductInclude } from "./products";
import { catalogProductQuerySchema } from "./schema";

export async function listCatalogProducts(
  db: PrismaClient,
  raw: Record<string, string>,
) {
  const { cursor, limit, q, sku, categoryId, status } =
    catalogProductQuerySchema.parse(raw);
  const where: Prisma.ProductWhereInput = {
    ...(cursor ? { id: { gt: cursor } } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(status ? { status } : {}),
    ...(sku ? { variants: { some: { sku } } } : {}),
    ...(q
      ? {
          OR: [
            { nameNormalized: { contains: normalizeText(q) } },
            { name: { contains: q, mode: "insensitive" } },
            { slug: { contains: q, mode: "insensitive" } },
            {
              variants: { some: { sku: { contains: q, mode: "insensitive" } } },
            },
          ],
        }
      : {}),
  };
  const records = await db.product.findMany({
    where,
    orderBy: { id: "asc" },
    take: limit + 1,
    include: catalogProductInclude,
  });
  const data = records.slice(0, limit);
  return {
    data,
    nextCursor: records.length > limit ? data[data.length - 1].id : null,
  };
}
