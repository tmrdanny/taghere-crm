/**
 * 고객 스탬프 재계산 스크립트
 * StampLedger의 최신 balance 값을 기준으로 Customer의 totalStamps를 재계산합니다.
 *
 * 실행 방법:
 * cd apps/api && npx ts-node src/scripts/recalculate-customer-stamps.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function recalculateCustomerStamps() {
  console.log('📋 고객 스탬프 재계산 시작...\n');

  try {
    // 1. 현재 상태 조회
    const totalCustomers = await prisma.customer.count();
    const customersWithStamps = await prisma.customer.count({
      where: { totalStamps: { gt: 0 } },
    });
    const customersWithZeroStamps = await prisma.customer.count({
      where: { totalStamps: 0 },
    });

    console.log('📊 현재 상태:');
    console.log(`   - 전체 고객: ${totalCustomers}명`);
    console.log(`   - 스탬프 보유 (>0): ${customersWithStamps}명`);
    console.log(`   - 스탬프 0개: ${customersWithZeroStamps}명\n`);

    // 2. StampLedger가 있지만 totalStamps가 0인 고객 찾기
    const customersWithMismatch = await prisma.$queryRaw<
      Array<{ customerId: string; totalStamps: number; latestBalance: number; earnCount: bigint }>
    >`
      SELECT
        c.id as "customerId",
        c."totalStamps",
        COALESCE(
          (SELECT sl.balance FROM "StampLedger" sl
           WHERE sl."customerId" = c.id
           ORDER BY sl."createdAt" DESC
           LIMIT 1),
          0
        ) as "latestBalance",
        (SELECT COUNT(*) FROM "StampLedger" sl2
         WHERE sl2."customerId" = c.id AND sl2.type = 'EARN') as "earnCount"
      FROM "Customer" c
      WHERE c."totalStamps" != COALESCE(
        (SELECT sl3.balance FROM "StampLedger" sl3
         WHERE sl3."customerId" = c.id
         ORDER BY sl3."createdAt" DESC
         LIMIT 1),
        0
      )
    `;

    console.log(`🔍 불일치 발견: ${customersWithMismatch.length}명\n`);

    if (customersWithMismatch.length === 0) {
      console.log('✅ 모든 고객의 스탬프가 정확합니다.');
      return;
    }

    // 3. 불일치 고객 상세 표시 (최대 20명)
    console.log('📋 불일치 고객 목록 (최대 20명):');
    console.log('   ID | 현재 totalStamps | 최신 ledger balance | EARN 횟수');
    console.log('   ---|-----------------|--------------------|---------');

    for (const customer of customersWithMismatch.slice(0, 20)) {
      console.log(
        `   ${customer.customerId.substring(0, 8)}... | ${customer.totalStamps} | ${customer.latestBalance} | ${customer.earnCount}`
      );
    }

    if (customersWithMismatch.length > 20) {
      console.log(`   ... 외 ${customersWithMismatch.length - 20}명\n`);
    } else {
      console.log('');
    }

    // 4. 수정 실행
    console.log(`🔄 ${customersWithMismatch.length}명의 고객 스탬프 수정 중...`);

    let updatedCount = 0;
    for (const customer of customersWithMismatch) {
      await prisma.customer.update({
        where: { id: customer.customerId },
        data: { totalStamps: customer.latestBalance },
      });
      updatedCount++;

      if (updatedCount % 100 === 0) {
        console.log(`   진행 중: ${updatedCount}/${customersWithMismatch.length}`);
      }
    }

    console.log(`\n✅ 업데이트 완료: ${updatedCount}명`);

    // 5. 업데이트 후 상태 확인
    const afterCustomersWithStamps = await prisma.customer.count({
      where: { totalStamps: { gt: 0 } },
    });

    console.log('\n📊 업데이트 후 상태:');
    console.log(`   - 스탬프 보유 (>0): ${afterCustomersWithStamps}명`);
    console.log(`   - 증가: +${afterCustomersWithStamps - customersWithStamps}명`);
  } catch (error) {
    console.error('❌ 오류 발생:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 스크립트 실행
if (require.main === module) {
  recalculateCustomerStamps()
    .then(() => {
      console.log('\n✨ 스크립트 실행 완료');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 스크립트 실행 실패:', error);
      process.exit(1);
    });
}

export { recalculateCustomerStamps };
