/**
 * stores.v1StoreId / v2StoreId 백필 스크립트
 *
 * 주문 서비스(V1/V2) 매장 ID를 CRM stores 에 심어, slug/매장명/redirectUrl 대신
 * 불변 ID 로 시스템 간 연결을 식별하게 만드는 재설계의 1단계.
 *
 * 입력: slug 기준 매핑 JSON (CRM 프로세스는 V1/V2 DB 접근이 없으므로 사전 추출)
 *   {
 *     "v2": { "<crm slug>": "<V2 stores.id (SR...)>", ... },
 *     "v1": { "<crm slug>": "<V1 stores._id (24-hex)>", ... }
 *   }
 *
 * 자동 기입은 1:1 확정 건만. 아래는 전부 스킵 + 리포트(수동 판정 대상):
 *   - 매핑 파일 안에서 같은 상대 storeId 가 여러 slug 에 등장 (한 상대 매장 ← 여러 CRM 매장)
 *   - CRM 에 해당 slug 매장이 없음
 *   - 대상 컬럼에 이미 다른 값이 있음
 *   - 같은 상대 storeId 가 이미 다른 CRM 매장에 기입돼 있음 (unique 충돌)
 *
 * 사용법:
 *   npx tsx scripts/backfill-store-link-ids.ts <mapping.json>          # dry-run (기본)
 *   APPLY=1 npx tsx scripts/backfill-store-link-ids.ts <mapping.json>  # 실제 기입
 */
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';

const prisma = new PrismaClient();

type Side = 'v1' | 'v2';
const COLUMN: Record<Side, 'v1StoreId' | 'v2StoreId'> = { v1: 'v1StoreId', v2: 'v2StoreId' };

interface Report {
  filled: string[];
  alreadySame: string[];
  skippedConflictValue: string[]; // 컬럼에 이미 다른 값
  skippedUniqueClash: string[];   // 같은 상대 ID 가 이미 타 매장에
  skippedDupTarget: string[];     // 매핑 내 같은 상대 ID 를 여러 slug 가 공유
  skippedNoStore: string[];       // CRM 에 slug 없음
}

async function run(side: Side, mapping: Record<string, string>, apply: boolean): Promise<Report> {
  const column = COLUMN[side];
  const report: Report = {
    filled: [], alreadySame: [], skippedConflictValue: [],
    skippedUniqueClash: [], skippedDupTarget: [], skippedNoStore: [],
  };

  // 매핑 내부의 N:1 (한 상대 storeId ← 여러 slug) 검출
  const targetCount = new Map<string, string[]>();
  for (const [slug, extId] of Object.entries(mapping)) {
    if (!targetCount.has(extId)) targetCount.set(extId, []);
    targetCount.get(extId)!.push(slug);
  }

  for (const [slug, extId] of Object.entries(mapping)) {
    const label = `${side} ${slug} -> ${extId}`;

    const sharers = targetCount.get(extId)!;
    if (sharers.length > 1) {
      report.skippedDupTarget.push(`${label} (같은 ID를 공유: ${sharers.join(', ')})`);
      continue;
    }

    const store = await prisma.store.findUnique({
      where: { slug },
      select: { id: true, name: true, v1StoreId: true, v2StoreId: true },
    });
    if (!store) {
      report.skippedNoStore.push(label);
      continue;
    }

    const current = store[column];
    if (current === extId) {
      report.alreadySame.push(label);
      continue;
    }
    if (current) {
      report.skippedConflictValue.push(`${label} (기존값 ${current})`);
      continue;
    }

    const holder = await prisma.store.findFirst({
      where: { [column]: extId },
      select: { id: true, slug: true, name: true },
    });
    if (holder) {
      report.skippedUniqueClash.push(`${label} (이미 보유: ${holder.slug ?? holder.id} ${holder.name})`);
      continue;
    }

    if (apply) {
      await prisma.store.update({ where: { id: store.id }, data: { [column]: extId } });
    }
    report.filled.push(label);
  }
  return report;
}

function printReport(side: Side, r: Report, apply: boolean) {
  console.log(`\n===== ${side.toUpperCase()} ${apply ? '기입 결과' : 'DRY-RUN'} =====`);
  console.log(`  채움: ${r.filled.length} | 이미 동일: ${r.alreadySame.length} | CRM에 slug 없음: ${r.skippedNoStore.length}`);
  console.log(`  스킵(기존 다른값): ${r.skippedConflictValue.length} | 스킵(unique 충돌): ${r.skippedUniqueClash.length} | 스킵(매핑 N:1): ${r.skippedDupTarget.length}`);
  const dump = (title: string, rows: string[]) => {
    if (!rows.length) return;
    console.log(`  -- ${title}`);
    rows.forEach((x) => console.log(`     ${x}`));
  };
  dump('수동 판정: 매핑 N:1', r.skippedDupTarget);
  dump('수동 판정: 컬럼 기존값 상이', r.skippedConflictValue);
  dump('수동 판정: unique 충돌', r.skippedUniqueClash);
  dump('CRM에 slug 없음', r.skippedNoStore);
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('사용법: [APPLY=1] npx tsx scripts/backfill-store-link-ids.ts <mapping.json>');
    process.exit(1);
  }
  const apply = process.env.APPLY === '1';
  const mapping = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    v1?: Record<string, string>;
    v2?: Record<string, string>;
  };

  console.log(`모드: ${apply ? 'APPLY (실제 기입)' : 'DRY-RUN (읽기 전용)'}`);
  if (mapping.v2) printReport('v2', await run('v2', mapping.v2, apply), apply);
  if (mapping.v1) printReport('v1', await run('v1', mapping.v1, apply), apply);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
