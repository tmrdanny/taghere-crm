-- AlterTable: Remove random and fixed point columns from stores table
ALTER TABLE "stores" DROP COLUMN IF EXISTS "randomPointEnabled";
ALTER TABLE "stores" DROP COLUMN IF EXISTS "randomPointMin";
ALTER TABLE "stores" DROP COLUMN IF EXISTS "randomPointMax";
ALTER TABLE "stores" DROP COLUMN IF EXISTS "fixedPointEnabled";
ALTER TABLE "stores" DROP COLUMN IF EXISTS "fixedPointAmount";
ALTER TABLE "stores" DROP COLUMN IF EXISTS "pointRateEnabled";

-- Update all stores to have default 5% point rate where it's not set
UPDATE "stores" SET "pointRatePercent" = 5 WHERE "pointRatePercent" IS NULL OR "pointRatePercent" = 0;
