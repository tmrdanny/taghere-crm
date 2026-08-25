// 특성화(Characterization) 테스트 — 현재 동작을 그대로 고정한다. 절대 "수정"하지 않는다.
//
// 대상 플로우:
//  1) POST /api/points/earn, POST /api/points/use            (routes/points.ts)
//  2) POST /api/taghere/stamp-earn (비프랜차이즈·비메타씨티)  (routes/taghere.ts)
//  3) POST /api/customers/:id/cancel-order-item              (routes/customers.ts)
//
// 외부 경계 모킹: services/taghere-api.js 의 fetchOrder 만 모킹한다 (실제 태그히어
// 주문서비스 HTTP 호출). 알림톡은 DB outbox(alimtalk_outbox) 행으로 남으므로 모킹하지
// 않고 행을 직접 검증한다. 야화 웹훅은 YAHWA_WEBHOOK_URL 미설정으로 no-op,
// 메타씨티는 metacityEnabled=false 매장만 사용하므로 호출되지 않는다.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const { fetchOrderMock } = vi.hoisted(() => ({
  fetchOrderMock: vi.fn(),
}));

vi.mock('../../services/taghere-api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/taghere-api.js')>();
  return {
    ...actual,
    fetchOrder: fetchOrderMock,
  };
});

import { app } from '../../app.js';
import { prisma } from '../../lib/prisma.js';

// ── 헬퍼 ──────────────────────────────────────────────────────────────

