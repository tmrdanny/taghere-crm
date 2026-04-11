/**
 * 모든 매장 OWNER 계정의 비밀번호를 일괄 초기화하는 스크립트
 *
 * 실행 전 반드시 확인:
 * - 프로덕션 DB에 연결되어 있는지 (DATABASE_URL)
 * - 초기화할 비밀번호가 맞는지
 *
 * 실행: npx tsx scripts/reset-owner-passwords.ts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const NEW_PASSWORD = '123456789a';

const prisma = new PrismaClient();

async function main() {
  console.log('🔐 OWNER 계정 비밀번호 일괄 초기화 시작');
  console.log(`📝 새 비밀번호: ${NEW_PASSWORD}`);
  console.log('');

  // OWNER 계정 조회
  const owners = await prisma.staffUser.findMany({
    where: { role: 'OWNER' },
    select: {
      id: true,
      email: true,
      name: true,
      store: { select: { name: true } },
    },
  });

  console.log(`📊 총 ${owners.length}개의 OWNER 계정 발견`);
  console.log('');

  if (owners.length === 0) {
    console.log('❌ OWNER 계정이 없습니다.');
    return;
  }

  // 비밀번호 해싱 (한 번만)
  const passwordHash = await bcrypt.hash(NEW_PASSWORD, 10);

  // 일괄 업데이트
  const result = await prisma.staffUser.updateMany({
    where: { role: 'OWNER' },
    data: { passwordHash },
  });

  console.log(`✅ ${result.count}개 계정 비밀번호 초기화 완료`);
  console.log('');
  console.log('📋 초기화된 계정 목록:');
  owners.forEach((owner, i) => {
    console.log(`  ${i + 1}. ${owner.store?.name || '(매장 없음)'} - ${owner.email}`);
  });
}

main()
  .catch((e) => {
    console.error('❌ 오류 발생:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
