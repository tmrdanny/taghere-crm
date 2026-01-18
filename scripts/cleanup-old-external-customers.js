const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanupOldExternalCustomers() {
  const cutoffDate = new Date('2026-01-13T00:00:00+09:00');

  console.log(`삭제 기준 날짜: ${cutoffDate.toISOString()}`);
  console.log(`이 날짜 이전에 생성된 ExternalCustomer 데이터를 삭제합니다.\n`);

  // 1. 삭제 대상 확인
  const toDelete = await prisma.externalCustomer.findMany({
    where: {
      createdAt: {
        lt: cutoffDate
      }
    },
    select: {
      id: true,
      phone: true,
      createdAt: true,
      _count: {
        select: {
          weeklySlots: true,
          sentMessages: true
        }
      }
    }
  });

  console.log(`삭제 대상 ExternalCustomer: ${toDelete.length}건`);

  if (toDelete.length > 0) {
    const totalSlots = toDelete.reduce((sum, c) => sum + c._count.weeklySlots, 0);
    const totalMessages = toDelete.reduce((sum, c) => sum + c._count.sentMessages, 0);

    console.log(`  - 연관된 WeeklySlots: ${totalSlots}건 (자동 삭제)`);
    console.log(`  - 연관된 SmsMessages: ${totalMessages}건 (자동 삭제)`);
    console.log(`\n첫 5개 샘플:`);
    toDelete.slice(0, 5).forEach(c => {
      console.log(`  - ${c.phone} (생성: ${c.createdAt.toISOString()})`);
    });
  }

  // 2. 보존 대상 확인
  const toKeep = await prisma.externalCustomer.count({
    where: {
      createdAt: {
        gte: cutoffDate
      }
    }
  });

  console.log(`\n보존 대상 ExternalCustomer: ${toKeep}건`);

  // 3. 사용자 확인
  console.log(`\n⚠️  위 데이터를 삭제하려면 코드에서 confirmDelete를 true로 설정하세요.`);

  const confirmDelete = true; // ← 실행 시 true로 변경

  if (!confirmDelete) {
    console.log(`삭제 취소됨.`);
    await prisma.$disconnect();
    return;
  }

  // 4. 실제 삭제
  console.log(`\n삭제 시작...`);

  const result = await prisma.externalCustomer.deleteMany({
    where: {
      createdAt: {
        lt: cutoffDate
      }
    }
  });

  console.log(`✅ 삭제 완료: ${result.count}건`);

  // 5. 최종 확인
  const remaining = await prisma.externalCustomer.count();
  console.log(`\n현재 남은 ExternalCustomer: ${remaining}건`);

  await prisma.$disconnect();
}

cleanupOldExternalCustomers().catch(console.error);
