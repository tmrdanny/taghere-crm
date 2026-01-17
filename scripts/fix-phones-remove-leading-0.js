const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixPhones() {
  const all = await prisma.externalCustomer.findMany({
    select: { id: true, phone: true }
  });

  console.log(`전체 고객: ${all.length}`);

  let fixedCount = 0;

  for (const customer of all) {
    const phone = customer.phone;
    let fixedPhone = phone;

    // "010"으로 시작하는 11자리는 앞의 "0"을 제거하여 10자리로 만듦
    // "01027636023" -> "1027636023"
    if (phone.startsWith('010') && phone.length === 11) {
      fixedPhone = phone.slice(1); // 첫 "0" 제거
    }

    if (fixedPhone !== phone) {
      try {
        await prisma.externalCustomer.update({
          where: { id: customer.id },
          data: { phone: fixedPhone }
        });
        fixedCount++;

        if (fixedCount % 500 === 0) {
          console.log(`수정 진행: ${fixedCount} / ${all.length}`);
        }
      } catch (err) {
        console.error(`수정 실패 ${phone} -> ${fixedPhone}:`, err.message);
      }
    }
  }

  console.log(`\n완료! 수정된 번호: ${fixedCount}건`);

  // 샘플 확인
  const samples = await prisma.externalCustomer.findMany({
    take: 10,
    select: { phone: true }
  });

  console.log('\n수정 후 샘플 10개:');
  samples.forEach((c, i) => {
    console.log(`${i+1}. ${c.phone} (길이: ${c.phone.length})`);
  });

  await prisma.$disconnect();
}

fixPhones().catch(console.error);
