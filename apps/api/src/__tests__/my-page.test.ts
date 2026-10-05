// 고객 마이페이지 — 로그인 증표, 내 기록 판정, 프랜차이즈 카드, 보상 신청, 수신 동의 철회, 탈퇴, 매장 지도, 좌표 작업
//
// 외부 경계 모킹
//  - geocodeAddress (카카오 로컬 API)
//  - global fetch (카카오/네이버 OAuth 토큰·프로필)
// 메타씨티는 조회 전용 함수가 가입(registerCustomer)을 부르지 않는지 MetacityService 메서드를 감시한다.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const { geocodeMock } = vi.hoisted(() => {
  process.env.CUSTOMER_JWT_SECRET = process.env.CUSTOMER_JWT_SECRET || 'test-customer-secret';
  process.env.KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY || 'test-kakao-rest';
  return { geocodeMock: vi.fn() };
});

vi.mock('../services/geocode.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/geocode.js')>();
  return { ...actual, geocodeAddress: geocodeMock };
});

import { app } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { signCustomerToken } from '../utils/customer-token.js';
import { clearStoreMapCache } from '../services/store-map.js';
import { runStoreGeocodeTick } from '../services/store-geocode-worker.js';
import { MetacityService, lookupMetacityBalanceReadOnly } from '../services/metacity.js';

// ── 헬퍼 ──────────────────────────────────────────────────────────────

