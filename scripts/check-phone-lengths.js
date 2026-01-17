const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkPhoneLengths() {
  const all = await prisma.externalCustomer.findMany({
    select: { id: true, phone: true }
  });

  const wrongLength = all.filter(c => c.phone.length !== 11);

  console.log(`전체 고객: ${all.length}`);
  console.log(`잘못된 길이: ${wrongLength.length}`);

  if (wrongLength.length > 0) {
    console.log('\n길이별 분포:');
    const distribution = {};
    wrongLength.forEach(c => {
      const len = c.phone.length;
      distribution[len] = (distribution[len] || 0) + 1;
    });
    Object.entries(distribution).forEach(([len, count]) => {
      console.log(`  ${len}자리: ${count}건`);
    });

    console.log('\n잘못된 번호 예시 (처음 20개):');
    wrongLength.slice(0, 20).forEach(c => {
      console.log(`  ${c.phone} (길이: ${c.phone.length})`);
    });
  }

  await prisma.$disconnect();
}

checkPhoneLengths().catch(console.error);
