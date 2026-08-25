// 특성화(Characterization) 테스트 — local-customers vs franchise-local-customers 캠페인 발송 경계
//
// 목적: 두 라우트 파일(~75% 쌍둥이)을 공용 서비스로 중복 제거하기 전에,
// 각 스코프의 "enqueue 경계" 동작(응답 바디 + DB에 쓰는 행 + 지갑 변화)을 있는 그대로 고정한다.
// 버그로 보이는 동작도 현재 동작 그대로 단언한다. 절대 수정하지 않는다.
//
// 외부 경계: SolapiService(services/solapi.ts)를 부분 mock — sendBulkSms / sendBulkBrandMessage 만
// 대체하고 buildPhoneResultMap, enqueueAlimTalk(순수 DB enqueue)은 실제 구현을 사용한다.
// POST /test (SolapiMessageService 직접 호출 = 실발송) 은 특성화 대상에서 제외.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// ---- SolapiService mock (부분 mock: 클래스만 대체, 나머지 export는 원본 유지) ----
const solapi = vi.hoisted(() => ({
  smsCalls: [] as Array<Array<{ to: string; text: string }>>,
  brandCalls: [] as any[],
  // 테스트별 오버라이드: (messages) => BulkSendResult[]
  smsResultOverride: null as null | ((messages: Array<{ to: string; text: string }>) => any[]),
}));

vi.mock('../../services/solapi.js', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  class MockSolapiService {
    constructor(_apiKey: string, _apiSecret: string) {}
    async sendBulkSms(messages: Array<{ to: string; text: string }>) {
      solapi.smsCalls.push(messages);
      if (solapi.smsResultOverride) return solapi.smsResultOverride(messages);
      return [
        {
          groupId: 'G-SMS-1',
          acceptedCount: messages.length,
          messageCount: messages.length,
          failedPhones: new Map<string, string>(),
        },
      ];
    }
    async sendBulkBrandMessage(params: any) {
      solapi.brandCalls.push(params);
      return [
        {
          groupId: 'G-KAKAO-1',
          acceptedCount: params.messages.length,
          messageCount: params.messages.length,
          failedPhones: new Map<string, string>(),
        },
      ];
    }
  }
  return { ...original, SolapiService: MockSolapiService };
});

import { app } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

// ---- 고정 시각 (KST 낮 14:00 = 발송 가능 시간대) ----
const DAY_TIME_UTC = new Date('2026-08-21T05:00:00Z'); // 2026-08-21 14:00 KST
const NIGHT_TIME_UTC = new Date('2026-08-21T13:00:00Z'); // 2026-08-21 22:00 KST (발송 불가)
const KO_DATE = '2026. 8. 21.'; // new Date().toLocaleDateString('ko-KR') @ 고정 시각

// ---- 시드 상수 ----
const STORE_ID = 'char-store-1';
const FRANCHISE_ID = 'char-fr-1';

let storeToken: string;
let franchiseToken: string;

function storeAuth() {
  return { Authorization: `Bearer ${storeToken}` };
}
function frAuth() {
  return { Authorization: `Bearer ${franchiseToken}` };
}

async function cleanup() {
  // FK-safe 순서
  await prisma.externalSmsMessage.deleteMany({});
  await prisma.externalSmsCampaign.deleteMany({});
  await (prisma as any).retargetCoupon.deleteMany({});
  await prisma.alimTalkOutbox.deleteMany({});
  await prisma.externalCustomer.deleteMany({});
  await prisma.customer.deleteMany({});
  await prisma.wallet.deleteMany({});
  await prisma.franchiseWallet.deleteMany({});
  await prisma.store.deleteMany({});
  await prisma.franchise.deleteMany({});
}