const PHONE = '01012345678';
let seq = 0;
function uid(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}`;
}

async function createStore(overrides: Record<string, any> = {}) {
  return prisma.store.create({ data: { name: uid('매장'), slug: uid('slug'), ...overrides } });
}

async function createCustomer(storeId: string, overrides: Record<string, any> = {}) {
  return prisma.customer.create({ data: { storeId, ...overrides } });
}

function phoneToken(phone = PHONE) {
  return signCustomerToken({ provider: 'naver', phone });
}

function kakaoToken(kakaoId: string, phone?: string) {
  return signCustomerToken({ provider: 'kakao', kakaoId, phone });
}

async function createOwnerToken(storeId: string) {
  const staff = await prisma.staffUser.create({
    data: { storeId, email: `${uid('staff')}@test.local`, passwordHash: 'x', name: '직원' },
  });
  return jwt.sign({ id: staff.id, email: staff.email, storeId, role: 'OWNER' }, process.env.JWT_SECRET!, {
    expiresIn: '1h',
  });
}

async function cleanup() {
  await prisma.alimTalkOutbox.deleteMany({});
  await prisma.rewardClaim.deleteMany({});
  await prisma.franchiseStampLedger.deleteMany({});
  await prisma.franchisePointLedger.deleteMany({});
  await prisma.franchiseCustomer.deleteMany({});
  await prisma.franchiseStampSetting.deleteMany({});
  await prisma.store.deleteMany({});
  await prisma.franchise.deleteMany({ where: { slug: { startsWith: 'mypage-fr-' } } });
  await prisma.uniqueCustomer.deleteMany({});
  await prisma.externalCustomer.deleteMany({});
}

beforeEach(async () => {
  geocodeMock.mockReset();
  clearStoreMapCache();
  await cleanup();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ══════════════════════════════════════════════════════════════════════
// 1. 인증
// ══════════════════════════════════════════════════════════════════════

describe('고객 로그인 증표', () => {
  it('증표 없음 / 사장님 증표 → 401, 고객 증표로 사장님 API → 401', async () => {
    const store = await createStore();
    const ownerToken = await createOwnerToken(store.id);

    const noAuth = await request(app).get('/api/my-page');
    expect(noAuth.status).toBe(401);

    const withOwner = await request(app).get('/api/my-page').set('Authorization', `Bearer ${ownerToken}`);
    expect(withOwner.status).toBe(401);

    const customerOnOwnerApi = await request(app)
      .get('/api/customers')
      .set('Authorization', `Bearer ${phoneToken()}`);
    expect(customerOnOwnerApi.status).toBe(401);
  });

  it('typ 이 customer 가 아닌 증표는 같은 키로 서명돼도 거절', async () => {
    const forged = jwt.sign({ phone: PHONE, provider: 'naver' }, process.env.CUSTOMER_JWT_SECRET!);
    const res = await request(app).get('/api/my-page').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════════════════
// 2. 내 기록 판정
// ══════════════════════════════════════════════════════════════════════

describe('GET /api/my-page — 내 기록 판정', () => {
  it('번호로 카카오 가입·주문 서비스·태블릿 기록을 모두 찾고, 뒤 8자리만 같은 유선번호는 제외', async () => {
    const [a, b, c, d] = await Promise.all([createStore(), createStore(), createStore(), createStore()]);
    await createCustomer(a.id, { phone: '+82 10-1234-5678', phoneLastDigits: '12345678', kakaoId: 'K1', totalPoints: 100 });
    await createCustomer(b.id, { phone: '010-1234-5678', phoneLastDigits: '12345678', totalPoints: 200 });
    await createCustomer(c.id, { phone: '01012345678', phoneLastDigits: '12345678', totalPoints: 300 });
    await createCustomer(d.id, { phone: '02-1234-5678', phoneLastDigits: '12345678', totalPoints: 999 });

    const res = await request(app).get('/api/my-page').set('Authorization', `Bearer ${phoneToken()}`);
    expect(res.status).toBe(200);
    const ids = res.body.stores.map((s: any) => s.storeId).sort();
    expect(ids).toEqual([a.id, b.id, c.id].sort());
    expect(res.body.customer).toMatchObject({ provider: 'naver', hasPhone: true });
    expect(res.body.customer.phone).not.toContain('1234-5678');
  });

  it('카카오 번호 동의 없이 로그인 → 카카오ID로 찾은 기록만', async () => {
    const [a, b] = await Promise.all([createStore(), createStore()]);
    await createCustomer(a.id, { phone: '+82 10-1234-5678', phoneLastDigits: '12345678', kakaoId: 'K2' });
    await createCustomer(b.id, { phone: '010-1234-5678', phoneLastDigits: '12345678' });

    const res = await request(app).get('/api/my-page').set('Authorization', `Bearer ${kakaoToken('K2')}`);
    expect(res.status).toBe(200);
    expect(res.body.stores.map((s: any) => s.storeId)).toEqual([a.id]);
    expect(res.body.customer.hasPhone).toBe(false);
  });

  it('탈퇴한 기록은 보이지 않음', async () => {
    const store = await createStore();
    await createCustomer(store.id, { phone: PHONE, phoneLastDigits: '12345678', withdrawnAt: new Date() });
    const res = await request(app).get('/api/my-page').set('Authorization', `Bearer ${phoneToken()}`);
    expect(res.body.stores).toEqual([]);
  });

  it('스탬프 다음 보상까지 남은 개수 · 안 쓴 쿠폰만 표시 · 매장 기본 정보(전화번호 없음)', async () => {
    const store = await createStore({ category: 'CAFE', address: '서울 강남구 테헤란로 1', phone: '010-9999-9999' });
    await prisma.stampSetting.create({
      data: {
        storeId: store.id,
        enabled: true,
        rewards: [
          { tier: 10, description: '케이크', options: null },
          { tier: 5, description: '아메리카노', options: null },
        ],
      },
    });
    const customer = await createCustomer(store.id, { phone: PHONE, phoneLastDigits: '12345678', totalStamps: 3 });
    await prisma.retargetCoupon.createMany({
      data: [
        { code: uid('C').slice(0, 20), storeId: store.id, customerId: customer.id, phone: PHONE, couponContent: '10% 할인', expiryDate: '~10/31' },
        { code: uid('U').slice(0, 20), storeId: store.id, customerId: customer.id, phone: PHONE, couponContent: '사용함', expiryDate: '~10/31', usedAt: new Date() },
      ],
    });

    const res = await request(app).get('/api/my-page').set('Authorization', `Bearer ${phoneToken()}`);
    const card = res.body.stores[0];
    expect(card.nextReward).toEqual({ tier: 5, description: '아메리카노', remaining: 2 });
    expect(card.stampRewards.map((r: any) => r.tier)).toEqual([5, 10]);
    expect(card.coupons).toHaveLength(1);
    expect(card.coupons[0]).toMatchObject({ couponContent: '10% 할인', expiryDate: '~10/31' });
    expect(card).toMatchObject({ category: 'CAFE', address: '서울 강남구 테헤란로 1' });
    expect(JSON.stringify(card)).not.toContain('9999-9999');
  });
});

// ══════════════════════════════════════════════════════════════════════
// 3. 프랜차이즈
// ══════════════════════════════════════════════════════════════════════

async function createFranchiseFixture() {
  const franchise = await prisma.franchise.create({ data: { name: '브랜드', slug: uid('mypage-fr') } });
  await prisma.franchiseStampSetting.create({
    data: { franchiseId: franchise.id, selfClaimEnabled: true, rewards: [{ tier: 10, description: '보상', options: null }] },
  });
  const s1 = await createStore({ franchiseId: franchise.id, franchiseStampEnabled: true, name: 'A점' });
  const s2 = await createStore({ franchiseId: franchise.id, franchiseStampEnabled: true, name: 'B점' });
  await createCustomer(s1.id, { phone: PHONE, phoneLastDigits: '12345678', kakaoId: 'FK', totalPoints: 500, totalStamps: 99 });
  const fc = await prisma.franchiseCustomer.create({
    data: { franchiseId: franchise.id, kakaoId: 'FK', phone: '+82 10-1234-5678', phoneLastDigits: '12345678', totalStamps: 10 },
  });
  const ledger = (storeId: string, delta: number, balance: number, type: 'EARN' | 'USE' = 'EARN') =>
    prisma.franchiseStampLedger.create({
      data: { franchiseId: franchise.id, franchiseCustomerId: fc.id, storeId, type, delta, balance },
    });
  await ledger(s1.id, 1, 1);
  await ledger(s1.id, 1, 2);
  await ledger(s1.id, 1, 3);
  await ledger(s2.id, 1, 4);
  await ledger(s2.id, 1, 5);
  await ledger(s1.id, -5, 0, 'USE');
  return { franchise, s1, s2, fc };
}

describe('GET /api/my-page — 프랜차이즈', () => {
  it('프랜차이즈 매장 카드도 포인트와 함께 보이고, 스탬프는 브랜드 카드에서 매장별 적립 합계로 표시', async () => {
    const { s1, s2 } = await createFranchiseFixture();

    // 네이버 로그인(번호만)으로도 프랜차이즈 기록을 찾는다
    const res = await request(app).get('/api/my-page').set('Authorization', `Bearer ${phoneToken()}`);
    expect(res.status).toBe(200);

    const storeCard = res.body.stores.find((s: any) => s.storeId === s1.id);
    expect(storeCard).toMatchObject({ totalPoints: 500, stampManagedByFranchise: true, totalStamps: null });

    expect(res.body.franchises).toHaveLength(1);
    const brand = res.body.franchises[0];
    expect(brand.totalStamps).toBe(10);
    expect(brand.storeBreakdown).toEqual([
      { storeId: s1.id, storeName: 'A점', stamps: 3 },
      { storeId: s2.id, storeName: 'B점', stamps: 2 },
    ]);
  });

  it('보상 신청을 동시에 두 번 보내도 한 번만 차감', async () => {
    const { franchise, fc } = await createFranchiseFixture();
    const token = phoneToken();
    const send = () =>
      request(app)
        .post('/api/my-page/reward-claim')
        .set('Authorization', `Bearer ${token}`)
        .send({ franchiseId: franchise.id, tier: 10 });

    const results = await Promise.all([send(), send()]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 400]);

    const after = await prisma.franchiseCustomer.findUniqueOrThrow({ where: { id: fc.id } });
    expect(after.totalStamps).toBe(0);
    expect(await prisma.rewardClaim.count({ where: { franchiseCustomerId: fc.id } })).toBe(1);
  });

  it('보상 신청 본문 형식이 틀리면 400', async () => {
    const { franchise } = await createFranchiseFixture();
    const send = (body: unknown) =>
      request(app).post('/api/my-page/reward-claim').set('Authorization', `Bearer ${phoneToken()}`).send(body as object);
    expect((await send({ franchiseId: { not: '' }, tier: 10 })).status).toBe(400);
    expect((await send({ franchiseId: franchise.id, tier: '10' })).status).toBe(400);
    expect((await send({ franchiseId: franchise.id, tier: -1 })).status).toBe(400);
  });

  it('다른 사람의 프랜차이즈에는 보상 신청 불가', async () => {
    const { franchise } = await createFranchiseFixture();
    const res = await request(app)
      .post('/api/my-page/reward-claim')
      .set('Authorization', `Bearer ${phoneToken('01099998888')}`)
      .send({ franchiseId: franchise.id, tier: 10 });
    expect(res.status).toBe(404);
  });
});

// ══════════════════════════════════════════════════════════════════════
// 4. 메타씨티 조회 전용
// ══════════════════════════════════════════════════════════════════════

describe('메타씨티 잔액 조회 전용', () => {
  it('회원이 없으면 null 을 돌려주고 가입(registerCustomer)을 부르지 않음', async () => {
    const register = vi.spyOn(MetacityService.prototype, 'registerCustomer');
    vi.spyOn(MetacityService.prototype, 'searchCustomerByPhone').mockResolvedValue({ CUST_INFO_LIST: [] } as any);

    const result = await lookupMetacityBalanceReadOnly('I0001', { metacityCustId: null, phone: '010-1234-5678' });
    expect(result).toBeNull();
    expect(register).not.toHaveBeenCalled();
  });

  it('고객 화면 조회는 3초 제한·응답 원본 로그 끔으로 호출', async () => {
    const search = vi.spyOn(MetacityService.prototype, 'searchCustomerByPhone').mockResolvedValue({ CUST_INFO_LIST: [] } as any);
    await lookupMetacityBalanceReadOnly('I0001', { metacityCustId: null, phone: '010-1234-5678' });
    expect(search).toHaveBeenCalledWith('010-1234-5678', { timeoutMs: 3000, logRaw: false });
  });

  it('번호가 일치하는 회원이면 잔액 반환', async () => {
    vi.spyOn(MetacityService.prototype, 'searchCustomerByPhone').mockResolvedValue({
      CUST_INFO_LIST: [{ CUST_ID: 'C1', CP_NO: '01012345678', ABLE_POINT: '1500', TOT_POINT: '2000', USED_POINT: '500' }],
    } as any);
    const result = await lookupMetacityBalanceReadOnly('I0001', { metacityCustId: null, phone: '010-1234-5678' });
    expect(result?.ablePoint).toBe(1500);
  });

  it('메타씨티 매장 카드 — 조회 실패 시 잔액 대신 METACITY_UNAVAILABLE', async () => {
    vi.spyOn(MetacityService.prototype, 'searchCustomerByPhone').mockRejectedValue(new Error('down'));
    const register = vi.spyOn(MetacityService.prototype, 'registerCustomer');
    const store = await createStore({ metacityEnabled: true, metacityStoreIdx: 'I0001' });
    await createCustomer(store.id, { phone: PHONE, phoneLastDigits: '12345678', totalPoints: 777 });

    const res = await request(app).get('/api/my-page').set('Authorization', `Bearer ${phoneToken()}`);
    expect(res.body.stores[0]).toMatchObject({ totalPoints: null, pointSource: 'METACITY_UNAVAILABLE' });
    expect(register).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════
// 5. 수신 동의 철회 · 탈퇴
// ══════════════════════════════════════════════════════════════════════

describe('POST /api/my-page/consent/withdraw', () => {
  it('내 기록 동의를 끄고, 부스터 명부에 없던 번호도 차단 행을 만들고, 외부 고객 명부(하이픈 표기) 동의를 끔', async () => {
    const store = await createStore();
    const customer = await createCustomer(store.id, {
      phone: PHONE, phoneLastDigits: '12345678', consentMarketing: true, consentSms: true, consentKakao: true,
    });
    await prisma.externalCustomer.create({
      data: { phone: '010-1234-5678', ageGroup: 'THIRTIES', regionSido: '서울', regionSigungu: '강남구', consentMarketing: true, consentAt: new Date() },
    });

    const res = await request(app).post('/api/my-page/consent/withdraw').set('Authorization', `Bearer ${phoneToken()}`);
    expect(res.status).toBe(200);

    const after = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect([after.consentMarketing, after.consentSms, after.consentKakao]).toEqual([false, false, false]);
    const unique = await prisma.uniqueCustomer.findUniqueOrThrow({ where: { phone: PHONE } });
    expect(unique.suppressed).toBe(true);
    const external = await prisma.externalCustomer.findUniqueOrThrow({ where: { phone: '010-1234-5678' } });
    expect(external.consentMarketing).toBe(false);
  });
});

describe('POST /api/my-page/withdraw', () => {
  it('로그인한 지 10분이 지난 증표는 거절', async () => {
    const old = jwt.sign(
      { typ: 'customer', provider: 'naver', phone: PHONE, iat: Math.floor(Date.now() / 1000) - 11 * 60 },
      process.env.CUSTOMER_JWT_SECRET!,
      { algorithm: 'HS256' },
    );
    const res = await request(app).post('/api/my-page/withdraw').set('Authorization', `Bearer ${old}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('REAUTH_REQUIRED');
  });

  it('개인정보·연결 기록을 비우고, 대기 중인 적립·알림톡만 정리하고, 사장님 목록에서 빠지고, 다시 오면 새 고객', async () => {
    const store = await createStore();
    const ownerToken = await createOwnerToken(store.id);
    const customer = await createCustomer(store.id, {
      phone: PHONE, phoneLastDigits: '12345678', name: '홍길동', kakaoId: 'WK', birthYear: 1990,
      consentMarketing: true, memo: '단골', totalPoints: 1000,
    });
    await prisma.pointLedger.create({
      data: { storeId: store.id, customerId: customer.id, type: 'EARN', delta: 1000, balance: 1000 },
    });
    const pending = await prisma.pendingPointAccrual.create({
      data: {
        storeId: store.id, customerId: customer.id, orderId: uid('o'), purAmt: 10000, ratePercent: 5,
        earnPoints: 500, source: 'IN_APP', expiresAt: new Date(Date.now() + 86400000),
      },
    });
    const outboxBase = { storeId: store.id, customerId: customer.id, phone: PHONE, messageType: 'POINTS_EARNED' as const, templateId: 't', variables: {} };
    const notSent = await prisma.alimTalkOutbox.create({ data: { ...outboxBase, idempotencyKey: uid('k'), status: 'PENDING' } });
    const handedOver = await prisma.alimTalkOutbox.create({
      data: { ...outboxBase, idempotencyKey: uid('k'), status: 'RETRY', solapiMessageId: 'M1' },
    });
    const coupon = await prisma.retargetCoupon.create({
      data: { code: uid('W').slice(0, 20), storeId: store.id, customerId: customer.id, phone: PHONE, couponContent: 'x', expiryDate: 'y' },
    });
    const walletBefore = await prisma.wallet.findUnique({ where: { storeId: store.id } });

    const res = await request(app).post('/api/my-page/withdraw').set('Authorization', `Bearer ${kakaoToken('WK', PHONE)}`);
    expect(res.status).toBe(200);
    expect(res.body.withdrawnCustomers).toBe(1);

    const after = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(after.withdrawnAt).not.toBeNull();
    expect([after.phone, after.phoneLastDigits, after.name, after.kakaoId, after.birthYear, after.memo]).toEqual([null, null, null, null, null, null]);
    expect(after.consentMarketing).toBe(false);
    expect(after.totalPoints).toBe(1000); // 기록은 보존
    expect(await prisma.pointLedger.count({ where: { customerId: customer.id } })).toBe(1);

    expect((await prisma.pendingPointAccrual.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe('CANCELED');
    expect((await prisma.alimTalkOutbox.findUniqueOrThrow({ where: { id: notSent.id } })).status).toBe('FAILED');
    expect((await prisma.alimTalkOutbox.findUniqueOrThrow({ where: { id: handedOver.id } })).status).toBe('RETRY');
    expect((await prisma.retargetCoupon.findUniqueOrThrow({ where: { id: coupon.id } })).phone).toBe('');
    expect(await prisma.wallet.findUnique({ where: { storeId: store.id } })).toEqual(walletBefore);
    expect((await prisma.uniqueCustomer.findUniqueOrThrow({ where: { phone: PHONE } })).suppressed).toBe(true);

    const ownerList = await request(app).get('/api/customers').set('Authorization', `Bearer ${ownerToken}`);
    expect(ownerList.status).toBe(200);
    expect(JSON.stringify(ownerList.body)).not.toContain(customer.id);
    const ownerDetail = await request(app).get(`/api/customers/${customer.id}`).set('Authorization', `Bearer ${ownerToken}`);
    expect(ownerDetail.status).toBe(404);

    const mine = await request(app).get('/api/my-page').set('Authorization', `Bearer ${phoneToken()}`);
    expect(mine.body.stores).toEqual([]);

    // 같은 번호로 다시 오면 매장별 번호 자리가 비어 있어 새 고객을 만들 수 있다
    const again = await createCustomer(store.id, { phone: PHONE, phoneLastDigits: '12345678' });
    expect(again.id).not.toBe(customer.id);
  });

  it('프랜차이즈 기록도 탈퇴 처리 (kakaoId 는 행마다 고유한 값으로)', async () => {
    const { fc } = await createFranchiseFixture();
    const res = await request(app).post('/api/my-page/withdraw').set('Authorization', `Bearer ${phoneToken()}`);
    expect(res.status).toBe(200);
    const after = await prisma.franchiseCustomer.findUniqueOrThrow({ where: { id: fc.id } });
    expect(after.withdrawnAt).not.toBeNull();
    expect(after.phone).toBeNull();
    expect(after.kakaoId).toBe(`withdrawn:${fc.id}`);
  });
});

