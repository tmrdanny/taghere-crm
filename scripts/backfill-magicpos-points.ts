/**
 * 매직포스(메타씨티) 연동 매장 고객 포인트 백필 스크립트
 *
 * 배경: 매직포스 매장은 POS 단말 거래가 메타씨티에만 기록되어 CRM `Customer.totalPoints` 가
 *       0/구값으로 남아 고객 관리 페이지에 포인트가 잘못 보인다. 메타씨티(진실원천)에서
 *       현재 잔액(ABLE_POINT)을 가져와 `totalPoints` 를 맞추고 초기 ADJUST 이력을 1건 남긴다.
 *
 * 안전 기본값:
 *   - 기본 DRY-RUN: 거의 모든 경우 read-only. 메타씨티 write(신규 회원 등록)를 유발하는
 *     미해소 고객(metacityCustId 없음)은 dry-run 에서 자동 skip 한다.
 *     단, 캐시된 metacityCustId 가 메타씨티에서 무효(E4001)면 getMetacityPoints 가 재식별
 *     과정에서 custId 갱신/회원 등록 write 를 할 수 있다(드묾).
 *   - 기본적으로 `metacityCustId` 가 이미 있는 고객만 처리한다(확정 회원 → searchPoints 만 호출).
 *   - `INCLUDE_UNRESOLVED=1` 을 줘야 metacityCustId 없는 고객도 처리한다.
 *     이 경우(APPLY 와 함께) 전화번호 검색 후 "없으면 메타씨티에 신규 회원 등록"이 발생할 수 있으니 주의.
 *   - 멱등: 동일 고객에 `backfill:<customerId>` ADJUST 이력이 이미 있으면 skip.
 *
 * 사용법:
 *   # 전체 매직포스 매장, dry-run (조회만)
 *   npx tsx scripts/backfill-magicpos-points.ts
 *
 *   # 특정 매장만 (slug 또는 store id)
 *   npx tsx scripts/backfill-magicpos-points.ts <slug-or-id> [<slug-or-id> ...]
 *
 *   # 실제 반영
 *   APPLY=1 npx tsx scripts/backfill-magicpos-points.ts <slug-or-id>
 *
 *   # metacityCustId 없는 고객까지 포함 (신규 회원 등록 발생 가능)
 *   APPLY=1 INCLUDE_UNRESOLVED=1 npx tsx scripts/backfill-magicpos-points.ts <slug-or-id>
 */
import { PrismaClient } from '@prisma/client';
import { getMetacityPoints } from '../apps/api/src/services/metacity.js';

const prisma = new PrismaClient();

const APPLY = process.env.APPLY === '1';
const INCLUDE_UNRESOLVED = process.env.INCLUDE_UNRESOLVED === '1';
const THROTTLE_MS = Number(process.env.THROTTLE_MS || 200);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const targets = process.argv.slice(2);

  // 1. 대상 매장 조회 (metacityEnabled + storeIdx 존재)
  const stores = await prisma.store.findMany({
    where: {
      metacityEnabled: true,
      metacityStoreIdx: { not: null },
      ...(targets.length > 0 ? { OR: [{ slug: { in: targets } }, { id: { in: targets } }] } : {}),
    },
    select: { id: true, name: true, slug: true, metacityEnabled: true, metacityStoreIdx: true },
  });

  if (stores.length === 0) {
    console.log('대상 매직포스 매장이 없습니다. (metacityEnabled=true, metacityStoreIdx 존재)');
    return;
  }

  console.log(`\n=== 매직포스 포인트 백필 ${APPLY ? '[APPLY]' : '[DRY-RUN]'} ===`);
  console.log(`대상 매장: ${stores.length}개${targets.length ? ` (필터: ${targets.join(', ')})` : ''}`);
  console.log(`미해소 고객 포함(INCLUDE_UNRESOLVED): ${INCLUDE_UNRESOLVED ? 'YES' : 'NO'}\n`);

  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (const store of stores) {
    const customers = await prisma.customer.findMany({
      where: {
        storeId: store.id,
        ...(INCLUDE_UNRESOLVED ? {} : { metacityCustId: { not: null } }),
      },
      select: {
        id: true,
        phone: true,
        name: true,
        gender: true,
        ageGroup: true,
        birthday: true,
        birthYear: true,
        consentMarketing: true,
        metacityCustId: true,
        totalPoints: true,
      },
    });

    console.log(`\n[${store.name} (${store.slug ?? store.id})] 고객 ${customers.length}명`);

    for (const customer of customers) {
      totalProcessed++;

      if (!customer.phone) {
        console.log(`  - skip(전화번호 없음): ${customer.id}`);
        totalSkipped++;
        continue;
      }

      // 멱등: 이미 백필된 고객은 skip
      const existing = await prisma.pointLedger.findFirst({
        where: { storeId: store.id, externalTxId: `backfill:${customer.id}` },
        select: { id: true },
      });
      if (existing) {
        totalSkipped++;
        continue;
      }

      // DRY-RUN 은 부작용이 없어야 한다. metacityCustId 없는 고객은 getMetacityPoints 가
      // ensureMetacityMember 로 "메타씨티에 신규 회원 등록(write)"을 유발하므로 dry-run 에선 skip.
      if (!APPLY && !customer.metacityCustId) {
        console.log(`  - [dry-run] skip(미해소 고객, 등록 부작용 회피): ${customer.id}`);
        totalSkipped++;
        continue;
      }

      try {
        const { ablePoint } = await getMetacityPoints({
          store: { id: store.id, metacityEnabled: true, metacityStoreIdx: store.metacityStoreIdx! },
          customer,
        });

        if (customer.totalPoints === ablePoint) {
          // 이미 일치 — 이력만 남기지 않고 skip (멱등 목적의 ADJUST 도 생략)
          totalSkipped++;
        } else if (APPLY) {
          await prisma.$transaction([
            prisma.pointLedger.create({
              data: {
                storeId: store.id,
                customerId: customer.id,
                delta: ablePoint - customer.totalPoints,
                balance: ablePoint,
                type: 'ADJUST',
                reason: '메타씨티 초기 동기화 (백필)',
                externalTxId: `backfill:${customer.id}`,
              },
            }),
            prisma.customer.update({
              where: { id: customer.id },
              data: { totalPoints: ablePoint },
            }),
          ]);
          console.log(`  - 반영: ${customer.id} ${customer.totalPoints} → ${ablePoint}`);
          totalUpdated++;
        } else {
          console.log(`  - [dry-run] ${customer.id} ${customer.totalPoints} → ${ablePoint}`);
          totalUpdated++;
        }
      } catch (err: any) {
        console.warn(`  - 실패: ${customer.id} (${err?.message})`);
        totalFailed++;
      }

      await sleep(THROTTLE_MS);
    }
  }

  console.log(`\n=== 완료 ===`);
  console.log(`처리: ${totalProcessed}, ${APPLY ? '반영' : '반영예정'}: ${totalUpdated}, skip: ${totalSkipped}, 실패: ${totalFailed}`);
  if (!APPLY) console.log('\nDRY-RUN 입니다. 실제 반영하려면 APPLY=1 을 붙여 다시 실행하세요.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
    // getMetacityPoints 가 자체 PrismaClient 커넥션을 열어두므로 명시 종료
    process.exit(0);
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
