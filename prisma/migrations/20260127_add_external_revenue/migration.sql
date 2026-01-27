-- CreateTable
CREATE TABLE "external_revenues" (
    "id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "description" TEXT,
    "revenueDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_revenues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "external_revenues_revenueDate_idx" ON "external_revenues"("revenueDate");

-- CreateIndex
CREATE INDEX "external_revenues_createdAt_idx" ON "external_revenues"("createdAt");