// ══════════════════════════════════════════════════════════════════════
// 6. 매장 지도
// ══════════════════════════════════════════════════════════════════════

describe('GET /api/public/stores/map', () => {
  it('CRM 켬 + 좌표 + 60일 내 활동 매장만, 숨김·비활동 제외, 전화번호·slug 미노출', async () => {
    const coords = { latitude: 37.5, longitude: 127.0 };
    const active = await createStore({ ...coords, phone: '010-1111-2222', enrollmentMode: 'MEMBERSHIP' });
    await createCustomer(active.id); // 멤버십 매장 — 가입만 있음
    const hidden = await createStore({ ...coords, hiddenFromMap: true });
    await createCustomer(hidden.id);
    const idle = await createStore({ ...coords });
    const old = await createCustomer(idle.id);
    await prisma.customer.update({ where: { id: old.id }, data: { createdAt: new Date(Date.now() - 90 * 86400000) } });
    const crmOff = await createStore({ ...coords, crmEnabled: false });
    await createCustomer(crmOff.id);
    const noCoords = await createStore();
    await createCustomer(noCoords.id);

    const res = await request(app).get('/api/public/stores/map');
    expect(res.status).toBe(200);
    expect(res.body.stores.map((s: any) => s.id)).toEqual([active.id]);
    expect(res.body.stores[0]).not.toHaveProperty('phone');
    expect(res.body.stores[0]).not.toHaveProperty('slug');
    expect(res.body.stores[0].enrollmentMode).toBe('MEMBERSHIP');
  });
});