async function seed() {
  await prisma.franchise.create({
    data: { id: FRANCHISE_ID, name: '특성화프랜차이즈', slug: 'char-franchise' },
  });
  await prisma.store.create({
    data: {
      id: STORE_ID,
      name: '특성화매장',
      slug: 'char-store',
      franchiseId: FRANCHISE_ID,
      naverPlaceUrl: 'https://naver.me/char-store',
    },
  });
  await prisma.wallet.create({ data: { storeId: STORE_ID, balance: 100000 } });
  await prisma.franchiseWallet.create({ data: { franchiseId: FRANCHISE_ID, balance: 100000 } });

  const consentAt = new Date();
  // ExternalCustomer: regionSido 는 줄임말(서울/부산), 미지정은 빈 문자열
  await prisma.externalCustomer.createMany({
    data: [
      { id: 'ext-1', phone: '01011110001', ageGroup: 'TWENTIES', gender: 'FEMALE', regionSido: '서울', regionSigungu: '강남구', preferredCategories: '["CAFE"]', consentMarketing: true, consentAt },
      { id: 'ext-2', phone: '01011110002', ageGroup: 'THIRTIES', gender: 'MALE', regionSido: '서울', regionSigungu: '서초구', preferredCategories: '["KOREAN"]', consentMarketing: true, consentAt },
      { id: 'ext-3', phone: '01011110003', ageGroup: 'TWENTIES', gender: 'FEMALE', regionSido: '부산', regionSigungu: '해운대구', preferredCategories: '["CAFE"]', consentMarketing: true, consentAt },
      { id: 'ext-4', phone: '01011110004', ageGroup: 'FORTIES', regionSido: '', regionSigungu: '', consentMarketing: true, consentAt },
      { id: 'ext-5', phone: '01011110005', ageGroup: 'TWENTIES', gender: 'FEMALE', regionSido: '서울', regionSigungu: '강남구', preferredCategories: '["CAFE"]', consentMarketing: false, consentAt },
    ],
  });
  // Customer: 줄임말 지역 사용 (franchise 라우트 주석 "Customer DB도 줄임말 사용" 기준 시드)
  await prisma.customer.createMany({
    data: [
      { id: 'cust-1', storeId: STORE_ID, phone: '01022220001', regionSido: '서울', regionSigungu: '강남구', ageGroup: 'TWENTIES', gender: 'FEMALE', consentMarketing: true },
      { id: 'cust-2', storeId: STORE_ID, phone: null, regionSido: '서울', regionSigungu: '서초구', ageGroup: 'THIRTIES', gender: 'MALE', consentMarketing: true },
      { id: 'cust-3', storeId: STORE_ID, phone: '01022220003', regionSido: null, regionSigungu: null, ageGroup: 'FIFTIES', consentMarketing: true },
    ],
  });
}

beforeAll(() => {
  // 라우트가 요청 시점에 읽는 env 를 결정적으로 고정 (프로덕션 코드 변경 없음)
  process.env.PUBLIC_APP_URL = 'https://crm-char-test.example.com';
  process.env.SOLAPI_PF_ID = 'PF-CHAR-TEST';
  process.env.SOLAPI_TEMPLATE_ID_RETARGET_COUPON = 'TPL-RETARGET-CHAR';
  process.env.SOLAPI_API_KEY = process.env.SOLAPI_API_KEY || 'test-key';
  process.env.SOLAPI_API_SECRET = process.env.SOLAPI_API_SECRET || 'test-secret';

  const secret = process.env.JWT_SECRET!;
  storeToken = jwt.sign({ id: 'staff-1', email: 'staff@char.test', storeId: STORE_ID, role: 'OWNER' }, secret);
  franchiseToken = jwt.sign(
    { id: 'fruser-1', email: 'fr@char.test', franchiseId: FRANCHISE_ID, role: 'MANAGER', isFranchise: true },
    secret
  );
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); // HTTP/타이머는 실물 유지, Date 만 고정
  vi.setSystemTime(DAY_TIME_UTC);
  solapi.smsCalls.length = 0;
  solapi.brandCalls.length = 0;
  solapi.smsResultOverride = null;
  await cleanup();
  await seed();
});

afterEach(() => {
  vi.useRealTimers();
});