let seq = 0;
function uid(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}`;
}

async function createStore(overrides: Record<string, any> = {}) {
  return prisma.store.create({
    data: {
      name: '테스트매장',
      slug: uid('slug'),
      ...overrides,
    },
  });
}

async function createStaffAndToken(storeId: string) {
  const staff = await prisma.staffUser.create({
    data: {
      storeId,
      email: `${uid('staff')}@test.local`,
      passwordHash: 'x',
      name: '직원',
    },
  });
  const token = jwt.sign(
    { id: staff.id, email: staff.email, storeId, role: 'OWNER' },
    process.env.JWT_SECRET!,
    { expiresIn: '1h' },
  );
  return { staff, token };
}

async function createScanToken(storeId: string, overrides: Record<string, any> = {}) {
  return prisma.stampScanToken.create({
    data: {
      storeId,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      ...overrides,
    },
  });
}

/** fire-and-forget 사이드이펙트(outbox 행)를 폴링으로 기다린다. */
async function waitFor<T>(fn: () => Promise<T | null | undefined>, timeoutMs = 4000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > deadline) throw new Error('waitFor: timed out');
    await new Promise((r) => setTimeout(r, 50));
  }
}

const REWARDS = [{ tier: 5, description: '아메리카노 1잔', options: null }];

beforeEach(async () => {
  fetchOrderMock.mockReset();
  fetchOrderMock.mockResolvedValue(null);
  // AlimTalkOutbox 는 FK 관계가 없어 store cascade 로 지워지지 않는다 → 별도 삭제.
  await prisma.alimTalkOutbox.deleteMany({});
  // 나머지(customer/ledger/visit/token/pending/wallet/setting/staff)는 store cascade.
  await prisma.store.deleteMany({});
});

// ══════════════════════════════════════════════════════════════════════
// 1. POST /api/points/earn · /api/points/use
// ══════════════════════════════════════════════════════════════════════

describe('POST /api/points/earn', () => {
  it('인증 없음/잘못된 토큰 → 401 (정확한 한국어 에러)', async () => {
    const noAuth = await request(app).post('/api/points/earn').send({ points: 100 });
    expect(noAuth.status).toBe(401);
    expect(noAuth.body).toEqual({ error: '인증 토큰이 필요합니다.' });

    const badToken = await request(app)
      .post('/api/points/earn')
      .set('Authorization', 'Bearer not-a-jwt')
      .send({ points: 100 });
    expect(badToken.status).toBe(401);
    expect(badToken.body).toEqual({ error: '유효하지 않은 토큰입니다.' });
  });

  it('기존 고객(customerId) 적립 성공 — 응답 형태·PointLedger·고객 필드 갱신', async () => {
    const store = await createStore();
    const { staff, token } = await createStaffAndToken(store.id);
    const customer = await prisma.customer.create({
      data: { storeId: store.id, name: '김철수', totalPoints: 500, visitCount: 3 },
    });

    const res = await request(app)
      .post('/api/points/earn')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId: customer.id, points: 100, orderId: 'ord-earn-1' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      customer: { id: customer.id, name: '김철수', totalPoints: 600, visitCount: 4 },
      earnedPoints: 100,
      newBalance: 600,
    });

    const ledgers = await prisma.pointLedger.findMany({ where: { storeId: store.id } });
    expect(ledgers).toHaveLength(1);
    expect(ledgers[0]).toMatchObject({
      customerId: customer.id,
      staffUserId: staff.id,
      delta: 100,
      balance: 600,
      type: 'EARN',
      reason: '방문 적립',
      orderId: 'ord-earn-1',
    });

    const updated = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(updated.totalPoints).toBe(600);
    expect(updated.visitCount).toBe(4);
    expect(updated.lastVisitAt).not.toBeNull();

    // orderId 지정 시 방문/주문 기록 upsert
    const visit = await prisma.visitOrOrder.findUnique({
      where: { storeId_orderId: { storeId: store.id, orderId: 'ord-earn-1' } },
    });
    expect(visit).toMatchObject({ customerId: customer.id, orderId: 'ord-earn-1' });
  });

  it('미등록 전화번호 → 고객을 새로 만들어 적립 (find-or-create 특성화)', async () => {
    const store = await createStore();
    const { token } = await createStaffAndToken(store.id);

    const res = await request(app)
      .post('/api/points/earn')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '010-1234-5678', points: 200 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.customer).toMatchObject({ name: null, totalPoints: 200, visitCount: 1 });
    expect(res.body.earnedPoints).toBe(200);
    expect(res.body.newBalance).toBe(200);

    // 생성된 고객: phone 은 뒤 8자리에서 재조립된 010-XXXX-XXXX 포맷
    const created = await prisma.customer.findFirst({
      where: { storeId: store.id, phoneLastDigits: '12345678' },
    });
    expect(created).toMatchObject({
      phone: '010-1234-5678',
      phoneLastDigits: '12345678',
      consentMarketing: true,
      totalPoints: 200,
      visitCount: 1,
      regionSido: null,
      regionSigungu: null,
    });
    expect(created!.consentAt).not.toBeNull();
  });

  it('같은 날 두 번째 적립 → 포인트는 적립되지만 visitCount 는 다시 오르지 않는다', async () => {
    const store = await createStore();
    const { token } = await createStaffAndToken(store.id);
    const customer = await prisma.customer.create({
      data: { storeId: store.id, totalPoints: 0, visitCount: 0 },
    });

    const first = await request(app)
      .post('/api/points/earn')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId: customer.id, points: 100 });
    expect(first.status).toBe(200);
    expect(first.body.customer.visitCount).toBe(1);

    const second = await request(app)
      .post('/api/points/earn')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId: customer.id, points: 50 });
    expect(second.status).toBe(200);
    expect(second.body.customer).toMatchObject({ totalPoints: 150, visitCount: 1 });

    const ledgerCount = await prisma.pointLedger.count({ where: { customerId: customer.id } });
    expect(ledgerCount).toBe(2);
  });

  it('검증 실패 케이스 — points 누락/0, 식별자 없음, 미존재 고객', async () => {
    const store = await createStore();
    const { token } = await createStaffAndToken(store.id);

    const noPoints = await request(app)
      .post('/api/points/earn')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '010-1234-5678' });
    expect(noPoints.status).toBe(400);
    expect(noPoints.body).toEqual({ error: '적립할 포인트를 입력해주세요.' });

    const zeroPoints = await request(app)
      .post('/api/points/earn')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '010-1234-5678', points: 0 });
    expect(zeroPoints.status).toBe(400);
    expect(zeroPoints.body).toEqual({ error: '적립할 포인트를 입력해주세요.' });

    const noIdentifier = await request(app)
      .post('/api/points/earn')
      .set('Authorization', `Bearer ${token}`)
      .send({ points: 100 });
    expect(noIdentifier.status).toBe(400);
    expect(noIdentifier.body).toEqual({ error: '전화번호 또는 고객 ID가 필요합니다.' });

    const unknownCustomer = await request(app)
      .post('/api/points/earn')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId: 'no-such-customer', points: 100 });
    expect(unknownCustomer.status).toBe(404);
    expect(unknownCustomer.body).toEqual({ error: '고객을 찾을 수 없습니다.' });
  });

  it('매직포스 단독회원(STANDALONE) 매장 → 400 수동 조정 차단 메시지', async () => {
    const store = await createStore({
      metacityEnabled: true,
      metacityMembershipType: 'STANDALONE',
    });
    const { token } = await createStaffAndToken(store.id);

    const res = await request(app)
      .post('/api/points/earn')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '010-1234-5678', points: 100 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error:
        '매직포스 단독 회원 매장은 메타씨티 POS 가 포인트의 진실원천이라 어드민에서 수동 조정할 수 없습니다.',
    });
  });
});

describe('POST /api/points/use', () => {
  it('사용 성공 — 응답 형태·USE 원장·잔액 차감 (reason 지정)', async () => {
    const store = await createStore();
    const { staff, token } = await createStaffAndToken(store.id);
    const customer = await prisma.customer.create({
      data: { storeId: store.id, name: '이영희', totalPoints: 500, visitCount: 2 },
    });

    const res = await request(app)
      .post('/api/points/use')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId: customer.id, points: 200, reason: '쿠폰 교환' });

    expect(res.status).toBe(200);
    // /earn 과 달리 customer 응답에 visitCount 가 없다
    expect(res.body).toEqual({
      success: true,
      customer: { id: customer.id, name: '이영희', totalPoints: 300 },
      usedPoints: 200,
      newBalance: 300,
    });

    const ledger = await prisma.pointLedger.findFirstOrThrow({
      where: { customerId: customer.id },
    });
    expect(ledger).toMatchObject({
      staffUserId: staff.id,
      delta: -200,
      balance: 300,
      type: 'USE',
      reason: '쿠폰 교환',
      orderId: null,
    });
  });

  it('reason 생략 시 기본 사유는 "포인트 사용"', async () => {
    const store = await createStore();
    const { token } = await createStaffAndToken(store.id);
    const customer = await prisma.customer.create({
      data: { storeId: store.id, totalPoints: 100 },
    });

    const res = await request(app)
      .post('/api/points/use')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId: customer.id, points: 100 });
    expect(res.status).toBe(200);

    const ledger = await prisma.pointLedger.findFirstOrThrow({
      where: { customerId: customer.id },
    });
    expect(ledger.reason).toBe('포인트 사용');
  });

  it('잔액 부족 → 400 "보유 포인트가 부족합니다." (원장·잔액 무변화)', async () => {
    const store = await createStore();
    const { token } = await createStaffAndToken(store.id);
    const customer = await prisma.customer.create({
      data: { storeId: store.id, totalPoints: 500 },
    });

    const res = await request(app)
      .post('/api/points/use')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId: customer.id, points: 501 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: '보유 포인트가 부족합니다.' });

    const after = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(after.totalPoints).toBe(500);
    expect(await prisma.pointLedger.count({ where: { customerId: customer.id } })).toBe(0);
  });

  it('검증 실패 케이스 — customerId 누락, points 누락, 미존재 고객', async () => {
    const store = await createStore();
    const { token } = await createStaffAndToken(store.id);
    const customer = await prisma.customer.create({
      data: { storeId: store.id, totalPoints: 100 },
    });

    const noCustomer = await request(app)
      .post('/api/points/use')
      .set('Authorization', `Bearer ${token}`)
      .send({ points: 100 });
    expect(noCustomer.status).toBe(400);
    expect(noCustomer.body).toEqual({ error: '고객 ID가 필요합니다.' });

    const noPoints = await request(app)
      .post('/api/points/use')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId: customer.id });
    expect(noPoints.status).toBe(400);
    expect(noPoints.body).toEqual({ error: '사용할 포인트를 입력해주세요.' });

    const unknown = await request(app)
      .post('/api/points/use')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId: 'nope', points: 10 });
    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual({ error: '고객을 찾을 수 없습니다.' });
  });

  it('전화번호 있는 고객 + 지갑 잔액 충분 → 알림톡 outbox 행이 생긴다 (POINTS_EARNED 타입 재사용)', async () => {
    const store = await createStore({ name: '알림매장' });
    const { token } = await createStaffAndToken(store.id);
    await prisma.wallet.create({ data: { storeId: store.id, balance: 1000 } });
    const customer = await prisma.customer.create({
      data: {
        storeId: store.id,
        phone: '010-1111-2222',
        phoneLastDigits: '11112222',
        totalPoints: 500,
      },
    });

    const res = await request(app)
      .post('/api/points/use')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId: customer.id, points: 200 });
    expect(res.status).toBe(200);

    const ledger = await prisma.pointLedger.findFirstOrThrow({
      where: { customerId: customer.id, type: 'USE' },
    });

    // enqueue 는 fire-and-forget 이므로 outbox 행을 폴링으로 기다린다
    const outbox = await waitFor(() =>
      prisma.alimTalkOutbox.findUnique({
        where: {
          idempotencyKey: `points_used:${store.id}:${customer.id}:${ledger.id}`,
        },
      }),
    );
    // 포인트 "사용" 알림인데 messageType 은 POINTS_EARNED 를 재사용한다 (현재 동작)
    expect(outbox).toMatchObject({
      storeId: store.id,
      customerId: customer.id,
      phone: '01011112222',
      messageType: 'POINTS_EARNED',
      status: 'PENDING',
      variables: {
        '#{매장명}': '알림매장',
        '#{적립포인트}': '200',
        '#{잔여포인트}': '300',
      },
    });
  });
});

// ══════════════════════════════════════════════════════════════════════
// 2. POST /api/taghere/stamp-earn (비프랜차이즈·비메타씨티 메인라인)
// ══════════════════════════════════════════════════════════════════════

describe('POST /api/taghere/stamp-earn', () => {
  async function createStampStore(settingOverrides: Record<string, any> = {}) {
    const store = await createStore({ name: '스탬프매장' });
    await prisma.stampSetting.create({
      data: {
        storeId: store.id,
        enabled: true,
        rewards: REWARDS,
        alimtalkEnabled: false,
        ...settingOverrides,
      },
    });
    return store;
  }

  it('파라미터 검증 — 누락/형식 오류/미존재 매장 (정확한 에러 바디)', async () => {
    const missing = await request(app).post('/api/taghere/stamp-earn').send({});
    expect(missing.status).toBe(400);
    expect(missing.body).toEqual({
      success: false,
      error: 'missing_params',
      message: 'kakaoId와 slug가 필요합니다.',
    });

    const badKakao = await request(app)
      .post('/api/taghere/stamp-earn')
      .send({ kakaoId: 'abc123x', slug: 'whatever' });
    expect(badKakao.status).toBe(400);
    expect(badKakao.body).toEqual({
      success: false,
      error: 'invalid_kakao_id',
      message: '유효하지 않은 kakaoId입니다.',
    });

    const noStore = await request(app)
      .post('/api/taghere/stamp-earn')
      .send({ kakaoId: '12345', slug: 'no-such-slug' });
    expect(noStore.status).toBe(404);
    expect(noStore.body).toEqual({
      success: false,
      error: 'store_not_found',
      message: '매장을 찾을 수 없습니다.',
    });
  });

  it('스탬프 비활성 매장 → 400 stamp_disabled', async () => {
    const store = await createStampStore({ enabled: false });
    const res = await request(app)
      .post('/api/taghere/stamp-earn')
      .send({ kakaoId: '12345', slug: store.slug });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: 'stamp_disabled',
      message: '스탬프 기능이 비활성화되어 있습니다.',
    });
  });

  it('standalone(주문 미연동) 요청에 스캔 토큰이 없거나 만료 → 400 invalid_token', async () => {
    const store = await createStampStore();

    const noToken = await request(app)
      .post('/api/taghere/stamp-earn')
      .send({ kakaoId: '12345', slug: store.slug });
    expect(noToken.status).toBe(400);
    expect(noToken.body).toEqual({
      success: false,
      error: 'invalid_token',
      message: '링크가 만료되었어요. 매장에서 다시 스캔해주세요.',
    });

    const expired = await createScanToken(store.id, {
      expiresAt: new Date(Date.now() - 1000),
    });
    const expiredRes = await request(app)
      .post('/api/taghere/stamp-earn')
      .send({ kakaoId: '12345', slug: store.slug, t: expired.id });
    expect(expiredRes.status).toBe(400);
    expect(expiredRes.body).toEqual({
      success: false,
      error: 'invalid_token',
      message: '링크가 만료되었어요. 매장에서 다시 스캔해주세요.',
    });
  });

  it('신규 고객 + 유효 토큰 → 적립 성공 (응답 바디 전체·원장·고객·방문기록·토큰 소비)', async () => {
    const store = await createStampStore();
    const scanToken = await createScanToken(store.id);

    const res = await request(app)
      .post('/api/taghere/stamp-earn')
      .send({ kakaoId: '77001', slug: store.slug, t: scanToken.id });

    expect(res.status).toBe(200);
    const customer = await prisma.customer.findFirstOrThrow({
      where: { storeId: store.id, kakaoId: '77001' },
    });
    expect(res.body).toEqual({
      success: true,
      currentStamps: 1,
      customerId: customer.id,
      storeName: '스탬프매장',
      isNewCustomer: true,
      hasVisitSource: false,
      rewards: REWARDS,
      reward5Description: '아메리카노 1잔',
      reward5IsRandom: null, // options 가 null 이면 IsRandom 도 null 로 내려간다 (현재 동작)
      drawnReward: null,
      drawnRewardTier: null,
    });

    expect(customer).toMatchObject({
      totalStamps: 1,
      visitCount: 1,
      consentMarketing: true,
      consentKakao: true,
    });

    const ledger = await prisma.stampLedger.findFirstOrThrow({
      where: { customerId: customer.id },
    });
    expect(ledger).toMatchObject({
      storeId: store.id,
      type: 'EARN',
      delta: 1,
      balance: 1,
      ordersheetId: null,
      earnMethod: 'NFC_TAG', // 기본값
      tableLabel: null,
      reason: '스탬프 적립',
      drawnReward: null,
      drawnRewardTier: null,
    });

    const visit = await prisma.visitOrOrder.findFirstOrThrow({
      where: { customerId: customer.id },
    });
    expect(visit).toMatchObject({ orderId: null, totalAmount: null, items: null });

    const consumed = await prisma.stampScanToken.findUniqueOrThrow({
      where: { id: scanToken.id },
    });
    expect(consumed.status).toBe('CONSUMED');
    expect(consumed.consumedByCustomerId).toBe(customer.id);
    expect(consumed.consumedAt).not.toBeNull();
  });

  it('다른 매장에 같은 kakaoId 고객이 있으면 이름/전화/성별을 복사해 신규 생성한다', async () => {
    const otherStore = await createStore({ name: '기존매장' });
    await prisma.customer.create({
      data: {
        storeId: otherStore.id,
        kakaoId: '77002',
        name: '박복사',
        phone: '010-9999-8888',
        phoneLastDigits: '99998888',
        gender: 'FEMALE',
        birthYear: 1990,
      },
    });

    const store = await createStampStore();
    const scanToken = await createScanToken(store.id);

    const res = await request(app)
      .post('/api/taghere/stamp-earn')
      .send({ kakaoId: '77002', slug: store.slug, t: scanToken.id });
    expect(res.status).toBe(200);
    expect(res.body.isNewCustomer).toBe(true);

    const copied = await prisma.customer.findFirstOrThrow({
      where: { storeId: store.id, kakaoId: '77002' },
    });
    expect(copied).toMatchObject({
      name: '박복사',
      phone: '010-9999-8888',
      phoneLastDigits: '99998888',
      gender: 'FEMALE',
      birthYear: 1990,
    });
  });

  it('첫 방문 보너스(firstStampBonus>1) → 보너스 개수만큼 적립, 사유 "첫 방문 스탬프 적립 (N개)"', async () => {
    const store = await createStampStore({ firstStampBonus: 3 });
    const scanToken = await createScanToken(store.id);

    const res = await request(app)
      .post('/api/taghere/stamp-earn')
      .send({ kakaoId: '77003', slug: store.slug, t: scanToken.id });

    expect(res.status).toBe(200);
    expect(res.body.currentStamps).toBe(3);

    const ledger = await prisma.stampLedger.findFirstOrThrow({
      where: { storeId: store.id },
    });
    expect(ledger).toMatchObject({
      delta: 3,
      balance: 3,
      reason: '첫 방문 스탬프 적립 (3개)',
    });
  });

  it('마일스톤 도달(4→5개) → drawnReward/drawnRewardTier 응답 + 원장에 당첨 기록', async () => {
    const store = await createStampStore();
    await prisma.customer.create({
      data: { storeId: store.id, kakaoId: '77004', totalStamps: 4, visitCount: 2 },
    });
    const scanToken = await createScanToken(store.id);

    const res = await request(app)
      .post('/api/taghere/stamp-earn')
      .send({ kakaoId: '77004', slug: store.slug, t: scanToken.id });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      currentStamps: 5,
      isNewCustomer: false,
      drawnReward: '아메리카노 1잔',
      drawnRewardTier: 5,
    });

    const ledger = await prisma.stampLedger.findFirstOrThrow({
      where: { storeId: store.id },
    });
    expect(ledger).toMatchObject({
      delta: 1,
      balance: 5,
      drawnReward: '아메리카노 1잔',
      drawnRewardTier: 5,
    });
  });

  it('같은 날 재적립 → 400 already_earned_today (보상 정보 포함, 정확한 바디)', async () => {
    const store = await createStampStore();
    const t1 = await createScanToken(store.id);
    const first = await request(app)
      .post('/api/taghere/stamp-earn')
      .send({ kakaoId: '77005', slug: store.slug, t: t1.id });
    expect(first.status).toBe(200);

    const t2 = await createScanToken(store.id);
    const second = await request(app)
      .post('/api/taghere/stamp-earn')
      .send({ kakaoId: '77005', slug: store.slug, t: t2.id });

    expect(second.status).toBe(400);
    expect(second.body).toEqual({
      success: false,
      error: 'already_earned_today',
      message: '오늘 이미 스탬프를 적립했습니다.',
      alreadyEarned: true,
      currentStamps: 1,
      rewards: REWARDS,
      reward5Description: '아메리카노 1잔',
      // 성공 응답과 달리 rewardNIsRandom 키는 내려가지 않는다 (현재 동작)
    });
    // 두 번째 토큰은 소비되지 않는다 (사전 가드에서 반환)
    const tok2 = await prisma.stampScanToken.findUniqueOrThrow({ where: { id: t2.id } });
    expect(tok2.status).toBe('PENDING');
  });

  it('ordersheetId 연동 적립 성공 — 주문 데이터 반영 (원장 사유·방문기록 items/totalAmount)', async () => {
    const store = await createStampStore();
    fetchOrderMock.mockResolvedValue({
      resultPrice: 15000,
      tableLabel: '3',
      items: [{ label: '김치찌개', count: 2, price: 8000 }],
    });

    const res = await request(app)
      .post('/api/taghere/stamp-earn')
      .send({
        kakaoId: '77006',
        slug: store.slug,
        ordersheetId: 'ord-happy-1',
        earnMethod: 'TAGHERE_ORDER',
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, currentStamps: 1 });
    expect(res.body.deferred).toBeUndefined();
    expect(fetchOrderMock).toHaveBeenCalledWith('ord-happy-1', 'v1');

    const ledger = await prisma.stampLedger.findFirstOrThrow({
      where: { storeId: store.id },
    });
    expect(ledger).toMatchObject({
      delta: 1,
      balance: 1,
      ordersheetId: 'ord-happy-1',
      earnMethod: 'TAGHERE_ORDER',
      tableLabel: '3',
      reason: '태그히어 주문 적립 (ord-happy-1)',
    });

    const visit = await prisma.visitOrOrder.findUniqueOrThrow({
      where: { storeId_orderId: { storeId: store.id, orderId: 'ord-happy-1' } },
    });
    expect(visit.totalAmount).toBe(15000);
    expect(visit.items).toEqual({
      items: [{ name: '김치찌개', quantity: 2, price: 8000, option: null }],
      tableNumber: '3',
    });
  });

  it('주문서비스가 pointAccrualDeferred=true → 즉시 적립 대신 예약 생성 (deferred 응답)', async () => {
    const store = await createStampStore();
    fetchOrderMock.mockResolvedValue({
      pointAccrualDeferred: true,
      resultPrice: 12000,
      tableLabel: '7',
      items: [{ label: '냉면', count: 1, price: 12000 }],
    });

    const res = await request(app)
      .post('/api/taghere/stamp-earn')
      .send({
        kakaoId: '77007',
        slug: store.slug,
        ordersheetId: 'ord-defer-1',
        earnMethod: 'TAGHERE_ORDER',
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      deferred: true,
      currentStamps: 0, // 잔액은 아직 움직이지 않는다
      isNewCustomer: true,
      drawnReward: null,
      drawnRewardTier: null,
    });

    const customer = await prisma.customer.findFirstOrThrow({
      where: { storeId: store.id, kakaoId: '77007' },
    });
    expect(customer.totalStamps).toBe(0);
    expect(customer.visitCount).toBe(1); // 방문 통계는 즉시 갱신

    expect(await prisma.stampLedger.count({ where: { storeId: store.id } })).toBe(0);

    const pending = await prisma.pendingStampAccrual.findUniqueOrThrow({
      where: { storeId_orderId: { storeId: store.id, orderId: 'ord-defer-1' } },
    });
    expect(pending).toMatchObject({
      customerId: customer.id,
      stampDelta: 1,
      earnMethod: 'TAGHERE_ORDER',
      tableLabel: '7',
      sendAlimtalk: true,
      source: 'IN_APP',
      status: 'PENDING',
    });

    const visit = await prisma.visitOrOrder.findUniqueOrThrow({
      where: { storeId_orderId: { storeId: store.id, orderId: 'ord-defer-1' } },
    });
    expect(visit.totalAmount).toBe(12000);
  });

  it('본인 소유 PENDING 예약이 있는 주문 재요청 → 400 already_reserved', async () => {
    const store = await createStampStore();
    const customer = await prisma.customer.create({
      data: { storeId: store.id, kakaoId: '77008' },
    });
    await prisma.pendingStampAccrual.create({
      data: {
        storeId: store.id,
        customerId: customer.id,
        orderId: 'ord-res-1',
        stampDelta: 1,
        source: 'IN_APP',
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
      },
    });

    const res = await request(app)
      .post('/api/taghere/stamp-earn')
      .send({ kakaoId: '77008', slug: store.slug, ordersheetId: 'ord-res-1' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: 'already_reserved',
      message: '결제 완료 후 적립될 예약이 있습니다.',
    });
  });

  it('CANCELED 예약이 남은 주문(어제 예약) → 409 accrual_canceled', async () => {
    const store = await createStampStore();
    const customer = await prisma.customer.create({
      data: { storeId: store.id, kakaoId: '77009' },
    });
    await prisma.pendingStampAccrual.create({
      data: {
        storeId: store.id,
        customerId: customer.id,
        orderId: 'ord-can-1',
        stampDelta: 1,
        source: 'IN_APP',
        status: 'CANCELED',
        // 오늘 생성분이면 일일 제한(already_earned_today)에 먼저 걸리므로 어제로 세팅
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
      },
    });

    const res = await request(app)
      .post('/api/taghere/stamp-earn')
      .send({ kakaoId: '77009', slug: store.slug, ordersheetId: 'ord-can-1' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      success: false,
      error: 'accrual_canceled',
      message: '취소된 주문입니다.',
    });
  });

  it('이미 적립된 ordersheetId → 400 already_earned_order (다른 매장의 원장도 걸린다)', async () => {
    // 중복 체크가 storeId 스코프 없이 ordersheetId 만 보는 현재 동작 특성화
    const otherStore = await createStore({ name: '남의매장' });
    const otherCustomer = await prisma.customer.create({
      data: { storeId: otherStore.id, kakaoId: '88000' },
    });
    await prisma.stampLedger.create({
      data: {
        storeId: otherStore.id,
        customerId: otherCustomer.id,
        type: 'EARN',
        delta: 1,
        balance: 1,
        ordersheetId: 'ord-dup-1',
      },
    });

    const store = await createStampStore();
    const res = await request(app)
      .post('/api/taghere/stamp-earn')
      .send({ kakaoId: '77010', slug: store.slug, ordersheetId: 'ord-dup-1' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      error: 'already_earned_order',
      message: '이미 적립된 주문입니다.',
    });

    // 거절 응답이지만 고객 행은 이미 생성돼 있다 (현재 동작)
    const created = await prisma.customer.findFirst({
      where: { storeId: store.id, kakaoId: '77010' },
    });
    expect(created).not.toBeNull();
    expect(created!.totalStamps).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// 3. POST /api/customers/:id/cancel-order-item
// ══════════════════════════════════════════════════════════════════════

describe('POST /api/customers/:id/cancel-order-item', () => {
  async function seedCancelFixture(opts: {
    totalPoints?: number;
    items?: any;
    orderId?: string | null;
    pointRatePercent?: number;
  } = {}) {
    const store = await createStore({
      name: '취소매장',
      pointRatePercent: opts.pointRatePercent ?? 5,
    });
    const { token } = await createStaffAndToken(store.id);
    const customer = await prisma.customer.create({
      data: { storeId: store.id, totalPoints: opts.totalPoints ?? 1000 },
    });
    const visit = await prisma.visitOrOrder.create({
      data: {
        storeId: store.id,
        customerId: customer.id,
        orderId: opts.orderId ?? null,
        items:
          opts.items !== undefined
            ? opts.items
            : { items: [{ name: '라떼', price: 10000, quantity: 2 }], tableNumber: '5' },
      },
    });
    return { store, token, customer, visit };
  }

  it('전량 취소 — 응답 바디·ADJUST 원장·잔액 차감·items JSON 갱신', async () => {
    const { store, token, customer, visit } = await seedCancelFixture();

    const res = await request(app)
      .post(`/api/customers/${customer.id}/cancel-order-item`)
      .set('Authorization', `Bearer ${token}`)
      .send({ visitOrOrderId: visit.id, itemIndex: 0 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: '라떼 주문이 취소되었습니다.',
      pointsDeducted: 1000, // 10000원 × 2개 × 5% = 1000P
      cancelledItem: {
        name: '라떼',
        price: 20000,
        cancelledQuantity: 2,
        totalQuantity: 2,
        remainingQuantity: 0,
        isFullyCancelled: true,
      },
    });

    const ledger = await prisma.pointLedger.findFirstOrThrow({
      where: { customerId: customer.id },
    });
    expect(ledger).toMatchObject({
      storeId: store.id,
      delta: -1000,
      balance: 0,
      type: 'ADJUST',
      reason: '주문 취소 차감 (라떼)',
      orderId: null,
      staffUserId: null,
    });

    const after = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(after.totalPoints).toBe(0);

    const updatedVisit = await prisma.visitOrOrder.findUniqueOrThrow({
      where: { id: visit.id },
    });
    const item = (updatedVisit.items as any).items[0];
    expect(item).toMatchObject({
      name: '라떼',
      price: 10000,
      quantity: 2,
      cancelledQuantity: 2,
      cancelled: true,
    });
    expect(typeof item.cancelledAt).toBe('string');
    expect((updatedVisit.items as any).tableNumber).toBe('5');
  });

  it('부분 취소(cancelQuantity=1) → 수량 비례 차감, 사유에 개수 표기, 잔여수량 안내', async () => {
    const { token, customer, visit } = await seedCancelFixture();

    const res = await request(app)
      .post(`/api/customers/${customer.id}/cancel-order-item`)
      .set('Authorization', `Bearer ${token}`)
      .send({ visitOrOrderId: visit.id, itemIndex: 0, cancelQuantity: 1 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: '라떼 1개가 취소되었습니다. (남은 수량: 1개)',
      pointsDeducted: 500,
      cancelledItem: {
        name: '라떼',
        price: 10000,
        cancelledQuantity: 1,
        totalQuantity: 2,
        remainingQuantity: 1,
        isFullyCancelled: false,
      },
    });

    const ledger = await prisma.pointLedger.findFirstOrThrow({
      where: { customerId: customer.id },
    });
    expect(ledger).toMatchObject({
      delta: -500,
      balance: 500,
      reason: '주문 취소 차감 (라떼 1개)',
    });

    // 남은 1개 재취소 → 전량 취소로 마무리
    const second = await request(app)
      .post(`/api/customers/${customer.id}/cancel-order-item`)
      .set('Authorization', `Bearer ${token}`)
      .send({ visitOrOrderId: visit.id, itemIndex: 0, cancelQuantity: 1 });
    expect(second.status).toBe(200);
    expect(second.body.message).toBe('라떼 주문이 취소되었습니다.');
    expect(second.body.cancelledItem).toMatchObject({
      cancelledQuantity: 1, // 응답의 cancelledQuantity 는 "이번에 취소한 수량"
      remainingQuantity: 0,
      isFullyCancelled: true,
    });

    const after = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(after.totalPoints).toBe(0);
  });

  it('보유 포인트보다 큰 차감 → 잔액은 0 으로 클램프, 응답 pointsDeducted 는 이론값 그대로', async () => {
    const { token, customer, visit } = await seedCancelFixture({ totalPoints: 300 });

    const res = await request(app)
      .post(`/api/customers/${customer.id}/cancel-order-item`)
      .set('Authorization', `Bearer ${token}`)
      .send({ visitOrOrderId: visit.id, itemIndex: 0 });

    expect(res.status).toBe(200);
    // 실제 차감은 300P 인데 응답은 이론상 차감치 1000 을 그대로 알려준다 (현재 동작)
    expect(res.body.pointsDeducted).toBe(1000);

    const ledger = await prisma.pointLedger.findFirstOrThrow({
      where: { customerId: customer.id },
    });
    expect(ledger).toMatchObject({ delta: -300, balance: 0 });

    const after = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(after.totalPoints).toBe(0);
  });

  it('이미 전량 취소된 아이템 재취소 → 400 "이미 취소된 아이템입니다."', async () => {
    const { token, customer, visit } = await seedCancelFixture();

    const first = await request(app)
      .post(`/api/customers/${customer.id}/cancel-order-item`)
      .set('Authorization', `Bearer ${token}`)
      .send({ visitOrOrderId: visit.id, itemIndex: 0 });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post(`/api/customers/${customer.id}/cancel-order-item`)
      .set('Authorization', `Bearer ${token}`)
      .send({ visitOrOrderId: visit.id, itemIndex: 0 });
    expect(second.status).toBe(400);
    expect(second.body).toEqual({ error: '이미 취소된 아이템입니다.' });
  });

  it('검증 실패 케이스 — 파라미터 누락, 잘못된 인덱스, 미존재 고객/주문, 수량 0', async () => {
    const { token, customer, visit } = await seedCancelFixture();

    const missing = await request(app)
      .post(`/api/customers/${customer.id}/cancel-order-item`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(missing.status).toBe(400);
    expect(missing.body).toEqual({ error: '주문 ID와 아이템 인덱스가 필요합니다.' });

    const badIndex = await request(app)
      .post(`/api/customers/${customer.id}/cancel-order-item`)
      .set('Authorization', `Bearer ${token}`)
      .send({ visitOrOrderId: visit.id, itemIndex: 5 });
    expect(badIndex.status).toBe(400);
    expect(badIndex.body).toEqual({ error: '유효하지 않은 아이템 인덱스입니다.' });

    const noCustomer = await request(app)
      .post('/api/customers/no-such-id/cancel-order-item')
      .set('Authorization', `Bearer ${token}`)
      .send({ visitOrOrderId: visit.id, itemIndex: 0 });
    expect(noCustomer.status).toBe(404);
    expect(noCustomer.body).toEqual({ error: '고객을 찾을 수 없습니다.' });

    const noOrder = await request(app)
      .post(`/api/customers/${customer.id}/cancel-order-item`)
      .set('Authorization', `Bearer ${token}`)
      .send({ visitOrOrderId: 'no-such-visit', itemIndex: 0 });
    expect(noOrder.status).toBe(404);
    expect(noOrder.body).toEqual({ error: '주문을 찾을 수 없습니다.' });

    const zeroQty = await request(app)
      .post(`/api/customers/${customer.id}/cancel-order-item`)
      .set('Authorization', `Bearer ${token}`)
      .send({ visitOrOrderId: visit.id, itemIndex: 0, cancelQuantity: 0 });
    expect(zeroQty.status).toBe(400);
    expect(zeroQty.body).toEqual({ error: '취소할 수량은 1 이상이어야 합니다.' });
  });

  it('지연 적립 예약(PENDING)이 있는 주문 → 잔액 대신 예약 금액을 감액한다 (별도 응답 형태)', async () => {
    const { store, token, customer, visit } = await seedCancelFixture({
      orderId: 'ord-cancel-p1',
      items: { items: [{ name: '냉면', price: 10000, quantity: 1 }], tableNumber: '2' },
      totalPoints: 700,
    });
    await prisma.pendingPointAccrual.create({
      data: {
        storeId: store.id,
        customerId: customer.id,
        orderId: 'ord-cancel-p1',
        purAmt: 10000,
        ratePercent: 5,
        earnPoints: 800,
        source: 'IN_APP',
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
      },
    });

    const res = await request(app)
      .post(`/api/customers/${customer.id}/cancel-order-item`)
      .set('Authorization', `Bearer ${token}`)
      .send({ visitOrOrderId: visit.id, itemIndex: 0 });

    expect(res.status).toBe(200);
    // 이 분기는 message/cancelledItem 없이 예약 감액 정보만 내려간다 (현재 동작)
    expect(res.body).toEqual({
      success: true,
      cancelledQuantity: 1,
      isFullyCancelled: true,
      pointsDeducted: 0,
      pendingAccrualReduced: 500, // 10000원 × 5% = 500P 감액
    });

    const pending = await prisma.pendingPointAccrual.findUniqueOrThrow({
      where: { storeId_orderId: { storeId: store.id, orderId: 'ord-cancel-p1' } },
    });
    expect(pending.earnPoints).toBe(300);
    expect(pending.status).toBe('PENDING');

    // 고객 잔액·원장은 손대지 않는다
    const after = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(after.totalPoints).toBe(700);
    expect(await prisma.pointLedger.count({ where: { customerId: customer.id } })).toBe(0);
  });
});
