/**
 * Customer.regionSido 정규화 스크립트
 * 정식명칭(서울특별시, 경기도)을 줄임말(서울, 경기)로 변환합니다.
 * ExternalCustomer와 일관된 형식으로 통일합니다.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SIDO_FULL_TO_SHORT: Record<string, string> = {
  서울특별시: '서울',
  경기도: '경기',
  인천광역시: '인천',
  부산광역시: '부산',
  대구광역시: '대구',
  광주광역시: '광주',
  대전광역시: '대전',
  울산광역시: '울산',
  세종특별자치시: '세종',
  강원특별자치도: '강원',
  강원도: '강원',
  충청북도: '충북',
  충청남도: '충남',
  전북특별자치도: '전북',
  전라북도: '전북',
  전라남도: '전남',
  경상북도: '경북',
  경상남도: '경남',
  제주특별자치도: '제주',
};

async function normalizeCustomerRegionSido() {
  console.log('🔄 Customer regionSido 정규화 시작 (정식명칭 → 줄임말)...\n');

  try {
    // 정식명칭을 가진 고객 조회
    const fullNames = Object.keys(SIDO_FULL_TO_SHORT);

    let totalUpdated = 0;

    for (const fullName of fullNames) {
      const shortName = SIDO_FULL_TO_SHORT[fullName];

      const count = await prisma.customer.count({
        where: { regionSido: fullName },
      });

      if (count === 0) continue;

      const result = await prisma.customer.updateMany({
        where: { regionSido: fullName },
        data: { regionSido: shortName },
      });

      console.log(`  ✅ ${fullName} → ${shortName}: ${result.count}명`);
      totalUpdated += result.count;
    }

    // 변환 결과 확인
    const remainingFull = await prisma.customer.groupBy({
      by: ['regionSido'],
      where: { regionSido: { not: null } },
      _count: { _all: true },
    });

    console.log('\n📊 변환 후 regionSido 분포:');
    remainingFull.forEach((item) => {
      console.log(`  ${item.regionSido}: ${item._count._all}명`);
    });

    console.log(`\n✅ 총 ${totalUpdated}명 변환 완료`);
  } catch (error) {
    console.error('❌ 오류 발생:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  normalizeCustomerRegionSido()
    .then(() => {
      console.log('\n✨ 스크립트 실행 완료');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 스크립트 실행 실패:', error);
      process.exit(1);
    });
}

export { normalizeCustomerRegionSido };
