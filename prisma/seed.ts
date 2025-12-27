import { PrismaClient, Gender, StaffRole, PointType, PointPolicyType, ReviewRequestStatus, PaymentTransactionType, PaymentTransactionStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // 기존 데이터 정리
  await prisma.alimTalkOutbox.deleteMany();
  await prisma.alimTalkConfig.deleteMany();
  await prisma.paymentTransaction.deleteMany();
  await prisma.reviewRequestLog.deleteMany();
  await prisma.pointLedger.deleteMany();
  await prisma.visitOrOrder.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.card.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.reviewAutomationSetting.deleteMany();
  await prisma.pointPolicy.deleteMany();
  await prisma.staffUser.deleteMany();
  await prisma.store.deleteMany();

  // 0. Admin 매장 및 계정 생성
  const adminStore = await prisma.store.create({
    data: {
      id: 'store_admin',
      name: 'TagHere Admin',
      ownerName: 'Admin',
      phone: '000-0000-0000',
      businessRegNumber: '000-00-00000',
    },
  });

  // Seed 전용 - 프로덕션에서는 환경변수 사용
  const adminPasswordHash = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD || 'change-in-production', 10);
  const adminUser = await prisma.staffUser.create({
    data: {
      storeId: adminStore.id,
      email: 'admin@tmr.com',
      passwordHash: adminPasswordHash,
      name: 'Admin',
      role: StaffRole.OWNER,
      isAdmin: true,
    },
  });
  console.log('✅ Admin account created:', adminUser.email);

  // 1. 매장 생성
  const store = await prisma.store.create({
    data: {
      id: 'store_taghere_1',
      name: '태그히어 1호점',
      ownerName: '김태그',
      address: '서울시 강남구 역삼동 123-45',
      phone: '02-1234-5678',
      businessRegNumber: '123-45-67890',
      naverPlaceId: '12345678',
    },
  });
  console.log('✅ Store created:', store.name);

  // 2. 점주 계정 생성
  const passwordHash = await bcrypt.hash(process.env.SEED_USER_PASSWORD || 'change-in-production', 10);
  const owner = await prisma.staffUser.create({
    data: {
      storeId: store.id,
      email: 'owner@taghere.com',
      passwordHash,
      name: '김태그 사장님',
      role: StaffRole.OWNER,
      isAdmin: false,
      profileImage: null,
    },
  });
  console.log('✅ Owner created:', owner.name);

  // 3. 직원 계정 생성
  const staff = await prisma.staffUser.create({
    data: {
      storeId: store.id,
      email: 'staff@taghere.com',
      passwordHash,
      name: '이직원',
      role: StaffRole.STAFF,
    },
  });
  console.log('✅ Staff created:', staff.name);

  // 4. 지갑 생성 (200,000원 초기값)
  const wallet = await prisma.wallet.create({
    data: {
      storeId: store.id,
      balance: 200000,
    },
  });
  console.log('✅ Wallet created with balance:', wallet.balance);

  // 5. 포인트 정책 생성 (결제금액의 3% 적립)
  const pointPolicy = await prisma.pointPolicy.create({
    data: {
      storeId: store.id,
      type: PointPolicyType.PERCENT,
      value: 3,
    },
  });
  console.log('✅ Point policy created:', pointPolicy.type, pointPolicy.value);

  // 6. 리뷰 자동요청 설정
  const reviewSetting = await prisma.reviewAutomationSetting.create({
    data: {
      storeId: store.id,
      enabled: true,
      benefitText: '🍤6,000원 새우튀김 18cm 제공!🍤',
      costPerSend: 50,
      autoTopupEnabled: true,
      autoTopupThreshold: 10000,
      autoTopupAmount: 100000,
      naverReviewUrl: 'https://naver.me/xxxx',
    },
  });
  console.log('✅ Review automation setting created');

  // 7. 카드 등록
  const card = await prisma.card.create({
    data: {
      storeId: store.id,
      brand: '국민카드',
      last4: '1234',
      holderName: '김태그',
      expiryMonth: 12,
      expiryYear: 28,
      enabled: true,
      isDefault: true,
    },
  });
  console.log('✅ Card created:', card.brand, '**** ' + card.last4);

  // 8. 고객 30명 생성
  const customerData = [
    { name: '김민지', phone: '010-1234-5678', phoneLastDigits: '12345678', gender: Gender.FEMALE, birthday: new Date('1992-05-14'), memo: '선호 메뉴: 아이스 라떼, 주말 주로 방문함', visitCount: 23, totalPoints: 5231, isVip: true },
    { name: '이정훈', phone: '010-2345-5432', phoneLastDigits: '23455432', gender: Gender.MALE, birthday: new Date('1988-11-23'), memo: '알러지: 견과류, 포인트 적립 자주 잊음', visitCount: 12, totalPoints: 3420, isVip: false },
    { name: '박소연', phone: '010-3456-3333', phoneLastDigits: '34563333', gender: Gender.FEMALE, birthday: new Date('1995-02-10'), memo: '첫 방문 쿠폰 미사용, 친구 추천으로 방문', visitCount: 1, totalPoints: 820, isNew: true },
    { name: '최현우', phone: '010-4567-5555', phoneLastDigits: '45675555', gender: Gender.MALE, birthday: new Date('1990-08-30'), memo: null, visitCount: 5, totalPoints: 1240, isVip: false },
    { name: '정수진', phone: '010-5678-8888', phoneLastDigits: '56788888', gender: Gender.FEMALE, birthday: new Date('1985-12-05'), memo: '단체 예약 문의 이력 있음 (연말)', visitCount: 9, totalPoints: 6340, isVip: false },
    { name: '한재민', phone: '010-6789-9999', phoneLastDigits: '67899999', gender: Gender.MALE, birthday: new Date('1993-07-19'), memo: '매주 화요일 저녁 방문 패턴', visitCount: 34, totalPoints: 9920, isVip: true },
    { name: '송미라', phone: '010-7890-1111', phoneLastDigits: '78901111', gender: Gender.FEMALE, birthday: new Date('1991-03-25'), memo: '디저트 추가 주문 많음', visitCount: 18, totalPoints: 4560, isVip: false },
    { name: '윤성호', phone: '010-8901-2222', phoneLastDigits: '89012222', gender: Gender.MALE, birthday: new Date('1987-09-08'), memo: '테이크아웃 선호', visitCount: 7, totalPoints: 2100, isVip: false },
    { name: '강지은', phone: '010-9012-3333', phoneLastDigits: '90123333', gender: Gender.FEMALE, birthday: new Date('1994-01-17'), memo: null, visitCount: 4, totalPoints: 980, isVip: false },
    { name: '임동현', phone: '010-0123-4444', phoneLastDigits: '01234444', gender: Gender.MALE, birthday: new Date('1989-06-30'), memo: '런치 세트 단골', visitCount: 28, totalPoints: 7890, isVip: true },
    { name: '오수빈', phone: '010-1234-5555', phoneLastDigits: '12345555', gender: Gender.FEMALE, birthday: new Date('1996-11-11'), memo: '인스타그램 태그 자주 함', visitCount: 15, totalPoints: 3200, isVip: false },
    { name: '배준호', phone: '010-2345-6666', phoneLastDigits: '23456666', gender: Gender.MALE, birthday: new Date('1984-04-22'), memo: '주차 문의 자주 함', visitCount: 11, totalPoints: 2800, isVip: false },
    { name: '신예진', phone: '010-3456-7777', phoneLastDigits: '34567777', gender: Gender.FEMALE, birthday: new Date('1992-08-15'), memo: null, visitCount: 3, totalPoints: 750, isVip: false },
    { name: '홍길동', phone: '010-4567-8888', phoneLastDigits: '45678888', gender: Gender.MALE, birthday: new Date('1990-12-01'), memo: '할인 이벤트에 민감', visitCount: 6, totalPoints: 1500, isVip: false },
    { name: '김서연', phone: '010-5678-9999', phoneLastDigits: '56789999', gender: Gender.FEMALE, birthday: new Date('1997-05-28'), memo: '생일 이벤트 참여', visitCount: 2, totalPoints: 500, isNew: true },
    { name: '이민수', phone: '010-6789-0000', phoneLastDigits: '67890000', gender: Gender.MALE, birthday: new Date('1986-10-10'), memo: '아침 시간대 방문', visitCount: 20, totalPoints: 5600, isVip: false },
    { name: '박지영', phone: '010-7890-1234', phoneLastDigits: '78901234', gender: Gender.FEMALE, birthday: new Date('1993-02-14'), memo: '커플 방문 많음', visitCount: 8, totalPoints: 2400, isVip: false },
    { name: '최우진', phone: '010-8901-2345', phoneLastDigits: '89012345', gender: Gender.MALE, birthday: new Date('1988-07-07'), memo: null, visitCount: 14, totalPoints: 4200, isVip: false },
    { name: '정하늘', phone: '010-9012-3456', phoneLastDigits: '90123456', gender: Gender.FEMALE, birthday: new Date('1995-09-20'), memo: '채식 메뉴 선호', visitCount: 10, totalPoints: 2900, isVip: false },
    { name: '한서준', phone: '010-0123-4567', phoneLastDigits: '01234567', gender: Gender.MALE, birthday: new Date('1991-11-30'), memo: '예약 후 방문', visitCount: 16, totalPoints: 4800, isVip: false },
    { name: '송유나', phone: '010-1111-2222', phoneLastDigits: '11112222', gender: Gender.FEMALE, birthday: new Date('1994-04-05'), memo: null, visitCount: 5, totalPoints: 1200, isVip: false },
    { name: '윤태호', phone: '010-2222-3333', phoneLastDigits: '22223333', gender: Gender.MALE, birthday: new Date('1987-01-25'), memo: '직장인 그룹 방문', visitCount: 22, totalPoints: 6100, isVip: false },
    { name: '강민서', phone: '010-3333-4444', phoneLastDigits: '33334444', gender: Gender.FEMALE, birthday: new Date('1996-06-18'), memo: '음료 커스텀 요청 많음', visitCount: 7, totalPoints: 1800, isVip: false },
    { name: '임수아', phone: '010-4444-5555', phoneLastDigits: '44445555', gender: Gender.FEMALE, birthday: new Date('1990-03-12'), memo: null, visitCount: 9, totalPoints: 2700, isVip: false },
    { name: '오재현', phone: '010-5555-6666', phoneLastDigits: '55556666', gender: Gender.MALE, birthday: new Date('1985-08-08'), memo: '연말 파티 예약 이력', visitCount: 12, totalPoints: 3600, isVip: false },
    { name: '배서윤', phone: '010-6666-7777', phoneLastDigits: '66667777', gender: Gender.FEMALE, birthday: new Date('1992-10-30'), memo: '매장 분위기 칭찬', visitCount: 4, totalPoints: 1000, isVip: false },
    { name: '신동욱', phone: '010-7777-8888', phoneLastDigits: '77778888', gender: Gender.MALE, birthday: new Date('1989-12-25'), memo: null, visitCount: 6, totalPoints: 1500, isVip: false },
    { name: '홍지민', phone: '010-8888-9999', phoneLastDigits: '88889999', gender: Gender.FEMALE, birthday: new Date('1997-02-28'), memo: '학생 할인 적용', visitCount: 3, totalPoints: 800, isNew: true },
    { name: '김도현', phone: '010-9999-0000', phoneLastDigits: '99990000', gender: Gender.MALE, birthday: new Date('1986-05-15'), memo: '단체 주문 많음', visitCount: 19, totalPoints: 5400, isVip: false },
    { name: '이하은', phone: '010-0000-1111', phoneLastDigits: '00001111', gender: Gender.FEMALE, birthday: new Date('1993-07-22'), memo: null, visitCount: 8, totalPoints: 2200, isVip: false },
  ];

  const customers = [];
  const now = new Date();

  for (const data of customerData) {
    // 마지막 방문일 계산 (최근 90일 내 랜덤)
    const daysAgo = Math.floor(Math.random() * 90);
    const lastVisitAt = new Date(now);
    lastVisitAt.setDate(lastVisitAt.getDate() - daysAgo);

    const customer = await prisma.customer.create({
      data: {
        storeId: store.id,
        name: data.name,
        phone: data.phone,
        phoneLastDigits: data.phoneLastDigits,
        gender: data.gender,
        birthday: data.birthday,
        memo: data.memo,
        visitCount: data.visitCount,
        totalPoints: data.totalPoints,
        lastVisitAt,
        consentMarketing: Math.random() > 0.2,
        consentSms: Math.random() > 0.3,
        consentKakao: Math.random() > 0.2,
        consentAt: new Date(),
      },
    });
    customers.push(customer);
  }
  console.log(`✅ ${customers.length} customers created`);

  // 9. 일부 고객에 대한 방문/포인트 원장 생성
  const recentCustomers = customers.slice(0, 10);

  for (const customer of recentCustomers) {
    // 최근 3개월 내 방문 기록 생성
    const visitCount = Math.floor(Math.random() * 5) + 1;

    for (let i = 0; i < visitCount; i++) {
      const visitDate = new Date(now);
      visitDate.setDate(visitDate.getDate() - Math.floor(Math.random() * 90));

      const visit = await prisma.visitOrOrder.create({
        data: {
          storeId: store.id,
          customerId: customer.id,
          orderId: `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          visitedAt: visitDate,
          totalAmount: Math.floor(Math.random() * 50000) + 10000,
        },
      });

      // 포인트 적립 기록
      const earnPoints = Math.floor(Math.random() * 500) + 100;
      await prisma.pointLedger.create({
        data: {
          storeId: store.id,
          customerId: customer.id,
          staffUserId: Math.random() > 0.5 ? owner.id : staff.id,
          delta: earnPoints,
          balance: customer.totalPoints,
          type: PointType.EARN,
          reason: '방문 적립',
          orderId: visit.orderId,
          createdAt: visitDate,
        },
      });
    }
  }
  console.log('✅ Visits and point ledger created');

  // 10. 리뷰 요청 로그 생성
  const reviewLogs = [
    { status: ReviewRequestStatus.SENT, daysAgo: 0, cost: 50 },
    { status: ReviewRequestStatus.SENT, daysAgo: 0, cost: 50 },
    { status: ReviewRequestStatus.SENT, daysAgo: 1, cost: 50 },
    { status: ReviewRequestStatus.FAILED, daysAgo: 2, cost: 0, failReason: '잔액 부족' },
    { status: ReviewRequestStatus.SENT, daysAgo: 3, cost: 50 },
  ];

  for (const log of reviewLogs) {
    const logDate = new Date(now);
    logDate.setDate(logDate.getDate() - log.daysAgo);

    const randomCustomer = customers[Math.floor(Math.random() * customers.length)];

    await prisma.reviewRequestLog.create({
      data: {
        storeId: store.id,
        customerId: randomCustomer.id,
        phone: randomCustomer.phone,
        status: log.status,
        cost: log.cost,
        failReason: log.failReason,
        sentAt: log.status === ReviewRequestStatus.SENT ? logDate : null,
        createdAt: logDate,
      },
    });
  }
  console.log('✅ Review request logs created');

  // 11. 결제 트랜잭션 생성
  const transactions = [
    { amount: 200000, type: PaymentTransactionType.TOPUP, status: PaymentTransactionStatus.SUCCESS, daysAgo: 30 },
    { amount: 39000, type: PaymentTransactionType.SUBSCRIPTION, status: PaymentTransactionStatus.SUCCESS, daysAgo: 60 },
    { amount: 39000, type: PaymentTransactionType.SUBSCRIPTION, status: PaymentTransactionStatus.SUCCESS, daysAgo: 90 },
  ];

  for (const tx of transactions) {
    const txDate = new Date(now);
    txDate.setDate(txDate.getDate() - tx.daysAgo);

    await prisma.paymentTransaction.create({
      data: {
        storeId: store.id,
        amount: tx.amount,
        type: tx.type,
        status: tx.status,
        cardId: card.id,
        createdAt: txDate,
      },
    });
  }
  console.log('✅ Payment transactions created');

  console.log('🎉 Seed completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
