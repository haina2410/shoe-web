import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { CatalogApiError } from "./errors";

export const catalogScopes = [
  "catalog:read",
  "products:create",
  "images:write",
  "products:update",
  "variants:create",
  "variants:update",
  "variants:delete",
  "products:delete",
  "categories:create",
  "categories:update",
  "categories:delete",
] as const;
export type CatalogScope = (typeof catalogScopes)[number];
export const issueTokenSchema = z.strictObject({
  ownerId: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  scopes: z.array(z.enum(catalogScopes)).min(1).max(catalogScopes.length),
  expiresAt: z
    .date()
    .refine(
      (date) =>
        date.getTime() > Date.now() &&
        date.getTime() <= Date.now() + 90 * 86400000,
      "Expiry must be within 90 days",
    ),
});
export function hashSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}
export async function issueCatalogToken(
  db: PrismaClient,
  raw: z.infer<typeof issueTokenSchema>,
) {
  const input = issueTokenSchema.parse(raw);
  const owner = await db.user.findUnique({ where: { id: input.ownerId } });
  if (!owner || owner.role !== "owner" || owner.banned)
    throw new CatalogApiError(
      403,
      "OWNER_REQUIRED",
      "An active owner is required",
    );
  const token = `shoe_${randomBytes(32).toString("base64url")}`;
  const record = await db.catalogApiToken.create({
    data: { ...input, tokenHash: hashSecret(token) },
  });
  return { id: record.id, token, expiresAt: record.expiresAt };
}
export async function revokeCatalogToken(db: PrismaClient, id: string) {
  return db.catalogApiToken.update({
    where: { id },
    data: { revokedAt: new Date() },
    select: { id: true, revokedAt: true },
  });
}
export async function requireActiveToken(
  db: Prisma.TransactionClient,
  id: string,
  scope: CatalogScope,
) {
  const token = await db.catalogApiToken.findUnique({
    where: { id },
    include: { owner: { select: { role: true, banned: true } } },
  });
  if (!token || token.revokedAt || token.expiresAt <= new Date())
    throw new CatalogApiError(
      401,
      "UNAUTHORIZED",
      "Valid bearer credentials required",
    );
  if (
    token.owner.role !== "owner" ||
    token.owner.banned ||
    !token.scopes.includes(scope)
  )
    throw new CatalogApiError(
      403,
      "FORBIDDEN",
      "Credential does not permit this operation",
    );
  return token;
}
export async function authenticateCatalogRequest(
  db: PrismaClient,
  request: Request,
  scope: CatalogScope,
) {
  const authorization = request.headers.get("authorization");
  if (!authorization || !/^Bearer shoe_[A-Za-z0-9_-]{43}$/i.test(authorization))
    throw new CatalogApiError(
      401,
      "UNAUTHORIZED",
      "Valid bearer credentials required",
    );
  const record = await db.catalogApiToken.findUnique({
    where: { tokenHash: hashSecret(authorization.slice(7)) },
    select: { id: true },
  });
  if (!record)
    throw new CatalogApiError(
      401,
      "UNAUTHORIZED",
      "Valid bearer credentials required",
    );
  const token = await requireActiveToken(db, record.id, scope);
  const now = new Date();
  const window = new Date(Math.floor(now.getTime() / 60000) * 60000);
  await db.catalogApiToken.updateMany({
    where: { id: token.id, rateWindow: { lt: window } },
    data: { rateWindow: window, requestCount: 0 },
  });
  const claimed = await db.catalogApiToken.updateMany({
    where: { id: token.id, requestCount: { lt: 60 } },
    data: { requestCount: { increment: 1 }, lastUsedAt: now },
  });
  if (!claimed.count)
    throw new CatalogApiError(
      429,
      "RATE_LIMITED",
      "Request limit reached; retry next minute",
    );
  return { id: token.id, ownerId: token.ownerId };
}
