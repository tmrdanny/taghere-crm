-- AlterTable: Add preferredCategories column to external_customers
ALTER TABLE "external_customers" ADD COLUMN IF NOT EXISTS "preferredCategories" TEXT;
