import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { CatalogApiError } from "./errors";
import { requireActiveToken, type CatalogScope } from "./tokens";

export async function catalogMutation<T extends { id: string }>(
  db: PrismaClient,
  tokenId: string,
  operation: CatalogScope,
  key: string,
  payloadHash: string,
  write: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<{ data: T; replayed: boolean }> {
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(key))
    throw new CatalogApiError(
      400,
      "INVALID_IDEMPOTENCY_KEY",
      "Use a 1–128 character Idempotency-Key containing letters, numbers, dot, underscore, colon or hyphen",
    );
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM catalog_api_token WHERE id = ${tokenId} FOR UPDATE`;
      await requireActiveToken(tx, tokenId, operation);
      const previous = await tx.catalogApiRequest.findUnique({
        where: { tokenId_operation_key: { tokenId, operation, key } },
      });
      if (previous) {
        if (previous.payloadHash !== payloadHash)
          throw new CatalogApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "This key was used with a different payload",
          );
        return { data: previous.response as unknown as T, replayed: true };
      }
      const data = await write(tx);
      const response = JSON.parse(
        JSON.stringify(data),
      ) as Prisma.InputJsonValue;
      await tx.catalogApiRequest.create({
        data: { tokenId, operation, key, payloadHash, response },
      });
      await tx.catalogApiAudit.create({
        data: { tokenId, operation, resourceId: data.id },
      });
      return { data: JSON.parse(JSON.stringify(data)) as T, replayed: false };
    },
    { maxWait: 10000, timeout: 15000 },
  );
}
