CREATE TYPE "PaymentDirection" AS ENUM ('IN', 'OUT');

ALTER TABLE "order" ADD COLUMN "lastRefundAt" TIMESTAMP(3);

ALTER TABLE "payment"
  ADD COLUMN "direction" "PaymentDirection" NOT NULL DEFAULT 'IN',
  ADD COLUMN "externalReference" TEXT,
  ADD COLUMN "note" TEXT,
  ADD COLUMN "recordedByUserId" TEXT;

CREATE INDEX "payment_orderId_direction_idx"
  ON "payment"("orderId", "direction");

CREATE INDEX "payment_recordedByUserId_idx"
  ON "payment"("recordedByUserId");

ALTER TABLE "payment"
  ADD CONSTRAINT "payment_recordedByUserId_fkey"
  FOREIGN KEY ("recordedByUserId") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
