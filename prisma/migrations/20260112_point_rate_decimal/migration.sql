-- AlterTable: Change pointRatePercent from INTEGER to DOUBLE PRECISION (Float)
-- This allows decimal values like 0.1, 2.5, etc.
ALTER TABLE "stores" ALTER COLUMN "pointRatePercent" TYPE DOUBLE PRECISION;