// ══════════════════════════════════════════════════════════════════════
// 7. 좌표 작업
// ══════════════════════════════════════════════════════════════════════

describe('runStoreGeocodeTick', () => {
  it('좌표 없는 매장만 채우고, 관리자가 넣은 좌표는 건드리지 않고, 실패하면 좌표를 지우지 않음', async () => {
    const empty = await createStore({ address: '서울 중구 세종대로 110' });
    const adminSet = await createStore({ address: '서울 종로구 1', latitude: 1, longitude: 2 });
    const failing = await createStore({ address: '없는 주소' });
    geocodeMock.mockImplementation(async (addr: string) =>
      addr === '없는 주소' ? null : { latitude: 37.56, longitude: 126.97, matchedAddress: addr },
    );

    const first = await runStoreGeocodeTick();
    expect(first.attempted).toBe(2);

    const e = await prisma.store.findUniqueOrThrow({ where: { id: empty.id } });
    expect([e.latitude, e.longitude, e.geocodedAddress]).toEqual([37.56, 126.97, '서울 중구 세종대로 110']);
    const a = await prisma.store.findUniqueOrThrow({ where: { id: adminSet.id } });
    expect([a.latitude, a.longitude, a.geocodedAddress]).toEqual([1, 2, null]);
    const f = await prisma.store.findUniqueOrThrow({ where: { id: failing.id } });
    expect([f.latitude, f.geocodedAddress]).toEqual([null, '없는 주소']);

    // 같은 주소는 다시 시도하지 않음
    expect((await runStoreGeocodeTick()).attempted).toBe(0);

    // 작업이 넣은 좌표의 주소가 바뀌었는데 변환에 실패하면 기존 좌표 유지
    await prisma.store.update({ where: { id: empty.id }, data: { address: '없는 주소' } });
    await runStoreGeocodeTick();
    const changed = await prisma.store.findUniqueOrThrow({ where: { id: empty.id } });
    expect([changed.latitude, changed.geocodedAddress]).toEqual([37.56, '없는 주소']);
  });
});