// =====================================================================
// 매장 스코프: /api/local-customers/*
// =====================================================================
describe('store scope: /api/local-customers', () => {
  it('GET /count — 지역(서울) 기본: ExternalCustomer(줄임말)+Customer 합산, consentMarketing=true 만', async () => {
    const res = await request(app)
      .get('/api/local-customers/count')
      .set(storeAuth())
      .query({ regions: JSON.stringify([{ sido: '서울' }]) });

    expect(res.status).toBe(200);
    // customer 카운트에는 phone 유무 필터가 없다 → phone null 인 cust-2 도 포함 (발송과 불일치)
    expect(res.body).toEqual({
      totalCount: 4,
      availableCount: 4,
      breakdown: { external: 2, customer: 2 },
    });
  });

  it('GET /count — "미지정" 지역: external(regionSido="")과 customer(null/"") 모두 매칭 (store 전용 처리)', async () => {
    const res = await request(app)
      .get('/api/local-customers/count')
      .set(storeAuth())
      .query({ regions: JSON.stringify([{ sido: '미지정' }]) });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      totalCount: 2,
      availableCount: 2,
      breakdown: { external: 1, customer: 1 },
    });
  });

  it('GET /count — 지역+categories 는 AND 결합 (external), customer 에는 category 미적용', async () => {
    const res = await request(app)
      .get('/api/local-customers/count')
      .set(storeAuth())
      .query({ regions: JSON.stringify([{ sido: '서울' }]), categories: 'CAFE' });

    expect(res.status).toBe(200);
    // external: 서울 AND CAFE → ext-1 만. customer: category 무시 → 서울 2명
    expect(res.body).toEqual({
      totalCount: 3,
      availableCount: 3,
      breakdown: { external: 1, customer: 2 },
    });
  });

  it('GET /count — 지역 미선택 → 400', async () => {
    const res = await request(app).get('/api/local-customers/count').set(storeAuth());
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: '지역을 선택해주세요.' });
  });

  it('GET /estimate — 150원/건, Wallet(storeId) 기준 canSend 판정', async () => {
    await prisma.wallet.update({ where: { storeId: STORE_ID }, data: { balance: 1000 } });

    const res = await request(app)
      .get('/api/local-customers/estimate')
      .set(storeAuth())
      .query({ sendCount: '10' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      sendCount: 10,
      costPerMessage: 150,
      totalCost: 1500,
      walletBalance: 1000,
      canSend: false,
    });
  });

  it('POST /send — 성공: 응답/캠페인(storeId)/메시지행/(광고)래핑, 지갑은 차감되지 않음', async () => {
    const res = await request(app)
      .post('/api/local-customers/send')
      .set(storeAuth())
      .send({ content: '테스트 메시지', regions: [{ sido: '서울' }], sendCount: 3 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      campaignId: expect.any(String),
      pendingCount: 3,
      failedCount: 0,
      totalCost: 450,
      message: '발송 요청이 완료되었습니다. 결과는 발송내역에서 확인하세요.',
      // breakdown 은 "선택된" 수가 아니라 "매칭된 전체" 수 — phone null 고객은 제외
      breakdown: { external: 2, customer: 1 },
    });

    const formatted = '(광고)\n테스트 메시지\n무료수신거부 080-500-4233';
    const campaign = await prisma.externalSmsCampaign.findUniqueOrThrow({
      where: { id: res.body.campaignId },
    });
    expect(campaign).toMatchObject({
      storeId: STORE_ID,
      franchiseId: null,
      title: `신규 고객 유치 - ${KO_DATE}`,
      content: formatted,
      filterAgeGroups: '[]',
      filterGender: null,
      filterRegionSido: '서울',
      filterRegionSigungu: '',
      filterCategories: null,
      targetCount: 3,
      sentCount: 0,
      failedCount: 0,
      costPerMessage: 150,
      totalCost: 0, // 캠페인 totalCost 컬럼은 발송 시점에 갱신되지 않는다 (현행 동작)
      status: 'SENDING',
    });

    const messages = await prisma.externalSmsMessage.findMany({
      where: { campaignId: campaign.id },
      orderBy: { id: 'asc' },
    });
    expect(messages).toHaveLength(3);
    for (const m of messages) {
      expect(m).toMatchObject({
        storeId: STORE_ID,
        franchiseId: null,
        content: formatted,
        status: 'PENDING',
        solapiGroupId: 'G-SMS-1',
        cost: 150,
        failReason: null,
      });
    }
    // external 소스가 먼저 선택된다 ([...external, ...customer].slice) → ext 2명 + customer 1명(null)
    const extIds = messages.map((m) => m.externalCustomerId).filter(Boolean).sort();
    expect(extIds).toEqual(['ext-1', 'ext-2']);
    expect(messages.filter((m) => m.externalCustomerId === null)).toHaveLength(1);

    // 지갑은 확인만 하고 차감하지 않는다 (현행 동작 — enqueue 시점 차감 없음)
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { storeId: STORE_ID } });
    expect(wallet.balance).toBe(100000);

    // solapi 로 전달된 벌크 메시지 (요청 시점 외부 호출 — mock)
    expect(solapi.smsCalls).toHaveLength(1);
    expect(solapi.smsCalls[0]).toHaveLength(3);
    expect(solapi.smsCalls[0][0].text).toBe(formatted);
  });

  it('POST /send — 잔액 부족: 400 + 한국어 바디, 캠페인 미생성', async () => {
    await prisma.wallet.update({ where: { storeId: STORE_ID }, data: { balance: 100 } });

    const res = await request(app)
      .post('/api/local-customers/send')
      .set(storeAuth())
      .send({ content: '테스트', regions: [{ sido: '서울' }], sendCount: 3 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: '잔액이 부족합니다.',
      walletBalance: 100,
      requiredAmount: 450,
    });
    expect(await prisma.externalSmsCampaign.count()).toBe(0);
    expect(solapi.smsCalls).toHaveLength(0);
  });

  it('POST /send — 가용 수량 초과: 400 + availableCount, 캠페인 미생성', async () => {
    const res = await request(app)
      .post('/api/local-customers/send')
      .set(storeAuth())
      .send({ content: '테스트', regions: [{ sido: '서울' }], sendCount: 50 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: '발송 가능한 고객이 3명입니다.', availableCount: 3 });
    expect(await prisma.externalSmsCampaign.count()).toBe(0);
  });

  it('POST /send — 부분 실패: 실패행 FAILED/cost 0/failReason, 캠페인 failedCount 반영, 응답 totalCost 는 성공분만', async () => {
    solapi.smsResultOverride = (messages) => [
      {
        groupId: 'G-SMS-1',
        acceptedCount: messages.length - 1,
        messageCount: messages.length,
        failedPhones: new Map([['01011110001', '수신거부']]),
      },
    ];

    const res = await request(app)
      .post('/api/local-customers/send')
      .set(storeAuth())
      .send({ content: '테스트', regions: [{ sido: '서울' }], sendCount: 3 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      pendingCount: 2,
      failedCount: 1,
      totalCost: 300,
    });

    const failed = await prisma.externalSmsMessage.findMany({ where: { status: 'FAILED' } });
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({
      externalCustomerId: 'ext-1',
      cost: 0,
      solapiGroupId: null,
      failReason: '수신거부',
    });

    const campaign = await prisma.externalSmsCampaign.findUniqueOrThrow({
      where: { id: res.body.campaignId },
    });
    expect(campaign).toMatchObject({ failedCount: 1, status: 'SENDING' });
  });

  it('POST /send — 전량 실패(groupId 없음): 전 행 FAILED("발송 실패"), 캠페인 status 는 COMPLETED, 응답은 success:true', async () => {
    solapi.smsResultOverride = (messages) => [
      { groupId: '', acceptedCount: 0, messageCount: messages.length, failedPhones: new Map() },
    ];

    const res = await request(app)
      .post('/api/local-customers/send')
      .set(storeAuth())
      .send({ content: '테스트', regions: [{ sido: '서울' }], sendCount: 3 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, pendingCount: 0, failedCount: 3, totalCost: 0 });

    const messages = await prisma.externalSmsMessage.findMany({});
    expect(messages).toHaveLength(3);
    for (const m of messages) {
      expect(m).toMatchObject({ status: 'FAILED', cost: 0, failReason: '발송 실패' });
    }
    // 전량 실패인데 캠페인은 COMPLETED (현행 동작)
    const campaign = await prisma.externalSmsCampaign.findUniqueOrThrow({
      where: { id: res.body.campaignId },
    });
    expect(campaign.status).toBe('COMPLETED');
  });

  it('POST /kakao/send — 주간(TEXT 200원): ExternalCustomer 만 대상, (광고) 래핑 없음, 지갑 미차감', async () => {
    const res = await request(app)
      .post('/api/local-customers/kakao/send')
      .set(storeAuth())
      .send({ content: '카카오 테스트', regions: [{ sido: '서울' }], sendCount: 2 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      campaignId: expect.any(String),
      pendingCount: 2,
      failedCount: 0,
      totalCost: 400,
      message: '발송 요청이 완료되었습니다. 결과는 발송내역에서 확인하세요.',
      // scheduledAt: undefined → 주간에는 키 자체가 직렬화되지 않음
    });
    expect('scheduledAt' in res.body).toBe(false);

    const campaign = await prisma.externalSmsCampaign.findUniqueOrThrow({
      where: { id: res.body.campaignId },
    });
    expect(campaign).toMatchObject({
      storeId: STORE_ID,
      franchiseId: null,
      title: `신규 고객 유치 (카카오톡) - ${KO_DATE}`,
      content: '카카오 테스트', // SMS 와 달리 (광고)/수신거부 래핑 없음
      targetCount: 2,
      costPerMessage: 200,
      status: 'SENDING',
    });

    const messages = await prisma.externalSmsMessage.findMany({
      where: { campaignId: campaign.id },
    });
    expect(messages).toHaveLength(2);
    // 카카오는 Customer(CRM 고객)를 대상에 포함하지 않는다 — 전 행 externalCustomerId 존재
    expect(messages.map((m) => m.externalCustomerId).sort()).toEqual(['ext-1', 'ext-2']);
    for (const m of messages) {
      expect(m).toMatchObject({ status: 'PENDING', solapiGroupId: 'G-KAKAO-1', cost: 200 });
    }

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { storeId: STORE_ID } });
    expect(wallet.balance).toBe(100000);

    expect(solapi.brandCalls).toHaveLength(1);
    expect(solapi.brandCalls[0]).toMatchObject({ pfId: 'PF-CHAR-TEST', messageType: 'TEXT' });
    expect(solapi.brandCalls[0].scheduledAt).toBeUndefined();
  });

  it('POST /kakao/send — 야간(22:00 KST): 거절 대신 다음날 08:00 KST 예약 발송', async () => {
    vi.setSystemTime(NIGHT_TIME_UTC);

    const res = await request(app)
      .post('/api/local-customers/kakao/send')
      .set(storeAuth())
      .send({ content: '야간 카카오', regions: [{ sido: '서울' }], sendCount: 2 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      pendingCount: 2,
      message: '다음날 08:00에 예약 발송됩니다. 결과는 발송내역에서 확인하세요.',
      scheduledAt: '2026-08-21T23:00:00.000Z', // = 2026-08-22 08:00 KST
    });
    expect(solapi.brandCalls[0].scheduledAt).toEqual(new Date('2026-08-21T23:00:00.000Z'));
  });

  it('GET /kakao/estimate — IMAGE 230원/건, 방문율 7.6%, 객단가 폴백 25000', async () => {
    const res = await request(app)
      .get('/api/local-customers/kakao/estimate')
      .set(storeAuth())
      .query({ sendCount: '10', messageType: 'IMAGE' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      sendCount: 10,
      messageType: 'IMAGE',
      costPerMessage: 230,
      totalCost: 2300,
      walletBalance: 100000,
      canSend: true,
      estimatedRevenue: { avgOrderValue: 25000, conversionRate: 0.076 },
    });
  });

  it('POST /coupon-alimtalk/send — 150원/건: RetargetCoupon+LOCAL_COUPON outbox 생성, Wallet 즉시 차감', async () => {
    const res = await request(app)
      .post('/api/local-customers/coupon-alimtalk/send')
      .set(storeAuth())
      .send({
        regions: [{ sido: '서울' }],
        sendCount: 2,
        couponContent: ' 아메리카노 1잔 ',
        expiryDate: ' 2026-12-31 ',
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, sentCount: 2, failedCount: 0, totalCost: 300 });

    // 선택 순서: external 우선 → ext-1, ext-2 (customerId 는 null)
    const coupons = await (prisma as any).retargetCoupon.findMany({ orderBy: { phone: 'asc' } });
    expect(coupons).toHaveLength(2);
    expect(coupons.map((c: any) => c.phone)).toEqual(['01011110001', '01011110002']);
    for (const c of coupons) {
      expect(c).toMatchObject({
        storeId: STORE_ID,
        customerId: null,
        couponContent: '아메리카노 1잔', // trim 저장
        expiryDate: '2026-12-31',
        naverPlaceUrl: 'https://naver.me/char-store',
      });
      expect(c.code).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$/);
    }

    const outbox = await prisma.alimTalkOutbox.findMany({ orderBy: { phone: 'asc' } });
    expect(outbox).toHaveLength(2);
    for (const o of outbox) {
      expect(o).toMatchObject({
        storeId: STORE_ID,
        customerId: null,
        messageType: 'LOCAL_COUPON',
        templateId: 'TPL-RETARGET-CHAR',
        status: 'PENDING',
        scheduledAt: null, // LOCAL_COUPON 은 야간 예약 없이 항상 즉시 큐잉 (현행 동작)
      });
      expect(o.idempotencyKey).toMatch(/^local-coupon-char-store-1-/);
      const vars = o.variables as Record<string, string>;
      expect(vars['#{상호}']).toBe('특성화매장');
      expect(vars['#{쿠폰내용}']).toBe('아메리카노 1잔');
      expect(vars['#{유효기간}']).toBe('2026-12-31');
      expect(vars['#{네이버플레이스}']).toBe('naver.me/char-store');
      expect(vars['#{직원확인}']).toMatch(
        /^crm-char-test\.example\.com\/coupon\/verify\/[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$/
      );
    }

    // 이 엔드포인트만 매장 지갑을 즉시 차감한다 (sentCount * 150)
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { storeId: STORE_ID } });
    expect(wallet.balance).toBe(100000 - 300);

    const campaign = await prisma.externalSmsCampaign.findFirstOrThrow({});
    expect(campaign).toMatchObject({
      storeId: STORE_ID,
      franchiseId: null,
      title: `쿠폰 알림톡 - ${KO_DATE}`,
      content: '쿠폰: 아메리카노 1잔 / 유효기간: 2026-12-31',
      targetCount: 2,
      costPerMessage: 150,
      failedCount: 0,
      status: 'SENDING',
    });
  });

  it('GET /campaigns — storeId 스코프 목록만 반환 + pagination 형태', async () => {
    await prisma.externalSmsCampaign.create({
      data: {
        id: 'camp-store', storeId: STORE_ID, title: '매장캠페인', content: 'a',
        filterAgeGroups: '[]', filterRegionSido: '서울', filterRegionSigungu: '',
        targetCount: 1, costPerMessage: 150, status: 'SENDING',
      },
    });
    await prisma.externalSmsCampaign.create({
      data: {
        id: 'camp-fr', franchiseId: FRANCHISE_ID, title: '프차캠페인', content: 'b',
        filterAgeGroups: '[]', filterRegionSido: '서울', filterRegionSigungu: '',
        targetCount: 1, costPerMessage: 150, status: 'SENDING',
      },
    });

    const res = await request(app).get('/api/local-customers/campaigns').set(storeAuth());

    expect(res.status).toBe(200);
    expect(res.body.campaigns).toHaveLength(1);
    expect(res.body.campaigns[0]).toMatchObject({
      id: 'camp-store',
      storeId: STORE_ID,
      franchiseId: null,
      title: '매장캠페인',
      content: 'a',
      targetCount: 1,
      sentCount: 0,
      failedCount: 0,
      costPerMessage: 150,
      totalCost: 0,
      status: 'SENDING',
    });
    expect(typeof res.body.campaigns[0].createdAt).toBe('string');
    expect(res.body.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
  });
});

