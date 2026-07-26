-- Persist the provider-validated payment code so retries never trust a later
-- request body. Existing bank events intentionally remain NULL.
ALTER TABLE "bank_transaction" ADD COLUMN "paymentCode" TEXT;

-- SePay requires the contiguous LEAFXXXXXX payment-code contract. Order
-- relationships use the immutable order id, so changing only this unique
-- display/provider key preserves every relationship. The existing unique
-- index remains in force and makes any unexpected collision fail atomically.
UPDATE "order"
SET "orderCode" = regexp_replace("orderCode", '^LEAF-', 'LEAF')
WHERE "orderCode" ~ '^LEAF-[A-Z0-9]{6}$';
