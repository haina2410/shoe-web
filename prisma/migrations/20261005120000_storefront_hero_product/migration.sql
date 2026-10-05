CREATE TABLE "storefront_setting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "heroProductId" TEXT,

    CONSTRAINT "storefront_setting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "storefront_setting_heroProductId_key" ON "storefront_setting"("heroProductId");

ALTER TABLE "storefront_setting" ADD CONSTRAINT "storefront_setting_heroProductId_fkey" FOREIGN KEY ("heroProductId") REFERENCES "product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "storefront_setting" ("id") VALUES (1);
