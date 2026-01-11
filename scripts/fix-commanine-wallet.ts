/**
 * 콤마나인 매장 충전금을 103,000원으로 수정하는 스크립트
 *
 * 사용법:
 * 1. Render Shell에서 실행
 * 2. cd /opt/render/project/src
 * 3. npx tsx scripts/fix-commanine-wallet.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 1. 콤마나인 매장 찾기
  const store = await prisma.store.findFirst({
    where: {
      name: {
        contains: '콤마나인',
      },
    },
    include: {
      wallet: true,
    },
  });

  if (!store) {
    console.log('콤마나인 매장을 찾을 수 없습니다.');
    return;
  }

  console.log('매장 정보:', {
    id: store.id,
    name: store.name,
    currentBalance: store.wallet?.balance,
  });

  // 2. 지갑 잔액을 103,000원으로 설정
  const targetBalance = 103000;

  if (store.wallet) {
    await prisma.wallet.update({
      where: { storeId: store.id },
      data: { balance: targetBalance },
    });
    console.log(`지갑 잔액 업데이트: ${store.wallet.balance} -> ${targetBalance}`);
  } else {
    await prisma.wallet.create({
      data: {
        storeId: store.id,
        balance: targetBalance,
      },
    });
    console.log(`지갑 생성: ${targetBalance}`);
  }

  // 3. 기존 잘못된 충전 내역 삭제 (103,000원 충전 내역)
  const deletedTx = await prisma.paymentTransaction.deleteMany({
    where: {
      storeId: store.id,
      amount: 103000,
      type: 'TOPUP',
    },
  });
  console.log(`삭제된 충전내역: ${deletedTx.count}건`);

  // 4. 최종 확인
  const updatedWallet = await prisma.wallet.findUnique({
    where: { storeId: store.id },
  });
  console.log('최종 잔액:', updatedWallet?.balance);

  console.log('완료!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