// =====================================================================
// 프랜차이즈 스코프: /api/franchise/local-customers/*
// =====================================================================
describe('franchise scope: /api/franchise/local-customers', () => {
  it('GET /count — "미지정" 지역을 리터럴 매칭 (store 스코프와 달리 특수 처리 없음 → 0건)', async () => {
    const res = await request(app)
      .get('/api/franchise/local-customers/count')
      .set(frAuth())
      .query({ regions: JSON.stringify([{ sido: '미지정' }]) });

    expect(res.status).toBe(200);
    // store 스코프는 같은 요청에 2를 반환한다 (미지정 → ''/null 변환). 프랜차이즈는 변환 없음.
    expect(res.body).toEqual({
      totalCount: 0,
      availableCount: 0,
      breakdown: { external: 0, customer: 0 },
    });
  });

  it('GET /count — categories 가 지역 OR 를 덮어써 external 은 지역 무관 매칭 (store 는 AND 결합)', async () => {
    const res = await request(app)
      .get('/api/franchise/local-customers/count')
      .set(frAuth())
      .query({ regions: JSON.stringify([{ sido: '서울' }]), categories: 'CAFE' });

    expect(res.status).toBe(200);
    // external: where.OR 가 categories 로 교체 → CAFE 동의 고객 전체(서울 ext-1 + 부산 ext-3) = 2
    // (같은 요청에 store 스코프는 external 1 을 반환 — 이 차이가 dedup 시 보존 대상 지점)
    expect(res.body).toEqual({
      totalCount: 4,
      availableCount: 4,
      breakdown: { external: 2, customer: 2 },
    });
  });

  it('GET /estimate — FranchiseWallet(franchiseId) 기준, 150원/건', async () => {
    const res = await request(app)
      .get('/api/franchise/local-customers/estimate')
      .set(frAuth())
      .query({ sendCount: '10' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      sendCount: 10,
      costPerMessage: 150,
      totalCost: 1500,
      walletBalance: 100000,
      canSend: true,
    });
  });

  it('POST /send — 성공: 캠페인/메시지에 franchiseId 기록(storeId null), FranchiseWallet 미차감', async () => {
    const res = await request(app)
      .post('/api/franchise/local-customers/send')
      .set(frAuth())
      .send({ content: '프차 테스트', regions: [{ sido: '서울' }], sendCount: 3 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      campaignId: expect.any(String),
      pendingCount: 3,
      failedCount: 0,
      totalCost: 450,
      message: '발송 요청이 완료되었습니다. 결과는 발송내역에서 확인하세요.',
      breakdown: { external: 2, customer: 1 },
    });

    const formatted = '(광고)\n프차 테스트\n무료수신거부 080-500-4233';
    const campaign = await prisma.externalSmsCampaign.findUniqueOrThrow({
      where: { id: res.body.campaignId },
    });
    expect(campaign).toMatchObject({
      storeId: null,
      franchiseId: FRANCHISE_ID,
      title: `신규 고객 유치 - ${KO_DATE}`,
      content: formatted,
      targetCount: 3,
      costPerMessage: 150,
      status: 'SENDING',
    });

    const messages = await prisma.externalSmsMessage.findMany({
      where: { campaignId: campaign.id },
    });
    expect(messages).toHaveLength(3);
    for (const m of messages) {
      expect(m).toMatchObject({
        storeId: null,
        franchiseId: FRANCHISE_ID,
        content: formatted,
        status: 'PENDING',
        solapiGroupId: 'G-SMS-1',
        cost: 150,
      });
    }

    // 프랜차이즈 지갑도 확인만 하고 차감하지 않는다 (store 스코프와 동일한 현행 동작)
    const wallet = await prisma.franchiseWallet.findUniqueOrThrow({
      where: { franchiseId: FRANCHISE_ID },
    });
    expect(wallet.balance).toBe(100000);
  });

  it('POST /send — 잔액 부족: 400 + 한국어 바디 (FranchiseWallet 기준)', async () => {
    await prisma.franchiseWallet.update({
      where: { franchiseId: FRANCHISE_ID },
      data: { balance: 100 },
    });

    const res = await request(app)
      .post('/api/franchise/local-customers/send')
      .set(frAuth())
      .send({ content: '테스트', regions: [{ sido: '서울' }], sendCount: 3 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: '잔액이 부족합니다.',
      walletBalance: 100,
      requiredAmount: 450,
    });
    expect(await prisma.externalSmsCampaign.count()).toBe(0);
  });

  it('POST /send — categories 지역 덮어쓰기 divergence: 동일 요청에 store=AND / franchise=덮어쓰기', async () => {
    const body = { content: '카테고리', regions: [{ sido: '서울' }], sendCount: 1, categories: ['CAFE'] };

    const frRes = await request(app)
      .post('/api/franchise/local-customers/send')
      .set(frAuth())
      .send(body);
    // franchise: external OR 가 categories 로 교체 → 부산 ext-3 까지 포함해 2명
    expect(frRes.status).toBe(200);
    expect(frRes.body.breakdown).toEqual({ external: 2, customer: 1 });

    const stRes = await request(app).post('/api/local-customers/send').set(storeAuth()).send(body);
    // store: 지역 AND category → 서울 CAFE ext-1 만 1명
    expect(stRes.status).toBe(200);
    expect(stRes.body.breakdown).toEqual({ external: 1, customer: 1 });
  });

  it('POST /kakao/send — 주간(TEXT 200원): franchiseId 캠페인/메시지, ExternalCustomer 만 대상', async () => {
    const res = await request(app)
      .post('/api/franchise/local-customers/kakao/send')
      .set(frAuth())
      .send({ content: '프차 카카오', regions: [{ sido: '서울' }], sendCount: 2 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      campaignId: expect.any(String),
      pendingCount: 2,
      failedCount: 0,
      totalCost: 400,
      message: '발송 요청이 완료되었습니다. 결과는 발송내역에서 확인하세요.',
    });

    const campaign = await prisma.externalSmsCampaign.findUniqueOrThrow({
      where: { id: res.body.campaignId },
    });
    expect(campaign).toMatchObject({
      storeId: null,
      franchiseId: FRANCHISE_ID,
      title: `신규 고객 유치 (카카오톡) - ${KO_DATE}`,
      content: '프차 카카오',
      costPerMessage: 200,
      status: 'SENDING',
    });

    const messages = await prisma.externalSmsMessage.findMany({
      where: { campaignId: campaign.id },
    });
    expect(messages.map((m) => m.externalCustomerId).sort()).toEqual(['ext-1', 'ext-2']);
    for (const m of messages) {
      expect(m).toMatchObject({ storeId: null, franchiseId: FRANCHISE_ID, cost: 200, status: 'PENDING' });
    }

    const wallet = await prisma.franchiseWallet.findUniqueOrThrow({
      where: { franchiseId: FRANCHISE_ID },
    });
    expect(wallet.balance).toBe(100000);
  });

  it('POST /kakao/coupon-send — 100원/건: RETARGET_COUPON outbox(대표매장 storeId), FranchiseWallet 트랜잭션 차감', async () => {
    const res = await request(app)
      .post('/api/franchise/local-customers/kakao/coupon-send')
      .set(frAuth())
      .send({
        couponContent: ' 프차 쿠폰 ',
        expiryDate: ' 2026-12-31 ',
        representativeStoreId: STORE_ID,
        regions: [{ sido: '서울' }],
        sendCount: 2,
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      campaignId: expect.any(String),
      count: 2,
      queued: 2,
      dropped: 0,
      pendingCount: 2,
      totalCost: 200,
      message: '2명에게 쿠폰 알림톡 발송이 예약되었습니다.',
    });
    expect('scheduledAt' in res.body).toBe(false);

    // ExternalCustomer 만 대상, orderBy id asc → ext-1, ext-2
    const coupons = await (prisma as any).retargetCoupon.findMany({ orderBy: { phone: 'asc' } });
    expect(coupons.map((c: any) => c.phone)).toEqual(['01011110001', '01011110002']);
    for (const c of coupons) {
      expect(c).toMatchObject({
        storeId: STORE_ID, // 대표매장으로 귀속
        customerId: null,
        couponContent: '프차 쿠폰',
        expiryDate: '2026-12-31',
        naverPlaceUrl: 'https://naver.me/char-store',
      });
    }

    const outbox = await prisma.alimTalkOutbox.findMany({ orderBy: { phone: 'asc' } });
    expect(outbox).toHaveLength(2);
    for (const o of outbox) {
      // store 스코프의 LOCAL_COUPON 과 달리 RETARGET_COUPON 타입 + 쿠폰코드 기반 멱등키
      expect(o).toMatchObject({
        storeId: STORE_ID,
        customerId: null,
        messageType: 'RETARGET_COUPON',
        templateId: 'TPL-RETARGET-CHAR',
        status: 'PENDING',
        scheduledAt: null, // 주간이라 즉시
      });
      expect(o.idempotencyKey).toMatch(/^retarget-coupon-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$/);
      const vars = o.variables as Record<string, string>;
      expect(vars['#{상호}']).toBe('특성화매장');
      expect(vars['#{네이버플레이스}']).toBe('naver.me/char-store');
      expect(vars['#{직원확인}']).toMatch(/^crm-char-test\.example\.com\/coupon\/verify\//);
    }

    // FranchiseWallet 이 큐잉 성공분만큼 차감 (2 * 100)
    const wallet = await prisma.franchiseWallet.findUniqueOrThrow({
      where: { franchiseId: FRANCHISE_ID },
    });
    expect(wallet.balance).toBe(100000 - 200);

    const campaign = await prisma.externalSmsCampaign.findUniqueOrThrow({
      where: { id: res.body.campaignId },
    });
    expect(campaign).toMatchObject({
      storeId: null,
      franchiseId: FRANCHISE_ID,
      title: `신규 고객 유치 (쿠폰 알림톡) - ${KO_DATE}`,
      content: '프차 쿠폰',
      costPerMessage: 100,
      failedCount: 0,
      status: 'SENDING',
    });
  });

  it('GET /campaigns — franchiseId 스코프 목록만 반환', async () => {
    await prisma.externalSmsCampaign.create({
      data: {
        id: 'camp-store', storeId: STORE_ID, title: '매장캠페인', content: 'a',
        filterAgeGroups: '[]', filterRegionSido: '서울', filterRegionSigungu: '',
        targetCount: 1, costPerMessage: 150, status: 'SENDING',
      },
    });
    await prisma.externalSmsCampaign.create({
      data: {
        id: 'camp-fr', franchiseId: FRANCHISE_ID, title: '프차캠페인', content: 'b',
        filterAgeGroups: '[]', filterRegionSido: '서울', filterRegionSigungu: '',
        targetCount: 1, costPerMessage: 150, status: 'SENDING',
      },
    });

    const res = await request(app).get('/api/franchise/local-customers/campaigns').set(frAuth());

    expect(res.status).toBe(200);
    expect(res.body.campaigns).toHaveLength(1);
    expect(res.body.campaigns[0]).toMatchObject({
      id: 'camp-fr',
      storeId: null,
      franchiseId: FRANCHISE_ID,
      title: '프차캠페인',
    });
    expect(res.body.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
  });

  it('인증 경계: 매장 토큰으로 프랜차이즈 라우트 접근 → 401, 토큰 없이 매장 라우트 → 401', async () => {
    const crossRes = await request(app)
      .get('/api/franchise/local-customers/campaigns')
      .set(storeAuth());
    expect(crossRes.status).toBe(401);
    expect(crossRes.body).toEqual({ error: '프랜차이즈 계정이 아닙니다.' });

    const noTokenRes = await request(app).get('/api/local-customers/campaigns');
    expect(noTokenRes.status).toBe(401);
    expect(noTokenRes.body).toEqual({ error: '인증 토큰이 필요합니다.' });
  });
});
