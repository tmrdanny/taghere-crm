const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixAllPhones() {
  // 11자리가 아닌 모든 전화번호 조회
  const all = await prisma.externalCustomer.findMany({
    select: { id: true, phone: true }
  });

  const wrongOnes = all.filter(c => c.phone.length !== 11);
  console.log(`수정할 전화번호: ${wrongOnes.length}건`);

  let fixedCount = 0;
  let deletedCount = 0;

  for (const customer of wrongOnes) {
    const phone = customer.phone;
    let fixedPhone = phone;

    // 하이픈 제거
    fixedPhone = fixedPhone.replace(/-/g, '');

    // "010"으로 시작하지 않으면 "010" 추가 시도
    if (!fixedPhone.startsWith('010')) {
      if (fixedPhone.startsWith('10')) {
        // "10..."이면 앞에 "0" 추가
        fixedPhone = '0' + fixedPhone;
      } else if (fixedPhone.length === 8) {
        // 8자리면 "010" 추가
        fixedPhone = '010' + fixedPhone;
      }
    }

    // "010"으로 시작하는데 길이가 11자리 이상이면 중복 제거
    if (fixedPhone.startsWith('010') && fixedPhone.length > 11) {
      // "0101..."인 경우 앞 2자리 제거 (중복된 "01" 제거)
      if (fixedPhone.startsWith('0101')) {
        fixedPhone = fixedPhone.slice(2);
      }
      // 여전히 11자리가 아니면 뒤에서 11자리만 취함
      if (fixedPhone.length > 11) {
        fixedPhone = fixedPhone.slice(-11);
      }
    }

    // 최종적으로 11자리가 아니거나 "010"으로 시작하지 않으면 삭제
    if (fixedPhone.length !== 11 || !fixedPhone.startsWith('010')) {
      console.log(`삭제: ${phone} (수정 시도: ${fixedPhone}, 길이: ${fixedPhone.length})`);
      try {
        await prisma.externalCustomer.delete({ where: { id: customer.id } });
        deletedCount++;
      } catch (err) {
        console.error(`삭제 실패 ${phone}:`, err.message);
      }
      continue;
    }

    // 정상적으로 수정된 경우 업데이트
    if (fixedPhone !== phone) {
      try {
        // 중복 체크: 수정하려는 번호가 이미 존재하는지 확인
        const existing = await prisma.externalCustomer.findUnique({
          where: { phone: fixedPhone }
        });

        if (existing) {
          // 이미 존재하면 현재 레코드 삭제
          console.log(`중복 삭제: ${phone} -> ${fixedPhone} (이미 존재)`);
          await prisma.externalCustomer.delete({ where: { id: customer.id } });
          deletedCount++;
        } else {
          // 존재하지 않으면 업데이트
          await prisma.externalCustomer.update({
            where: { id: customer.id },
            data: { phone: fixedPhone }
          });
          fixedCount++;
          if (fixedCount % 10 === 0) {
            console.log(`수정 진행: ${fixedCount} / ${wrongOnes.length}`);
          }
        }
      } catch (err) {
        console.error(`처리 실패 ${phone} -> ${fixedPhone}:`, err.message);
      }
    }
  }

  console.log(`\n완료!`);
  console.log(`수정: ${fixedCount}건`);
  console.log(`삭제: ${deletedCount}건`);

  await prisma.$disconnect();
}

fixAllPhones().catch(console.error);
