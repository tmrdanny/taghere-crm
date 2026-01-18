/**
 * 매장 주소 정규화 스크립트
 * Store.address를 파싱하여 addressSido, addressSigungu, addressDetail 필드를 채웁니다.
 */

import { PrismaClient } from '@prisma/client';
import { parseKoreanAddress } from '../utils/address-parser';

const prisma = new PrismaClient();

async function normalizeStoreAddresses() {
  console.log('🏪 매장 주소 정규화 시작...\n');

  try {
    // 주소가 있는 모든 매장 조회
    const stores = await prisma.store.findMany({
      where: {
        address: {
          not: null,
        },
      },
      select: {
        id: true,
        name: true,
        address: true,
        addressSido: true,
        addressSigungu: true,
        addressDetail: true,
      },
    });

    console.log(`📊 총 ${stores.length}개의 매장 발견\n`);

    let successCount = 0;
    let failCount = 0;
    let skipCount = 0;

    for (const store of stores) {
      // 이미 정규화되어 있으면 건너뛰기
      if (store.addressSido && store.addressSigungu) {
        console.log(`⏭️  건너뛰기: ${store.name} (이미 정규화됨)`);
        skipCount++;
        continue;
      }

      // 주소 파싱
      const { sido, sigungu, detail } = parseKoreanAddress(store.address!);

      if (!sido) {
        console.log(`❌ 실패: ${store.name}`);
        console.log(`   주소: ${store.address}`);
        console.log(`   사유: 시/도를 찾을 수 없음\n`);
        failCount++;
        continue;
      }

      // DB 업데이트
      await prisma.store.update({
        where: { id: store.id },
        data: {
          addressSido: sido,
          addressSigungu: sigungu,
          addressDetail: detail,
        },
      });

      console.log(`✅ 성공: ${store.name}`);
      console.log(`   원본: ${store.address}`);
      console.log(`   시/도: ${sido}`);
      console.log(`   시/군/구: ${sigungu || '(없음)'}`);
      console.log(`   상세: ${detail || '(없음)'}\n`);
      successCount++;
    }

    console.log('\n='.repeat(50));
    console.log('📈 정규화 완료 통계:');
    console.log(`   ✅ 성공: ${successCount}개`);
    console.log(`   ⏭️  건너뛰기: ${skipCount}개`);
    console.log(`   ❌ 실패: ${failCount}개`);
    console.log(`   📊 총: ${stores.length}개`);
    console.log('='.repeat(50));

    if (failCount > 0) {
      console.log('\n⚠️  일부 매장의 주소를 파싱하지 못했습니다.');
      console.log('   수동으로 확인하여 수정해주세요.');
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
  normalizeStoreAddresses()
    .then(() => {
      console.log('\n✨ 스크립트 실행 완료');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 스크립트 실행 실패:', error);
      process.exit(1);
    });
}

export { normalizeStoreAddresses };
