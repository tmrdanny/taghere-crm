-- 주문 서비스 매장 ID 매핑 컬럼 (시스템 간 연결의 유일한 식별자)
-- 실제 반영은 배포 시 `prisma db push` — 이 파일은 관례상 아카이브.

-- AlterTable
ALTER TABLE "stores" ADD COLUMN "v1StoreId" TEXT;
ALTER TABLE "stores" ADD COLUMN "v2StoreId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "stores_v1StoreId_key" ON "stores"("v1StoreId");
CREATE UNIQUE INDEX "stores_v2StoreId_key" ON "stores"("v2StoreId");

-- 하이트진로 제휴 플래그 (리다이렉트 경로 판정용)
ALTER TABLE "stores" ADD COLUMN "isHitejinro" BOOLEAN NOT NULL DEFAULT false;
