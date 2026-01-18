/**
 * 고객 지역 정보 채우기 스크립트
 * Customer의 storeId를 기반으로 regionSido, regionSigungu를 채웁니다.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function populateCustomerRegions() {
  console.log('👥 고객 지역 정보 채우기 시작...\n');

  try {
    // 지역 정보가 없는 고객 수 조회
    const totalCustomersWithoutRegion = await prisma.customer.count({
      where: {
        regionSido: null,
      },
    });

    console.log(`📊 지역 정보가 없는 고객: ${totalCustomersWithoutRegion}명\n`);

    if (totalCustomersWithoutRegion === 0) {
      console.log('✅ 모든 고객의 지역 정보가 이미 설정되어 있습니다.');
      return;
    }

    let successCount = 0;
    let failCount = 0;
    let batchNumber = 1;
    const batchSize = 1000; // 한 번에 처리할 고객 수

    while (true) {
      // 배치 단위로 고객 조회
      const customers = await prisma.customer.findMany({
        where: {
          regionSido: null,
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

      // 배치 업데이트를 위한 데이터 준비
      const updates: Array<{ id: string; regionSido: string | null; regionSigungu: string | null }> = [];

      for (const customer of customers) {
        if (customer.store.addressSido && customer.store.addressSigungu) {
          updates.push({
            id: customer.id,
            regionSido: customer.store.addressSido,
            regionSigungu: customer.store.addressSigungu,
          });
        } else {
          // 매장에 정규화된 주소가 없는 경우
          failCount++;
        }
      }

      // 배치 업데이트 실행
      if (updates.length > 0) {
        await Promise.all(
          updates.map((update) =>
            prisma.customer.update({
              where: { id: update.id },
              data: {
                regionSido: update.regionSido,
                regionSigungu: update.regionSigungu,
              },
            })
          )
        );

        successCount += updates.length;
        console.log(`   ✅ ${updates.length}명의 고객 정보 업데이트 완료`);
      }

      if (failCount > 0) {
        console.log(`   ⚠️  ${failCount}명은 매장 주소 정보가 없어 건너뛰었습니다`);
      }

      batchNumber++;

      // 진행률 표시
      const progress = ((successCount + failCount) / totalCustomersWithoutRegion) * 100;
      console.log(`   📊 진행률: ${progress.toFixed(1)}% (${successCount + failCount}/${totalCustomersWithoutRegion})`);
    }

    console.log('\n' + '='.repeat(50));
    console.log('📈 고객 지역 정보 채우기 완료 통계:');
    console.log(`   ✅ 성공: ${successCount}명`);
    console.log(`   ❌ 실패 (매장 주소 없음): ${failCount}명`);
    console.log(`   📊 총: ${successCount + failCount}명`);
    console.log('='.repeat(50));

    if (failCount > 0) {
      console.log('\n⚠️  일부 고객은 매장의 주소 정보가 없어 업데이트하지 못했습니다.');
      console.log('   먼저 normalize-store-addresses 스크립트를 실행하여 매장 주소를 정규화해주세요.');
    }
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
