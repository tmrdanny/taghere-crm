import { PrismaClient, Gender, PointType, StaffRole, PaymentTransactionType, PaymentTransactionStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// 한국 실명 데이터
const koreanLastNames = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '홍'];
const koreanFirstNamesMale = ['민준', '서준', '예준', '도윤', '시우', '주원', '하준', '지호', '준우', '준서', '현우', '지훈', '건우', '우진', '민재', '현준', '선우', '서진', '연우', '정우'];
const koreanFirstNamesFemale = ['서연', '서윤', '지우', '서현', '민서', '하은', '하윤', '윤서', '지유', '채원', '수아', '지아', '지윤', '은서', '다은', '예은', '수빈', '지원', '소율', '예린'];

function getRandomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateKoreanName(gender: Gender): string {
  const lastName = getRandomElement(koreanLastNames);
  const firstName = gender === Gender.MALE
    ? getRandomElement(koreanFirstNamesMale)
    : getRandomElement(koreanFirstNamesFemale);
  return lastName + firstName;
}

function generatePhoneNumber(): string {
  const middle = Math.floor(Math.random() * 9000) + 1000;
  const last = Math.floor(Math.random() * 9000) + 1000;
  return `010${middle}${last}`;
}

function generateBirthday(): { birthday: string; birthYear: number } {
  const year = 1970 + Math.floor(Math.random() * 40); // 1970-2009
  const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
  const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
  return { birthday: `${month}-${day}`, birthYear: year };
}

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

// KST 기준 오늘 날짜를 UTC 자정으로 반환 (API와 동일한 방식)
function getTodayDateKST(): Date {
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000; // 9시간
  const kstTime = new Date(now.getTime() + kstOffset);
  return new Date(Date.UTC(kstTime.getUTCFullYear(), kstTime.getUTCMonth(), kstTime.getUTCDate(), 0, 0, 0, 0));
}

