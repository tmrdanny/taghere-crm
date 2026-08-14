-- CreateEnum
CREATE TYPE "PendingPointAccrualStatus" AS ENUM ('PENDING', 'ACCRUED', 'CANCELED');

-- CreateTable
CREATE TABLE "pending_point_accruals" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "purAmt" INTEGER NOT NULL,
    "ratePercent" DOUBLE PRECISION NOT NULL,
    "earnPoints" INTEGER NOT NULL,
    "tableLabel" TEXT,
    "sendAlimtalk" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL,
    "status" "PendingPointAccrualStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "finalizedAt" TIMESTAMP(3),
    "finalizeReason" TEXT,
    "pointLedgerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_point_accruals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pending_point_accruals_storeId_orderId_key" ON "pending_point_accruals"("storeId", "orderId");

-- CreateIndex
CREATE INDEX "pending_point_accruals_status_expiresAt_idx" ON "pending_point_accruals"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "pending_point_accruals_storeId_status_createdAt_idx" ON "pending_point_accruals"("storeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "pending_point_accruals_customerId_idx" ON "pending_point_accruals"("customerId");

-- AddForeignKey
ALTER TABLE "pending_point_accruals" ADD CONSTRAINT "pending_point_accruals_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_point_accruals" ADD CONSTRAINT "pending_point_accruals_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
