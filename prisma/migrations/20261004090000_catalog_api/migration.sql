CREATE TABLE "catalog_api_token" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "rateWindow" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "catalog_api_token_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "catalog_api_asset" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attachedAt" TIMESTAMP(3),

    CONSTRAINT "catalog_api_asset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "catalog_api_request" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_api_request_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "catalog_api_audit" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_api_audit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "catalog_api_token_tokenHash_key" ON "catalog_api_token"("tokenHash");

CREATE INDEX "catalog_api_token_ownerId_idx" ON "catalog_api_token"("ownerId");

CREATE UNIQUE INDEX "catalog_api_asset_url_key" ON "catalog_api_asset"("url");

CREATE INDEX "catalog_api_asset_tokenId_idx" ON "catalog_api_asset"("tokenId");

CREATE INDEX "catalog_api_asset_attachedAt_expiresAt_idx" ON "catalog_api_asset"("attachedAt", "expiresAt");

CREATE UNIQUE INDEX "catalog_api_request_tokenId_operation_key_key" ON "catalog_api_request"("tokenId", "operation", "key");

CREATE INDEX "catalog_api_audit_tokenId_createdAt_idx" ON "catalog_api_audit"("tokenId", "createdAt");

ALTER TABLE "catalog_api_token" ADD CONSTRAINT "catalog_api_token_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "catalog_api_asset" ADD CONSTRAINT "catalog_api_asset_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "catalog_api_token"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "catalog_api_request" ADD CONSTRAINT "catalog_api_request_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "catalog_api_token"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "catalog_api_audit" ADD CONSTRAINT "catalog_api_audit_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "catalog_api_token"("id") ON DELETE CASCADE ON UPDATE CASCADE;
