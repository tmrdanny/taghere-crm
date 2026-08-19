-- CreateEnum
CREATE TYPE "PendingStampAccrualStatus" AS ENUM ('PENDING', 'ACCRUED', 'CANCELED');

-- CreateTable
CREATE TABLE "pending_stamp_accruals" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "stampDelta" INTEGER NOT NULL,
    "earnMethod" "StampEarnMethod",
    "tableLabel" TEXT,
    "sendAlimtalk" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL,
    "status" "PendingStampAccrualStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "finalizedAt" TIMESTAMP(3),
    "finalizeReason" TEXT,
    "stampLedgerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_stamp_accruals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pending_stamp_accruals_storeId_orderId_key" ON "pending_stamp_accruals"("storeId", "orderId");

-- CreateIndex
CREATE INDEX "pending_stamp_accruals_status_expiresAt_idx" ON "pending_stamp_accruals"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "pending_stamp_accruals_storeId_status_createdAt_idx" ON "pending_stamp_accruals"("storeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "pending_stamp_accruals_customerId_idx" ON "pending_stamp_accruals"("customerId");

-- AddForeignKey
ALTER TABLE "pending_stamp_accruals" ADD CONSTRAINT "pending_stamp_accruals_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_stamp_accruals" ADD CONSTRAINT "pending_stamp_accruals_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
