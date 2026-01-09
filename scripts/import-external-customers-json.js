const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// 데이터를 여기에 직접 포함 (JSON 파일 대신)
const customersData = require('./external-customers-data.json');

async function main() {
  console.log(`Total customers to import: ${customersData.length}`);

  // 기존 데이터 삭제
  console.log('Clearing existing external customers...');
  await prisma.externalCustomerWeeklySlot.deleteMany({});
  await prisma.externalSmsMessage.deleteMany({});
  await prisma.externalCustomer.deleteMany({});

  // 배치로 삽입
  const batchSize = 100;
  let successCount = 0;

  for (let i = 0; i < customersData.length; i += batchSize) {
    const batch = customersData.slice(i, i + batchSize).map(c => ({
      phone: c.phone,
      ageGroup: c.ageGroup,
      gender: c.gender,
      regionSido: c.regionSido,
      regionSigungu: c.regionSigungu,
      consentMarketing: true,
      consentAt: new Date(),
    }));

    try {
      await prisma.externalCustomer.createMany({
        data: batch,
        skipDuplicates: true,
      });
      successCount += batch.length;
      console.log(`Processed ${Math.min(i + batchSize, customersData.length)} / ${customersData.length}`);
    } catch (error) {
      console.error(`Batch error at ${i}:`, error.message);
    }
  }

  console.log('\n=== Import Complete ===');
  console.log(`Success: ${successCount}`);

  // 통계 확인
  const totalInDb = await prisma.externalCustomer.count();
  console.log(`Total in DB: ${totalInDb}`);

  const byRegion = await prisma.externalCustomer.groupBy({
    by: ['regionSido'],
    _count: true,
  });
  console.log('\nBy Region:');
  byRegion.forEach(r => console.log(`  ${r.regionSido}: ${r._count}`));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
