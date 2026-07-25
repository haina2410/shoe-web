-- CreateEnum
CREATE TYPE "BankTransactionStatus" AS ENUM ('RECEIVED', 'MATCHED', 'REVIEW_REQUIRED');

-- CreateTable
CREATE TABLE "bank_transaction" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerTransactionId" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "transferType" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "referenceCode" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "status" "BankTransactionStatus" NOT NULL DEFAULT 'RECEIVED',
    "reviewReason" TEXT,
    "orderId" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bank_transaction_providerTransactionId_key" ON "bank_transaction"("providerTransactionId");

-- CreateIndex
CREATE INDEX "bank_transaction_status_createdAt_idx" ON "bank_transaction"("status", "createdAt");

-- CreateIndex
CREATE INDEX "bank_transaction_orderId_idx" ON "bank_transaction"("orderId");

-- AddForeignKey
ALTER TABLE "bank_transaction" ADD CONSTRAINT "bank_transaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