describe('runStoreGeocodeTick — API 장애 의심', () => {
  it('5곳 이상 모두 실패하면 시도 기록을 남기지 않아 나중에 다시 시도', async () => {
    const stores = await Promise.all(
      Array.from({ length: 5 }, (_, i) => createStore({ address: `서울 어딘가 ${i}` })),
    );
    geocodeMock.mockResolvedValue(null);
    await runStoreGeocodeTick();
    const after = await prisma.store.findMany({ where: { id: { in: stores.map((s) => s.id) } } });
    expect(after.every((s) => s.geocodedAddress === null)).toBe(true);

    geocodeMock.mockResolvedValue({ latitude: 37.5, longitude: 127.0, matchedAddress: 'x' });
    expect((await runStoreGeocodeTick()).succeeded).toBe(5);
  });
});

// ══════════════════════════════════════════════════════════════════════
// 8. OAuth 콜백
// ══════════════════════════════════════════════════════════════════════

function encodeState(obj: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(obj)).toString('base64');
}

describe('OAuth 콜백 — 마이페이지', () => {
  it('카카오: 위조된 origin 으로는 외부로 보내지 않고, 취소하면 마이페이지로 돌아감', async () => {
    const res = await request(app)
      .get('/auth/kakao/taghere-callback')
      .query({ state: encodeState({ isMyPage: true, origin: 'https://evil.example' }), error: 'access_denied' });
    expect(res.status).toBe(302);
    expect(res.headers.location).not.toContain('evil.example');
    expect(res.headers.location).toMatch(/\/taghere-my\?error=access_denied$/);
  });

  it('카카오: 로그인 성공 시 #token 으로 돌아가고, 증표에 카카오ID·정규화된 번호가 들어감', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const u = String(url);
      if (u.includes('kauth.kakao.com')) return new Response(JSON.stringify({ access_token: 'AT' }));
      if (u.includes('kapi.kakao.com')) {
        return new Response(JSON.stringify({ id: 4242, kakao_account: { phone_number: '+82 10-1234-5678' } }));
      }
      throw new Error(`unexpected fetch ${u}`);
    });

    const res = await request(app)
      .get('/auth/kakao/taghere-callback')
      .query({ state: encodeState({ isMyPage: true, origin: 'http://localhost:3000' }), code: 'CODE' });
    expect(res.status).toBe(302);
    const location = res.headers.location as string;
    expect(location.startsWith('http://localhost:3000/taghere-my#token=')).toBe(true);
    expect(location).not.toContain('kakaoId=');

    const token = decodeURIComponent(location.split('#token=')[1]);
    const decoded = jwt.verify(token, process.env.CUSTOMER_JWT_SECRET!) as any;
    expect(decoded).toMatchObject({ typ: 'customer', provider: 'kakao', kakaoId: '4242', phone: PHONE });
  });

  it('네이버: 취소하면 마이페이지로, 번호가 없으면 phone_required', async () => {
    const cancel = await request(app)
      .get('/auth/naver/callback')
      .query({ state: encodeState({ isMyPage: true, origin: 'https://evil.example' }), error: 'access_denied' });
    expect(cancel.status).toBe(302);
    expect(cancel.headers.location).not.toContain('evil.example');
    expect(cancel.headers.location).toMatch(/\/taghere-my\?error=access_denied$/);

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const u = String(url);
      if (u.includes('nid.naver.com')) return new Response(JSON.stringify({ access_token: 'AT' }));
      if (u.includes('openapi.naver.com')) return new Response(JSON.stringify({ resultcode: '00', response: { id: 'N1' } }));
      throw new Error(`unexpected fetch ${u}`);
    });
    const noPhone = await request(app)
      .get('/auth/naver/callback')
      .query({ state: encodeState({ isMyPage: true, origin: 'http://localhost:3000' }), code: 'CODE' });
    expect(noPhone.headers.location).toBe('http://localhost:3000/taghere-my?error=phone_required');
  });

  it('네이버: 번호가 있으면 번호만 담은 증표 발급', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const u = String(url);
      if (u.includes('nid.naver.com')) return new Response(JSON.stringify({ access_token: 'AT' }));
      if (u.includes('openapi.naver.com')) {
        return new Response(JSON.stringify({ resultcode: '00', response: { id: 'N1', mobile: '010-1234-5678' } }));
      }
      throw new Error(`unexpected fetch ${u}`);
    });
    const res = await request(app)
      .get('/auth/naver/callback')
      .query({ state: encodeState({ isMyPage: true, origin: 'http://localhost:3000' }), code: 'CODE' });
    const token = decodeURIComponent((res.headers.location as string).split('#token=')[1]);
    const decoded = jwt.verify(token, process.env.CUSTOMER_JWT_SECRET!) as any;
    expect(decoded).toMatchObject({ typ: 'customer', provider: 'naver', phone: PHONE });
    expect(decoded.kakaoId).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════════
