CREATE TABLE "product_image_set" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "product_image_set_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "product_image" image
        WHERE NOT EXISTS (
            SELECT 1 FROM "variant" variant WHERE variant."productId" = image."productId"
        )
    ) THEN
        RAISE EXCEPTION 'Cannot migrate product images without a product variant color';
    END IF;
END $$;

INSERT INTO "product_image_set" ("id", "productId", "color", "position", "isDefault")
SELECT
    'legacy-' || product."id",
    product."id",
    (
        SELECT variant."color"
        FROM "variant" variant
        WHERE variant."productId" = product."id"
        ORDER BY variant."color" ASC, variant."id" ASC
        LIMIT 1
    ),
    0,
    true
FROM "product" product
WHERE EXISTS (
    SELECT 1 FROM "product_image" image WHERE image."productId" = product."id"
);

ALTER TABLE "product_image" ADD COLUMN "imageSetId" TEXT;

UPDATE "product_image"
SET "imageSetId" = 'legacy-' || "productId";

ALTER TABLE "product_image" DROP CONSTRAINT "product_image_productId_fkey";
DROP INDEX "product_image_productId_idx";
ALTER TABLE "product_image" DROP COLUMN "productId";
ALTER TABLE "product_image" ALTER COLUMN "imageSetId" SET NOT NULL;

CREATE UNIQUE INDEX "product_image_set_productId_color_key" ON "product_image_set"("productId", "color");
CREATE INDEX "product_image_set_productId_position_idx" ON "product_image_set"("productId", "position");
CREATE UNIQUE INDEX "product_image_set_one_default_per_product" ON "product_image_set"("productId") WHERE "isDefault" = true;
CREATE INDEX "product_image_imageSetId_position_idx" ON "product_image"("imageSetId", "position");

ALTER TABLE "product_image_set" ADD CONSTRAINT "product_image_set_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_image" ADD CONSTRAINT "product_image_imageSetId_fkey" FOREIGN KEY ("imageSetId") REFERENCES "product_image_set"("id") ON DELETE CASCADE ON UPDATE CASCADE;
