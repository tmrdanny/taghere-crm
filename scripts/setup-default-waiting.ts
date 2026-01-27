import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Setting up default waiting settings for all stores...\n');

  // 1. 모든 매장 조회
  const stores = await prisma.store.findMany({
    select: { id: true, name: true },
  });

  console.log(`Found ${stores.length} stores total\n`);

  let settingsCreated = 0;
  let settingsUpdated = 0;
  let typesCreated = 0;

  for (const store of stores) {
    // 2. WaitingSetting 확인 및 생성/업데이트
    const existingSetting = await prisma.waitingSetting.findUnique({
      where: { storeId: store.id },
    });

    if (!existingSetting) {
      // WaitingSetting이 없으면 새로 생성 (접수 중 상태)
      await prisma.waitingSetting.create({
        data: {
          storeId: store.id,
          operationStatus: 'ACCEPTING',
        },
      });
      settingsCreated++;
      console.log(`  [CREATE] ${store.name}: WaitingSetting created (ACCEPTING)`);
    } else if (existingSetting.operationStatus !== 'ACCEPTING') {
      // 기존 설정이 있지만 ACCEPTING이 아니면 업데이트
      await prisma.waitingSetting.update({
        where: { storeId: store.id },
        data: { operationStatus: 'ACCEPTING' },
      });
      settingsUpdated++;
      console.log(`  [UPDATE] ${store.name}: WaitingSetting updated to ACCEPTING`);
    }

    // 3. WaitingType 확인 및 생성
    const existingTypes = await prisma.waitingType.findMany({
      where: { storeId: store.id },
    });

    if (existingTypes.length === 0) {
      // WaitingType이 없으면 기본 "홀" 유형 생성
      await prisma.waitingType.create({
        data: {
          storeId: store.id,
          name: '홀',
          avgWaitTimePerTeam: 5,
          sortOrder: 0,
          isActive: true,
        },
      });
      typesCreated++;
      console.log(`  [CREATE] ${store.name}: WaitingType "홀" (5분) created`);
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Total stores: ${stores.length}`);
  console.log(`WaitingSettings created: ${settingsCreated}`);
  console.log(`WaitingSettings updated: ${settingsUpdated}`);
  console.log(`WaitingTypes created: ${typesCreated}`);
  console.log('\nDone!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
