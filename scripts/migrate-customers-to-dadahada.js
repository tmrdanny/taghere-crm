const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// 마이그레이션 대상
const SOURCE_STORE_ID = 'cmjs2o2xz002cuh0wvxknsmoy'; // 마쿠쿠치나
const TARGET_STORE_ID = 'cmjs2qjgh002guh0w2oqeegk8'; // 다다하다 하단동아대점

// 이전할 고객의 전화번호 뒷자리 4개
const PHONE_LAST_4_DIGITS = ['6881', '5051', '9718', '5424', '7313', '6491'];

async function main() {
  console.log('=== 고객 마이그레이션 시작 ===\n');
  console.log(`원본 매장 (마쿠쿠치나): ${SOURCE_STORE_ID}`);
  console.log(`대상 매장 (다다하다): ${TARGET_STORE_ID}`);
  console.log(`이전 대상 전화번호 뒷자리: ${PHONE_LAST_4_DIGITS.join(', ')}\n`);

  // 1. 대상 고객 찾기
  const customers = await prisma.customer.findMany({
    where: {
      storeId: SOURCE_STORE_ID,
      OR: PHONE_LAST_4_DIGITS.map(digits => ({
        phoneLastDigits: { endsWith: digits }
      }))
    },
    include: {
      visitsOrOrders: true,
      pointLedger: true,
    }
  });

  console.log(`찾은 고객 수: ${customers.length}\n`);

  if (customers.length === 0) {
    console.log('이전할 고객이 없습니다.');
    return;
  }

  // 고객 정보 출력
  console.log('--- 이전 대상 고객 목록 ---');
  for (const c of customers) {
    console.log(`- ${c.name || '이름없음'} (${c.phone || c.phoneLastDigits})`);
    console.log(`  포인트: ${c.totalPoints}, 방문: ${c.visitCount}회`);
    console.log(`  주문내역: ${c.visitsOrOrders.length}건, 포인트내역: ${c.pointLedger.length}건`);
  }
  console.log('');

  // 2. 대상 매장에 동일 전화번호 고객이 있는지 확인
  console.log('--- 대상 매장 중복 체크 ---');
  for (const c of customers) {
    if (c.phoneLastDigits) {
      const existing = await prisma.customer.findFirst({
        where: {
          storeId: TARGET_STORE_ID,
          phoneLastDigits: c.phoneLastDigits,
        }
      });
      if (existing) {
        console.log(`⚠️  주의: ${c.phoneLastDigits} - 대상 매장에 이미 존재 (병합 필요)`);
      }
    }
  }
  console.log('');

  // 3. 트랜잭션으로 마이그레이션 실행
  console.log('--- 마이그레이션 실행 ---');

  for (const customer of customers) {
    console.log(`\n처리 중: ${customer.name || customer.phoneLastDigits}`);

    try {
      await prisma.$transaction(async (tx) => {
        // 3-1. Customer 레코드의 storeId 변경
        await tx.customer.update({
          where: { id: customer.id },
          data: { storeId: TARGET_STORE_ID }
        });
        console.log(`  ✓ Customer storeId 변경`);

        // 3-2. VisitOrOrder의 storeId 변경
        if (customer.visitsOrOrders.length > 0) {
          await tx.visitOrOrder.updateMany({
            where: { customerId: customer.id },
            data: { storeId: TARGET_STORE_ID }
          });
          console.log(`  ✓ VisitOrOrder ${customer.visitsOrOrders.length}건 이전`);
        }

        // 3-3. PointLedger의 storeId 변경
        if (customer.pointLedger.length > 0) {
          await tx.pointLedger.updateMany({
            where: { customerId: customer.id },
            data: { storeId: TARGET_STORE_ID }
          });
          console.log(`  ✓ PointLedger ${customer.pointLedger.length}건 이전`);
        }

      });

      console.log(`  ✅ 완료`);
    } catch (error) {
      console.error(`  ❌ 실패:`, error.message);
    }
  }

  // 4. 결과 확인
  console.log('\n\n=== 마이그레이션 결과 ===');

  const migratedCustomers = await prisma.customer.findMany({
    where: {
      storeId: TARGET_STORE_ID,
      OR: PHONE_LAST_4_DIGITS.map(digits => ({
        phoneLastDigits: { endsWith: digits }
      }))
    },
    include: {
      visitsOrOrders: true,
      pointLedger: true,
    }
  });

  console.log(`다다하다 매장으로 이전된 고객: ${migratedCustomers.length}명`);
  for (const c of migratedCustomers) {
    const orderCount = c.visitsOrOrders.length;
    const pointCount = c.pointLedger.length;
    console.log(`- ${c.name || '이름없음'} (${c.phone || c.phoneLastDigits}): 주문 ${orderCount}건, 포인트내역 ${pointCount}건`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
