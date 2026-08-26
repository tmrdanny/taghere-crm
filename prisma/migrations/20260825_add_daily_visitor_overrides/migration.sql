-- CreateTable
CREATE TABLE "daily_visitor_overrides" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "visitors" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_visitor_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_visitor_overrides_storeId_date_key" ON "daily_visitor_overrides"("storeId", "date");

-- CreateIndex
CREATE INDEX "daily_visitor_overrides_storeId_idx" ON "daily_visitor_overrides"("storeId");
