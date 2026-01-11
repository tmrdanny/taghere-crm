/**
 * 특정 매장의 충전내역 삭제 스크립트
 *
 * 사용법:
 * 1. Render Shell에서 실행
 * 2. cd /opt/render/project/src
 * 3. npx tsx scripts/delete-transaction.ts
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

  // 2. 103,000원 충전내역 찾기
  const transactions = await prisma.paymentTransaction.findMany({
    where: {
      storeId: store.id,
      amount: 103000,
      type: 'TOPUP',
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  if (transactions.length === 0) {
    console.log('103,000원 충전내역을 찾을 수 없습니다.');
    return;
  }

  console.log('찾은 충전내역:', transactions);

  // 3. 가장 최근 103,000원 충전내역 삭제
  const targetTransaction = transactions[0];
  console.log('삭제할 거래:', targetTransaction);

  // 4. 트랜잭션 삭제
  await prisma.paymentTransaction.delete({
    where: {
      id: targetTransaction.id,
    },
  });
  console.log('충전내역 삭제 완료');

  // 5. 지갑 잔액에서 차감
  if (store.wallet) {
    const newBalance = store.wallet.balance - 103000;
    await prisma.wallet.update({
      where: {
        storeId: store.id,
      },
      data: {
        balance: newBalance,
      },
    });
    console.log(`지갑 잔액 업데이트: ${store.wallet.balance} -> ${newBalance}`);
  }

  console.log('완료!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
