-- AlterTable
ALTER TABLE "external_sms_campaigns" ADD COLUMN IF NOT EXISTS "franchiseId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "external_sms_campaigns_franchiseId_idx" ON "external_sms_campaigns"("franchiseId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'external_sms_campaigns_franchiseId_fkey'
  ) THEN
    ALTER TABLE "external_sms_campaigns" ADD CONSTRAINT "external_sms_campaigns_franchiseId_fkey"
    FOREIGN KEY ("franchiseId") REFERENCES "franchises"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
