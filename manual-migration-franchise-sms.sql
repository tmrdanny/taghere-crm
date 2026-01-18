-- Manual migration for Franchise SMS models
-- Run this in production database if tables don't exist

-- Create franchise_sms_campaigns table
CREATE TABLE IF NOT EXISTS "franchise_sms_campaigns" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "franchiseId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "messageType" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetCount" INTEGER NOT NULL,
  "sentCount" INTEGER NOT NULL DEFAULT 0,
  "costPerMessage" INTEGER NOT NULL,
  "totalCost" INTEGER NOT NULL,
  "genderFilter" TEXT,
  "ageGroups" TEXT,
  "imageUrl" TEXT,
  "status" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "franchise_sms_campaigns_franchiseId_fkey"
    FOREIGN KEY ("franchiseId") REFERENCES "franchises"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "franchise_sms_campaigns_franchiseId_createdAt_idx"
  ON "franchise_sms_campaigns"("franchiseId", "createdAt");

-- Create franchise_sms_messages table
CREATE TABLE IF NOT EXISTS "franchise_sms_messages" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "campaignId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "messageType" TEXT NOT NULL,
  "cost" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "franchise_sms_messages_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "franchise_sms_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "franchise_sms_messages_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "franchise_sms_messages_campaignId_idx"
  ON "franchise_sms_messages"("campaignId");

CREATE INDEX IF NOT EXISTS "franchise_sms_messages_customerId_idx"
  ON "franchise_sms_messages"("customerId");

-- Create franchise_sms_test_logs table
CREATE TABLE IF NOT EXISTS "franchise_sms_test_logs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "franchiseId" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "franchise_sms_test_logs_franchiseId_fkey"
    FOREIGN KEY ("franchiseId") REFERENCES "franchises"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "franchise_sms_test_logs_franchiseId_createdAt_idx"
  ON "franchise_sms_test_logs"("franchiseId", "createdAt");
