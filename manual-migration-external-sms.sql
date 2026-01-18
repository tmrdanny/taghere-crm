-- Manual migration for ExternalSmsMessage franchiseId column
-- Run this in production database

-- Add franchiseId column to external_sms_messages table
ALTER TABLE "external_sms_messages"
ADD COLUMN IF NOT EXISTS "franchiseId" TEXT;

-- Create index on franchiseId
CREATE INDEX IF NOT EXISTS "external_sms_messages_franchiseId_idx"
  ON "external_sms_messages"("franchiseId");

-- Add foreign key constraint
ALTER TABLE "external_sms_messages"
ADD CONSTRAINT "external_sms_messages_franchiseId_fkey"
  FOREIGN KEY ("franchiseId") REFERENCES "franchises"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
