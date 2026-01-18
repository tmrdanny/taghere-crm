/**
 * 고객 마케팅 동의 일괄 업데이트 스크립트
 * 기존 고객 중 consentMarketing이 null/false인 고객을 true로 업데이트합니다.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updateCustomerConsent() {
  console.log('📋 고객 마케팅 동의 일괄 업데이트 시작...\n');

  try {
    // 현재 상태 조회
    const totalCustomers = await prisma.customer.count();
    const consentedCustomers = await prisma.customer.count({
      where: { consentMarketing: true },
    });
    const nonConsentedCustomers = await prisma.customer.count({
      where: {
        NOT: { consentMarketing: true },
      },
    });

    console.log('📊 현재 상태:');
    console.log(`   - 전체 고객: ${totalCustomers}명`);
    console.log(`   - 마케팅 동의 완료: ${consentedCustomers}명`);
    console.log(`   - 마케팅 동의 미설정: ${nonConsentedCustomers}명\n`);

    if (nonConsentedCustomers === 0) {
      console.log('✅ 모든 고객이 이미 마케팅 동의 처리되어 있습니다.');
      return;
    }

    // 일괄 업데이트
    console.log(`🔄 ${nonConsentedCustomers}명의 고객 마케팅 동의 처리 중...`);

    const result = await prisma.customer.updateMany({
      where: {
        NOT: { consentMarketing: true },
      },
      data: {
        consentMarketing: true,
        consentAt: new Date(),
      },
    });

    console.log(`\n✅ 업데이트 완료: ${result.count}명`);

    // 업데이트 후 상태 확인
    const afterConsentedCustomers = await prisma.customer.count({
      where: { consentMarketing: true },
    });

    console.log('\n📊 업데이트 후 상태:');
    console.log(`   - 전체 고객: ${totalCustomers}명`);
    console.log(`   - 마케팅 동의 완료: ${afterConsentedCustomers}명`);
  } catch (error) {
    console.error('❌ 오류 발생:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 스크립트 실행
if (require.main === module) {
  updateCustomerConsent()
    .then(() => {
      console.log('\n✨ 스크립트 실행 완료');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 스크립트 실행 실패:', error);
      process.exit(1);
    });
}

export { updateCustomerConsent };
