// E2E 테스트용 고객 데이터 시드.
// TEST_USER(danny@tmr.com) 매장에 다양한 고객을 생성해 customers/points/messages
// E2E 스펙이 통과할 수 있게 한다. memo='E2E_SEED'로 멱등 처리.
//
// 실행: DATABASE_URL 환경변수 필요.
//   export $(grep -E '^DATABASE_URL=' .env | xargs) && node scripts/seed-e2e-test-data.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TEST_USER_EMAIL = 'danny@tmr.com';

function lastDigits(phone) {
  return phone.replace(/[^0-9]/g, '').slice(-8);
}

async function main() {
  const user = await prisma.staffUser.findUnique({
    where: { email: TEST_USER_EMAIL },
    select: { storeId: true },
  });
  if (!user) {
    console.error(`테스트 계정 없음: ${TEST_USER_EMAIL} — 먼저 계정을 생성하세요.`);
    process.exit(1);
  }
  const storeId = user.storeId;

  const del = await prisma.customer.deleteMany({ where: { storeId, memo: 'E2E_SEED' } });
  console.log('기존 시드 삭제:', del.count);

  const genders = ['MALE', 'FEMALE'];
  const birthYears = [1965, 1972, 1978, 1985, 1990, 1995, 2000];
  const rows = [{ name: '테스트 고객', phone: '010-9876-5432', gender: 'FEMALE', birthYear: 1990 }];
  for (let i = 1; i <= 24; i++) {
    rows.push({
      name: `고객${i}`,
      phone: `010-${String(1000 + i).padStart(4, '0')}-${String(1000 + i * 3).padStart(4, '0')}`,
      gender: genders[i % 2],
      birthYear: birthYears[i % birthYears.length],
    });
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    await prisma.customer.create({
      data: {
        storeId,
        name: r.name,
        phone: r.phone,
        phoneLastDigits: lastDigits(r.phone),
        gender: r.gender,
        birthYear: r.birthYear,
        totalPoints: (i % 5) * 1000,
        totalStamps: i % 10,
        visitCount: (i % 6) + 1,
        lastVisitAt: new Date(Date.now() - i * 86400000),
        consentMarketing: true,
        consentAt: new Date(),
        memo: 'E2E_SEED',
      },
    });
  }
  console.log('시드된 고객:', rows.length, '→ 매장', storeId);
}

main().finally(() => prisma.$disconnect());