async function main() {
  console.log('🌱 Creating demo account: Taghere Dining...\n');

  // 1. 기존 데모 매장 삭제 (있다면)
  const existingStores = await prisma.store.findMany({
    where: {
      OR: [
        { name: 'Taghere Dining' },
        { businessRegNumber: '123-45-67890' },
        { slug: 'taghere-dining' },
      ]
    }
  });
  for (const s of existingStores) {
    await prisma.store.delete({ where: { id: s.id } });
    console.log('🗑️  Deleted existing store:', s.name);
  }

  // 2. 매장 생성
  const store = await prisma.store.create({
    data: {
      name: 'Taghere Dining',
      slug: 'taghere-dining',
      ownerName: '김태그',
      phone: '02-1234-5678',
      businessRegNumber: '123-45-67890',
      address: '서울특별시 강남구 테헤란로 123',
      naverPlaceUrl: 'https://naver.me/demo123',
      naverPlaceId: 'demo123456',
      randomPointEnabled: true,
      randomPointMin: 50,
      randomPointMax: 500,
      pointsAlimtalkEnabled: true,
    }
  });
  console.log('✅ Created store:', store.name);

  // 3. 점주 계정 생성
  const passwordHash = await bcrypt.hash('demo1234', 10);
  const staffUser = await prisma.staffUser.create({
    data: {
      storeId: store.id,
      email: 'demo@taghere.com',
      passwordHash,
      name: '김태그',
      role: StaffRole.OWNER,
    }
  });
  console.log('✅ Created owner account: demo@taghere.com / demo1234');

  // 4. 지갑 생성
  await prisma.wallet.create({
    data: {
      storeId: store.id,
      balance: 287500, // 충전금 잔액
    }
  });
  console.log('✅ Created wallet with 287,500원 balance');

  // 5. 리뷰 자동화 설정
  await prisma.reviewAutomationSetting.create({
    data: {
      storeId: store.id,
      enabled: true,
      benefitText: '다음 방문 시 음료 1잔 무료!',
      costPerSend: 50,
      naverReviewUrl: 'https://naver.me/demo123',
    }
  });
  console.log('✅ Created review automation settings');

  // 6. 고객 생성 (총 16,287명, 오늘 신규 179명)
  // 실제로는 대표 샘플 100명만 생성하고, 나머지는 통계로 표시
  console.log('\n👥 Creating sample customers (100 records)...');
  const customers = [];
  const now = new Date();
  const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  // 100명 샘플 고객 생성 (실제 DB에 저장)
  for (let i = 0; i < 100; i++) {
    const gender = Math.random() > 0.45 ? Gender.FEMALE : Gender.MALE;
    const name = generateKoreanName(gender);
    const phone = generatePhoneNumber();
    const { birthday, birthYear } = generateBirthday();
    const visitCount = Math.floor(Math.random() * 20) + 1;
    const totalPoints = Math.floor(Math.random() * 3000) + 100;

    // 오늘 신규 고객 비율 반영 (약 1.1% = 179/16287)
    const isNewToday = i < 2; // 샘플 중 2명은 오늘 가입
    const lastVisitAt = isNewToday ? now : randomDate(threeMonthsAgo, now);
    const createdAt = isNewToday
      ? new Date(now.getTime() - Math.random() * 12 * 60 * 60 * 1000) // 오늘 중 랜덤
      : randomDate(new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000), threeMonthsAgo);

    const customer = await prisma.customer.create({
      data: {
        storeId: store.id,
        kakaoId: `demo_kakao_${i + 1}`,
        name,
        phone,
        phoneLastDigits: phone.slice(-8),
        gender,
        birthday,
        birthYear,
        visitCount,
        totalPoints,
        lastVisitAt,
        createdAt,
        consentMarketing: Math.random() > 0.3,
        consentSms: Math.random() > 0.4,
        consentKakao: Math.random() > 0.2,
      }
    });
    customers.push(customer);
  }
  console.log(`✅ Created ${customers.length} sample customers`);
  console.log('   (Demo displays 16,287 total, 179 new today)');

  // 7. 포인트 내역 생성 (각 고객별 2-5건)
  console.log('\n💰 Creating point transactions...');
  let pointCount = 0;
  for (const customer of customers) {
    const txCount = Math.floor(Math.random() * 4) + 2;
    let balance = 0;

    for (let i = 0; i < txCount; i++) {
      const isEarn = Math.random() > 0.3;
      const delta = isEarn
        ? Math.floor(Math.random() * 400) + 50
        : -Math.floor(Math.random() * Math.min(balance, 300) + 50);

      if (!isEarn && balance < 50) continue;

      balance += delta;
      if (balance < 0) balance = 0;

      await prisma.pointLedger.create({
        data: {
          storeId: store.id,
          customerId: customer.id,
          staffUserId: staffUser.id,
          delta,
          balance,
          type: isEarn ? PointType.EARN : PointType.USE,
          reason: isEarn ? null : '음료 할인',
          createdAt: randomDate(threeMonthsAgo, now),
        }
      });
      pointCount++;
    }
  }
  console.log(`✅ Created ${pointCount} point transactions`);

  // 8. 네이버 리뷰 통계 생성 (30일간, J 커브 성장)
  // 목표: 총 18,471개, 오늘 98개 신규
  console.log('\n📊 Creating Naver review stats (30 days, J-curve growth)...');

  // J 커브 계산: 초반 느리게, 후반 급격히 증가
  // 30일간 총 증가량 계산 (약 1,800개 증가로 설정)
  const totalDays = 31;
  const targetTotal = 18471;
  const targetDailyToday = 98;

  // J 커브 함수: f(x) = a * e^(b*x) 형태
  // 30일 전부터 오늘까지의 일별 리뷰 수 계산
  const jCurveReviews: number[] = [];
  let sumReviews = 0;

  for (let i = 0; i < totalDays; i++) {
    // 지수 함수로 J 커브 생성 (0~30일, 마지막이 98)
    // 초반 20~30개, 후반 급격히 증가하여 98개
    const t = i / (totalDays - 1); // 0 ~ 1
    const baseValue = 20 + 10 * Math.random(); // 기본 20-30
    const exponentialGrowth = Math.pow(t, 2.5) * (targetDailyToday - 25); // J 커브
    const dailyReviews = Math.floor(baseValue + exponentialGrowth);
    jCurveReviews.push(dailyReviews);
    sumReviews += dailyReviews;
  }

  // 마지막 날은 정확히 98개로 조정
  jCurveReviews[totalDays - 1] = targetDailyToday;

  // 30일 전 시작 리뷰 수 계산
  const startingTotal = targetTotal - sumReviews + jCurveReviews[totalDays - 1] - targetDailyToday;
  let cumulativeReviews = Math.max(16000, startingTotal); // 최소 16000부터 시작

  // KST 기준 오늘 날짜 가져오기 (API와 동일한 방식)
  const todayKST = getTodayDateKST();

  for (let i = 0; i < totalDays; i++) {
    // 오늘부터 30일 전까지의 날짜 생성
    const date = new Date(todayKST);
    date.setUTCDate(date.getUTCDate() - (totalDays - 1 - i));

    const dailyReviews = jCurveReviews[i];
    cumulativeReviews += dailyReviews;

    // 마지막 날은 정확한 값으로
    const finalTotal = i === totalDays - 1 ? targetTotal : cumulativeReviews;
    const finalDaily = i === totalDays - 1 ? targetDailyToday : dailyReviews;

    await prisma.naverReviewStats.create({
      data: {
        storeId: store.id,
        date,
        visitorReviews: Math.floor(finalDaily * 0.85),
        blogReviews: Math.floor(finalDaily * 0.15),
        totalReviews: finalTotal,
      }
    });
  }
  console.log(`✅ Created ${totalDays} days of review stats (J-curve, ending at ${targetTotal} total, ${targetDailyToday} daily)`);

  // 9. 결제 내역 생성
  console.log('\n💳 Creating payment transactions...');
  const paymentDates = [
    new Date(now.getTime() - 25 * 24 * 60 * 60 * 1000),
    new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000),
    new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
  ];

  for (const date of paymentDates) {
    await prisma.paymentTransaction.create({
      data: {
        storeId: store.id,
        amount: 100000,
        type: PaymentTransactionType.TOPUP,
        status: PaymentTransactionStatus.SUCCESS,
        createdAt: date,
      }
    });
  }
  console.log('✅ Created 3 payment transactions (300,000원 total topup)');

  // 10. 방문 기록 생성
  console.log('\n🚶 Creating visit records...');
  let visitCount = 0;
  for (const customer of customers) {
    const visits = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < visits; i++) {
      await prisma.visitOrOrder.create({
        data: {
          storeId: store.id,
          customerId: customer.id,
          orderId: `ORDER-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          visitedAt: randomDate(threeMonthsAgo, now),
          totalAmount: Math.floor(Math.random() * 50000) + 10000,
        }
      });
      visitCount++;
    }
  }
  console.log(`✅ Created ${visitCount} visit records`);

  console.log('\n========================================');
  console.log('🎉 Demo account created successfully!');
  console.log('========================================');
  console.log('\n📝 Login credentials:');
  console.log('   Email: demo@taghere.com');
  console.log('   Password: demo1234');
  console.log('\n📊 Demo data:');
  console.log('   - Store: Taghere Dining');
  console.log('   - Total Customers: 16,287 (179 new today)');
  console.log('   - Naver Reviews: 18,471 total (98 new today)');
  console.log('   - Review Trend: J-curve growth');
  console.log('   - Wallet Balance: 287,500원');
  console.log('========================================\n');
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
