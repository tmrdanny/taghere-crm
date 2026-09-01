/**
 * 메타씨티 오연결 metacityCustId 정리 스크립트
 *
 * 배경: CUST_SEARCH LAST_4 폴백이 응답 첫 행을 CP_NO 대조 없이 채택해, 뒤 4자리만 같은
 *       다른 사람의 메타씨티 회원(CUST_ID)이 `Customer.metacityCustId` 에 캐시됐다.
 *       (통합회원 매장 전체 오연결 ~2,275건, 지갑 공유 1,290명 — 2026-08 분석)
 *       캐시된 CUST_ID 로 메타씨티에서 회원을 조회해 응답 CP_NO 가 고객 전화번호와
 *       다르면 캐시를 비운다. 비워진 고객은 다음 이용 시 CP_NO 검증이 추가된 조회
 *       로직이 올바른 회원으로 재연결한다.
 *
 * 안전 기본값:
 *   - 기본 DRY-RUN: read-only (CUST_SEARCH(CUST_ID) 조회만, 메타씨티 write 없음).
 *   - 판정: 응답 CP_NO(숫자 정규화) === 고객 phone(숫자 정규화) → 정상(keep).
 *     불일치 / 응답 0건 / E4001(회원 없음) → 오연결·무효 캐시(clear).
 *   - 업무 에러(E4001 외 Metacity E####)는 해당 고객만 실패로 기록하고 계속.
 *   - HTTP/네트워크 등 비업무 에러는 즉시 전체 중단 — 인증·통신 장애를 "대상 없음"으로
 *     오판해 조용히 건너뛰는 사고 방지.
 *   - 멱등: clear 는 metacityCustId=null 세팅이라 재실행해도 동일 결과.
 *   - 변경 내역은 CSV(cleanup-mislinked-metacity-cust-ids.<timestamp>.csv)로 남긴다.
 *   - 종료 시 (storeId, metacityCustId) 잔존 중복 감사를 출력한다 — 중복 0건이어야
 *     `@@unique([storeId, metacityCustId])` db push 가 성공한다.
 *
 * 실행 전 체크리스트 (배포 순서와 결합):
 *   1) CP_NO 검증이 추가된 CRM 코드가 먼저 배포돼 있어야 한다 (clear 된 고객의 재연결 경로).
 *   2) dry-run 의 keep:clear 비율을 반드시 확인할 것 — 사전 분석상 오연결은 통합회원 연결의
 *      약 38~43% 수준. keep 이 비정상적으로 낮으면(예: 거의 전부 clear) 메타씨티 응답 CP_NO
 *      포맷 변형(마스킹·선행 0 소실 등)으로 정상 링크까지 오판하는 것이므로 APPLY 금지,
 *      CSV 의 응답 샘플/서버 warn 로그로 포맷부터 확인.
 *   3) APPLY 후 잔존 중복 감사가 0건인지 확인하고 나서 db push (유니크 제약 적용).
 *      잔존 중복에 phone 없는 고객이 끼어 있으면(검증 불가·skip) 수동 판단 필요.
 *
 * 사용법:
 *   # 전체 매직포스 매장, dry-run (조회만)
 *   npx tsx scripts/cleanup-mislinked-metacity-cust-ids.ts
 *
 *   # 특정 매장만 (slug 또는 store id)
 *   npx tsx scripts/cleanup-mislinked-metacity-cust-ids.ts <slug-or-id> [<slug-or-id> ...]
 *
 *   # 실제 반영
 *   APPLY=1 npx tsx scripts/cleanup-mislinked-metacity-cust-ids.ts <slug-or-id>
 */
import { writeFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import { MetacityService, selectVerifiedCustRow } from '../apps/api/src/services/metacity.js';

const prisma = new PrismaClient();

const APPLY = process.env.APPLY === '1';
const THROTTLE_MS = Number(process.env.THROTTLE_MS || 200);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Verdict = 'keep' | 'clear' | 'skip' | 'fail';

interface ResultRow {
  storeSlug: string;
  customerId: string;
  metacityCustId: string;
  verdict: Verdict;
  reason: string;
}

async function main() {
  const targets = process.argv.slice(2);

  const stores = await prisma.store.findMany({
    where: {
      metacityEnabled: true,
      metacityStoreIdx: { not: null },
      ...(targets.length > 0 ? { OR: [{ slug: { in: targets } }, { id: { in: targets } }] } : {}),
    },
    select: { id: true, name: true, slug: true, metacityStoreIdx: true },
  });

  if (stores.length === 0) {
    console.log('대상 매직포스 매장이 없습니다. (metacityEnabled=true, metacityStoreIdx 존재)');
    return;
  }

  console.log(`\n=== 메타씨티 오연결 정리 ${APPLY ? '[APPLY]' : '[DRY-RUN]'} ===`);
  console.log(`대상 매장: ${stores.length}개${targets.length ? ` (필터: ${targets.join(', ')})` : ''}\n`);

  const rows: ResultRow[] = [];
  const counts: Record<Verdict, number> = { keep: 0, clear: 0, skip: 0, fail: 0 };

  for (const store of stores) {
    const customers = await prisma.customer.findMany({
      where: { storeId: store.id, metacityCustId: { not: null } },
      select: { id: true, phone: true, metacityCustId: true },
    });

    console.log(`\n[${store.name} (${store.slug ?? store.id})] 연결 고객 ${customers.length}명`);
    const service = new MetacityService({ metacityStoreIdx: store.metacityStoreIdx! });

    for (const customer of customers) {
      const custId = customer.metacityCustId!;
      const record = (verdict: Verdict, reason: string) => {
        counts[verdict]++;
        rows.push({ storeSlug: store.slug ?? store.id, customerId: customer.id, metacityCustId: custId, verdict, reason });
      };

      if (!customer.phone) {
        record('skip', 'phone_missing');
        console.log(`  - skip(전화번호 없음): ${customer.id}`);
        continue;
      }

      try {
        const resp = await service.searchCustomerByCustId(custId);
        const list = Array.isArray((resp as any).CUST_INFO_LIST) ? (resp as any).CUST_INFO_LIST : [];
        if (list.length === 0) {
          await clearLink(customer.id);
          record('clear', 'cust_id_not_found_empty_list');
          console.log(`  - clear(조회 0건): ${customer.id} custId=${custId}`);
        } else if (selectVerifiedCustRow(resp, customer.phone)) {
          record('keep', 'phone_match');
        } else {
          await clearLink(customer.id);
          record('clear', 'phone_mismatch');
          console.log(`  - clear(CP_NO 불일치): ${customer.id} custId=${custId}`);
        }
      } catch (err: any) {
        const message: string = err?.message ?? String(err);
        if (message.includes('E4001')) {
          await clearLink(customer.id);
          record('clear', 'cust_id_invalid_e4001');
          console.log(`  - clear(E4001 무효 ID): ${customer.id} custId=${custId}`);
        } else if (/^Metacity E\d+/.test(message)) {
          record('fail', message);
          console.warn(`  - 실패(업무 에러, 미변경): ${customer.id} (${message})`);
        } else {
          // HTTP/네트워크 등 비업무 에러 → 오판 방지 위해 즉시 중단
          console.error(`\n비업무 에러로 중단: customer=${customer.id} (${message})`);
          writeCsv(rows);
          printSummary(counts);
          throw err;
        }
      }

      await sleep(THROTTLE_MS);
    }
  }

  writeCsv(rows);
  printSummary(counts);
  await auditRemainingDuplicates(
    stores.map((s) => s.id),
    new Set(rows.filter((r) => r.verdict === 'clear').map((r) => r.customerId)),
  );
  if (!APPLY) console.log('\nDRY-RUN 입니다. 실제 반영하려면 APPLY=1 을 붙여 다시 실행하세요.');
}

/**
 * (storeId, metacityCustId) 잔존 중복 감사 — 0건이어야 유니크 제약 db push 가 성공한다.
 * dry-run 에서는 clear 예정 고객을 제외하고 시뮬레이션한다 (APPLY 후 상태 예측).
 */
async function auditRemainingDuplicates(storeIds: string[], clearedIds: Set<string>): Promise<void> {
  const linked = await prisma.customer.findMany({
    where: { storeId: { in: storeIds }, metacityCustId: { not: null } },
    select: { id: true, storeId: true, phone: true, metacityCustId: true },
  });
  const groups = new Map<string, { id: string; phone: string | null }[]>();
  for (const c of linked) {
    if (clearedIds.has(c.id)) continue;
    const key = `${c.storeId}:${c.metacityCustId}`;
    const list = groups.get(key) ?? [];
    list.push({ id: c.id, phone: c.phone });
    groups.set(key, list);
  }
  const dups = [...groups.entries()].filter(([, members]) => members.length > 1);

  console.log(`\n=== 잔존 중복 감사 ${APPLY ? '' : '(dry-run 시뮬레이션: clear 예정분 제외)'} ===`);
  if (dups.length === 0) {
    console.log('중복 0건 — @@unique([storeId, metacityCustId]) db push 가능.');
    return;
  }
  console.log(`중복 그룹 ${dups.length}개 — 이대로는 db push 실패. 수동 판단 필요 (phone 없는 고객 포함 여부 확인):`);
  for (const [key, members] of dups) {
    console.log(
      `  - ${key}: ${members.map((m) => `${m.id}${m.phone ? '' : '(phone없음)'}`).join(', ')}`,
    );
  }
}

async function clearLink(customerId: string): Promise<void> {
  if (!APPLY) return;
  await prisma.customer.update({
    where: { id: customerId },
    data: { metacityCustId: null, metacitySyncedAt: null },
  });
}

function writeCsv(rows: ResultRow[]): void {
  const path = `cleanup-mislinked-metacity-cust-ids.${Date.now()}.csv`;
  const header = 'storeSlug,customerId,metacityCustId,verdict,reason';
  const body = rows.map((r) => [r.storeSlug, r.customerId, r.metacityCustId, r.verdict, JSON.stringify(r.reason)].join(','));
  writeFileSync(path, [header, ...body].join('\n'), 'utf8');
  console.log(`\n결과 CSV: ${path} (${rows.length}행)`);
}

function printSummary(counts: Record<Verdict, number>): void {
  console.log(`\n=== 완료 ===`);
  console.log(
    `정상(keep): ${counts.keep}, ${APPLY ? '초기화(clear)' : '초기화예정(clear)'}: ${counts.clear}, skip: ${counts.skip}, 실패: ${counts.fail}`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
