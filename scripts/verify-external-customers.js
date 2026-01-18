const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verifyExternalCustomers() {
  console.log('=== ExternalCustomer 데이터 검증 ===\n');

  // 1. 전체 개수
  const total = await prisma.externalCustomer.count();
  console.log(`전체 고객: ${total}건`);

  // 2. 날짜별 분포
  const byDate = await prisma.$queryRaw`
    SELECT
      DATE("createdAt") as date,
      COUNT(*) as count
    FROM external_customers
    GROUP BY DATE("createdAt")
    ORDER BY DATE("createdAt") DESC
    LIMIT 10
  `;

  console.log('\n최근 생성 날짜별 분포:');
  byDate.forEach(row => {
    const dateStr = row.date instanceof Date ? row.date.toISOString().split('T')[0] : row.date;
    console.log(`  ${dateStr}: ${Number(row.count)}건`);
  });

  // 3. 지역별 분포
  const byRegion = await prisma.externalCustomer.groupBy({
    by: ['regionSido'],
    _count: true,
    orderBy: {
      _count: {
        regionSido: 'desc'
      }
    },
    take: 10
  });

  console.log('\n지역별 분포 (상위 10개):');
  byRegion.forEach(r => {
    console.log(`  ${r.regionSido}: ${r._count}건`);
  });

  // 4. 연령대별 분포
  const byAge = await prisma.externalCustomer.groupBy({
    by: ['ageGroup'],
    _count: true
  });

  console.log('\n연령대별 분포:');
  byAge.forEach(a => {
    console.log(`  ${a.ageGroup}: ${a._count}건`);
  });

  await prisma.$disconnect();
}

verifyExternalCustomers().catch(console.error);
