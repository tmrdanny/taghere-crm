/**
 * 고객 지역 정보 채우기 스크립트
 * Customer의 storeId를 기반으로 regionSido, regionSigungu를 채웁니다.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function populateCustomerRegions() {
  console.log('👥 고객 지역 정보 채우기 시작...\n');

  try {
    const totalCustomersNoRegionAll = await prisma.customer.count({
      where: { regionSido: null },
    });

    // 매장에 정규화된 주소가 있는 고객만 대상
    const totalCustomersWithoutRegion = await prisma.customer.count({
      where: {
        regionSido: null,
        store: {
          addressSido: { not: null },
          addressSigungu: { not: null },
        },
      },
    });

    console.log(`📊 지역 정보가 없는 고객: ${totalCustomersNoRegionAll}명`);
    console.log(`📊 매장 주소로 채울 수 있는 고객: ${totalCustomersWithoutRegion}명`);
    console.log(`📊 매장 주소 없어 채울 수 없는 고객: ${totalCustomersNoRegionAll - totalCustomersWithoutRegion}명\n`);

    if (totalCustomersWithoutRegion === 0) {
      console.log('✅ 채울 수 있는 고객이 없습니다.');
      return;
    }

    let successCount = 0;
    let batchNumber = 1;
    const batchSize = 1000;

    while (true) {
      // 매장 주소가 있는 고객만 조회 → 무한루프 방지
      const customers = await prisma.customer.findMany({
        where: {
          regionSido: null,
          store: {
            addressSido: { not: null },
            addressSigungu: { not: null },
          },
        },
        include: {
          store: {
            select: {
              id: true,
              name: true,
              addressSido: true,
              addressSigungu: true,
            },
          },
        },
        take: batchSize,
      });

      if (customers.length === 0) {
        break;
      }

      console.log(`\n📦 배치 #${batchNumber} 처리 중 (${customers.length}명)...`);

      // 커넥션 풀 초과 방지: 50개씩 나눠서 트랜잭션 처리
      const chunkSize = 50;
      for (let i = 0; i < customers.length; i += chunkSize) {
        const chunk = customers.slice(i, i + chunkSize);
        await prisma.$transaction(
          chunk.map((customer) =>
            prisma.customer.update({
              where: { id: customer.id },
              data: {
                regionSido: customer.store.addressSido,
                regionSigungu: customer.store.addressSigungu,
              },
            })
          )
        );
      }

      successCount += customers.length;
      console.log(`   ✅ ${customers.length}명 업데이트 완료`);

      batchNumber++;

      const progress = (successCount / totalCustomersWithoutRegion) * 100;
      console.log(`   📊 진행률: ${progress.toFixed(1)}% (${successCount}/${totalCustomersWithoutRegion})`);
    }

    console.log('\n' + '='.repeat(50));
    console.log('📈 고객 지역 정보 채우기 완료 통계:');
    console.log(`   ✅ 성공: ${successCount}명`);
    console.log(`   ⏭️  매장 주소 없음: ${totalCustomersNoRegionAll - totalCustomersWithoutRegion}명`);
    console.log(`   📊 총: ${totalCustomersNoRegionAll}명`);
    console.log('='.repeat(50));
  } catch (error) {
    console.error('❌ 오류 발생:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 스크립트 실행
if (require.main === module) {
  populateCustomerRegions()
    .then(() => {
      console.log('\n✨ 스크립트 실행 완료');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 스크립트 실행 실패:', error);
      process.exit(1);
    });
}

export { populateCustomerRegions };
