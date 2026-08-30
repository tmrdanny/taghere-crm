/**
 * automation_rule_toggle_logs 백필 스크립트
 *
 * 자동 마케팅 활성화율 KPI 시계열의 t0 기준선 생성:
 * 현재 enabled=true 인 모든 룰에 대해 actor='BACKFILL' 스냅샷 행을 만들고
 * 해당 룰의 enabledAt 을 실행 시점으로 세팅한다 (실제 활성화 시점은 알 수 없으므로 근사치).
 *
 * 이후의 정확한 이력은 토글 API 가 기록하며, 추세 API 는
 * MIN(changedAt) = historySince 이전 구간을 "데이터 없음"으로 처리한다.
 *
 * 멱등: BACKFILL 행이 이미 존재하면 아무것도 하지 않는다.
 *
 * 실행 시점: db push 직후, 신규 API 배포 **전**에 실행할 것.
 * 토글 API가 이력을 먼저 쓰기 시작하면 historySince가 백필 이전으로 당겨져
 * 그 구간의 activeStores가 베이스라인 없이 과소 표시된다.
 *
 * 사용법:
 *   npx tsx scripts/backfill-automation-toggle-log.ts          # dry-run (기본)
 *   APPLY=1 npx tsx scripts/backfill-automation-toggle-log.ts  # 실제 기입
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const apply = process.env.APPLY === '1';

  const existing = await prisma.automationRuleToggleLog.count({
    where: { actor: 'BACKFILL' },
  });
  if (existing > 0) {
    console.log(`이미 BACKFILL 행 ${existing}건 존재 — 스킵 (멱등)`);
    return;
  }

  const enabledRules = await prisma.automationRule.findMany({
    where: { enabled: true },
    select: { id: true, storeId: true, type: true },
  });
  console.log(`대상: enabled=true 룰 ${enabledRules.length}건${apply ? '' : ' (dry-run — APPLY=1 로 실행 시 기입)'}`);

  if (!apply || enabledRules.length === 0) return;

  const now = new Date();
  await prisma.$transaction([
    prisma.automationRuleToggleLog.createMany({
      data: enabledRules.map(r => ({
        ruleId: r.id,
        storeId: r.storeId,
        type: r.type,
        enabled: true,
        actor: 'BACKFILL',
        changedAt: now,
      })),
    }),
    prisma.automationRule.updateMany({
      // enabledAt: null 조건 — 토글 API가 이미 기록한 진짜 활성화 시점을 근사치로 덮어쓰지 않도록
      where: { id: { in: enabledRules.map(r => r.id) }, enabledAt: null },
      data: { enabledAt: now },
    }),
  ]);
  console.log(`완료: 스냅샷 ${enabledRules.length}건 기록 + enabledAt 세팅 (changedAt=${now.toISOString()})`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