// 9. 리뷰 반영 — 링크 검증 · 차단 대상 번호
// ══════════════════════════════════════════════════════════════════════

describe('리뷰 반영', () => {
  it('https 가 아닌 네이버 플레이스 링크는 지도·지갑 응답에서 빠짐', async () => {
    const coords = { latitude: 37.5, longitude: 127.0 };
    const bad = await createStore({ ...coords, naverPlaceUrl: 'javascript:alert(1)' });
    const good = await createStore({ ...coords, naverPlaceUrl: 'https://naver.me/abc' });
    await createCustomer(bad.id, { phone: PHONE, phoneLastDigits: '12345678' });
    await createCustomer(good.id, { phone: PHONE, phoneLastDigits: '12345678' });

    const map = await request(app).get('/api/public/stores/map');
    const byId = Object.fromEntries(map.body.stores.map((s: any) => [s.id, s.naverPlaceUrl]));
    expect(byId[bad.id]).toBeNull();
    expect(byId[good.id]).toBe('https://naver.me/abc');

    const mine = await request(app).get('/api/my-page').set('Authorization', `Bearer ${phoneToken()}`);
    const cards = Object.fromEntries(mine.body.stores.map((s: any) => [s.storeId, s.naverPlaceUrl]));
    expect(cards[bad.id]).toBeNull();
  });

  it('탈퇴 시 카카오ID 로만 연결된 다른 번호(가족 번호 등)는 광고 명부에서 차단하지 않음', async () => {
    const store = await createStore();
    await createCustomer(store.id, { phone: '010-9999-0000', phoneLastDigits: '99990000', kakaoId: 'FAM' });
    const res = await request(app).post('/api/my-page/withdraw').set('Authorization', `Bearer ${kakaoToken('FAM', PHONE)}`);
    expect(res.status).toBe(200);
    expect(await prisma.uniqueCustomer.findUnique({ where: { phone: '01099990000' } })).toBeNull();
    expect((await prisma.uniqueCustomer.findUniqueOrThrow({ where: { phone: PHONE } })).suppressed).toBe(true);
  });
});
