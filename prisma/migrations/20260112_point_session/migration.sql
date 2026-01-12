-- CreateEnum
CREATE TYPE "PointSessionStatus" AS ENUM ('PENDING', 'COMPLETED', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "point_sessions" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "paymentAmount" INTEGER NOT NULL,
    "earnPoints" INTEGER NOT NULL,
    "status" "PointSessionStatus" NOT NULL DEFAULT 'PENDING',
    "customerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "point_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "point_sessions_storeId_status_idx" ON "point_sessions"("storeId", "status");

-- CreateIndex
CREATE INDEX "point_sessions_expiresAt_idx" ON "point_sessions"("expiresAt");

-- AddForeignKey
ALTER TABLE "point_sessions" ADD CONSTRAINT "point_sessions_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_sessions" ADD CONSTRAINT "point_sessions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
