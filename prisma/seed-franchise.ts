import { PrismaClient, FranchiseRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding franchise demo data...');

  // 데모 계정 정보
  const DEMO_EMAIL = process.env.FRANCHISE_DEMO_EMAIL || 'franchise@tmr.com';
  const DEMO_PASSWORD = process.env.FRANCHISE_DEMO_PASSWORD || '123456789a';
  const BRAND_NAME = '철길부산집';
  const OWNER_NAME = '홍길동';
  const OWNER_PHONE = '010-1234-5678';

  // 기존 프랜차이즈 사용자가 있는지 확인
  const existingUser = await prisma.franchiseUser.findUnique({
    where: { email: DEMO_EMAIL },
    include: { franchise: true },
  });

  if (existingUser) {
    console.log(`Demo franchise user already exists: ${DEMO_EMAIL}`);
    console.log(`Franchise: ${existingUser.franchise.name}`);
    return;
  }

  // 비밀번호 해시
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // 트랜잭션으로 Franchise, FranchiseWallet, FranchiseUser 생성
  const result = await prisma.$transaction(async (tx) => {
    // Franchise 생성
    const franchise = await tx.franchise.create({
      data: {
        name: BRAND_NAME,
        slug: 'cheolgil-busan-jip',
      },
    });

    console.log(`Created franchise: ${franchise.name} (${franchise.slug})`);

    // FranchiseWallet 생성 (초기 잔액 1,000,000원)
    await tx.franchiseWallet.create({
      data: {
        franchiseId: franchise.id,
        balance: 1000000, // 100만원
      },
    });

    console.log(`Created franchise wallet with 1,000,000 won balance`);

    // FranchiseUser 생성 (OWNER 역할)
    const user = await tx.franchiseUser.create({
      data: {
        franchiseId: franchise.id,
        email: DEMO_EMAIL,
        passwordHash,
        name: OWNER_NAME,
        phone: OWNER_PHONE,
        role: FranchiseRole.OWNER,
      },
    });

    console.log(`Created franchise user: ${user.email} (${user.role})`);

    return { franchise, user };
  });

  console.log('\n✅ Franchise demo data seeded successfully!');
  console.log(`\n📧 Login credentials:`);
  console.log(`   Email: ${DEMO_EMAIL}`);
  console.log(`   Password: ${DEMO_PASSWORD}`);
  console.log(`\n🏢 Franchise: ${result.franchise.name}`);
}

main()
  .catch((e) => {
    console.error('Error seeding franchise data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
