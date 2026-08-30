-- 자동 마케팅 활성화율 KPI 추적: 룰 ON/OFF 전환 이력 + 활성화 시점
-- 실제 반영은 배포 시 `prisma db push` — 이 파일은 관례상 아카이브.

-- AlterTable
ALTER TABLE "automation_rules" ADD COLUMN "enabledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "automation_rule_toggle_logs" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" "AutomationRuleType" NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "actor" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_rule_toggle_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "automation_rule_toggle_logs_changedAt_idx" ON "automation_rule_toggle_logs"("changedAt");
CREATE INDEX "automation_rule_toggle_logs_storeId_changedAt_idx" ON "automation_rule_toggle_logs"("storeId", "changedAt");

-- AddForeignKey
ALTER TABLE "automation_rule_toggle_logs" ADD CONSTRAINT "automation_rule_toggle_logs_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
