// 매직포스 포인트 버그 수정 검증 테스트 (의도된 동작 변경 — 특성화 아님)
//
//  1) /point/transaction 적립 기준금액: 총액이 아니라 실결제액(purAmt − usedPoint)
//     - 일반 매장 분기: savedPoint/원장 검증
//     - 메타씨티 분기: SAVE_POINT 는 net, PUR_AMT 는 gross 로 나가는지 (syncToMetacity 모킹)
//  2) selectVerifiedCustRow: CUST_SEARCH 응답에서 CP_NO 일치 행만 채택 (오연결 방지)
//
// 외부 경계 모킹: fetchOrder(태그히어 주문 조회), syncToMetacity(메타씨티 HTTP).

import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

const { fetchOrderMock, syncToMetacityMock } = vi.hoisted(() => ({
  fetchOrderMock: vi.fn(),
  syncToMetacityMock: vi.fn(),
}));

vi.mock('../services/taghere-api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/taghere-api.js')>();
  return { ...actual, fetchOrder: fetchOrderMock };
});

vi.mock('../services/metacity.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/metacity.js')>();
  return { ...actual, syncToMetacity: syncToMetacityMock };
});

import { app } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { cacheMetacityCustId, selectVerifiedCustRow } from '../services/metacity.js';
import { TEST_WEBHOOK_TOKEN } from './helpers/test-env.js';

let seq = 0;
function uid(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}`;
}

async function createStore(overrides: Record<string, any> = {}) {
  return prisma.store.create({
    data: { name: '테스트매장', slug: uid('slug'), pointRatePercent: 5, ...overrides },
  });
}

async function createCustomer(storeId: string, overrides: Record<string, any> = {}) {
  seq += 1;
  const digits = `010${String(90000000 + seq).padStart(8, '0')}`;
  return prisma.customer.create({
    data: {
      storeId,
      name: '홍길동',
      phone: digits,
      phoneLastDigits: digits.slice(-8),
      ...overrides,
    },
  });
}

function postTransaction(body: Record<string, any>) {
  fetchOrderMock.mockResolvedValue(null);
  return request(app)
    .post('/api/taghere/webhook/point/transaction')
    .set('Authorization', `Bearer ${TEST_WEBHOOK_TOKEN}`)
    .send(body);
}

describe('POST /point/transaction — 적립 기준은 실결제액(purAmt − usedPoint)', () => {
  it('일반 매장: 포인트 사용 주문은 실결제액 기준으로 적립한다 (21,800 − 5,000 → 840P)', async () => {
    const store = await createStore();
    const customer = await createCustomer(store.id, { totalPoints: 6000 });
    const orderId = uid('ord');

    const res = await postTransaction({
      storeSlug: store.slug,
      crmCustomerId: customer.id,
      orderId,
      purAmt: 21800,
      usedPoint: 5000,
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      savedPoint: 840, // (21800 − 5000) × 5% — 기존 버그는 21800 × 5% = 1090
      usedPoint: 5000,
      balance: 6000 - 5000 + 840,
    });

    const ledgers = await prisma.pointLedger.findMany({
      where: { customerId: customer.id, orderId },
      orderBy: { delta: 'asc' },
    });
    expect(ledgers.map((l) => ({ type: l.type, delta: l.delta }))).toEqual([
      { type: 'USE', delta: -5000 },
      { type: 'EARN', delta: 840 },
    ]);
  });

  it('일반 매장: 전액 포인트 결제는 적립 0 (음수 방지 클램프)', async () => {
    const store = await createStore();
    const customer = await createCustomer(store.id, { totalPoints: 9000 });
    const orderId = uid('ord');

    const res = await postTransaction({
      storeSlug: store.slug,
      crmCustomerId: customer.id,
      orderId,
      purAmt: 8900,
      usedPoint: 8900,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.savedPoint).toBe(0);
    const earn = await prisma.pointLedger.findFirst({
      where: { customerId: customer.id, orderId, type: 'EARN' },
    });
    expect(earn).toBeNull();
  });

  it('일반 매장: 포인트 미사용 주문은 기존과 동일 (10,000 → 500P)', async () => {
    const store = await createStore();
    const customer = await createCustomer(store.id);
    const orderId = uid('ord');

    const res = await postTransaction({
      storeSlug: store.slug,
      crmCustomerId: customer.id,
      orderId,
      purAmt: 10000,
      usedPoint: 0,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.savedPoint).toBe(500);
  });

  it('usedPoint 미전달(undefined)은 0 취급 — 기존 호출자 호환', async () => {
    const store = await createStore();
    const customer = await createCustomer(store.id);

    const res = await postTransaction({
      storeSlug: store.slug,
      crmCustomerId: customer.id,
      orderId: uid('ord'),
      purAmt: 10000,
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ savedPoint: 500, usedPoint: 0 });
  });

  it('usedPoint 문자열은 숫자로 코어스된다', async () => {
    const store = await createStore();
    const customer = await createCustomer(store.id, { totalPoints: 6000 });

    const res = await postTransaction({
      storeSlug: store.slug,
      crmCustomerId: customer.id,
      orderId: uid('ord'),
      purAmt: 21800,
      usedPoint: '5000',
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ savedPoint: 840, usedPoint: 5000 });
  });

  it('음수 usedPoint 는 0 으로 클램프 — 적립 부풀리기 차단', async () => {
    const store = await createStore();
    const customer = await createCustomer(store.id);

    const res = await postTransaction({
      storeSlug: store.slug,
      crmCustomerId: customer.id,
      orderId: uid('ord'),
      purAmt: 10000,
      usedPoint: -100000,
    });

    expect(res.status).toBe(200);
    // 기준금액이 10000 + 100000 으로 부풀지 않고 10000 그대로
    expect(res.body.data).toMatchObject({ savedPoint: 500, usedPoint: 0 });
  });

  it('이연적립(deferUntilPaid): 예약 earnPoints 는 net 스냅샷, purAmt 스냅샷은 총액 유지', async () => {
    const store = await createStore();
    const customer = await createCustomer(store.id, { totalPoints: 6000 });
    const orderId = uid('ord');

    const res = await postTransaction({
      storeSlug: store.slug,
      crmCustomerId: customer.id,
      orderId,
      purAmt: 21800,
      usedPoint: 5000,
      deferUntilPaid: true,
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ savedPoint: 840, usedPoint: 5000, deferred: true });

    const pending = await prisma.pendingPointAccrual.findUniqueOrThrow({
      where: { storeId_orderId: { storeId: store.id, orderId } },
    });
    expect(pending.earnPoints).toBe(840); // 결제완료 전환 시 이 스냅샷이 그대로 적립됨
    expect(pending.purAmt).toBe(21800); // 기록 의미 유지 (총액)
  });

  it('메타씨티 매장: SAVE_POINT 는 실결제액 기준, PUR_AMT 는 총액 유지', async () => {
    const store = await createStore({ metacityEnabled: true, metacityStoreIdx: 'I00000000001' });
    const customer = await createCustomer(store.id);
    const orderId = uid('ord');
    syncToMetacityMock.mockResolvedValue({ ablePoint: 1234, totPoint: 2000, usedPoint: 0 });

    const res = await postTransaction({
      storeSlug: store.slug,
      crmCustomerId: customer.id,
      orderId,
      purAmt: 21800,
      usedPoint: 5000,
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ savedPoint: 840, usedPoint: 5000, balance: 1234 });
    expect(syncToMetacityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        operationType: 'POINT_COMBINE',
        purAmt: 21800, // PUR_AMT 는 총액 유지 (벤더 스펙 확인 전 최소 변경)
        usedPoint: 5000,
        savePoint: 840,
      }),
    );
  });
});

describe('selectVerifiedCustRow — CUST_SEARCH 응답 CP_NO 검증', () => {
  const resp = (rows: any[]) => ({ RESULT_CODE: 'E0000', ERROR_MSG: '', CUST_INFO_LIST: rows });

  it('다중 행에서 첫 행이 아니라 CP_NO 일치 행을 채택한다', () => {
    const row = selectVerifiedCustRow(
      resp([
        { CUST_ID: 'OTHER', CP_NO: '010-4163-6104' },
        { CUST_ID: 'MINE', CP_NO: '010-7997-6104' },
      ]),
      '01079976104',
    );
    expect(row?.CUST_ID).toBe('MINE');
  });

  it('일치 행이 없으면 null (첫 행 폴백 금지)', () => {
    const row = selectVerifiedCustRow(
      resp([{ CUST_ID: 'OTHER', CP_NO: '010-4163-6104' }]),
      '01079976104',
    );
    expect(row).toBeNull();
  });

  it('대시/+82 포맷 차이는 숫자 정규화로 흡수한다', () => {
    const row = selectVerifiedCustRow(
      resp([{ CUST_ID: 'MINE', CP_NO: '01012345678' }]),
      '+82 10-1234-5678',
    );
    expect(row?.CUST_ID).toBe('MINE');
  });

  it('CP_NO 가 없는 행은 채택하지 않는다', () => {
    const row = selectVerifiedCustRow(resp([{ CUST_ID: 'NO_PHONE' }]), '01012345678');
    expect(row).toBeNull();
  });
});

describe('cacheMetacityCustId — (storeId, metacityCustId) 유니크 충돌 처리', () => {
  it('다른 고객이 보유 중인 CUST_ID 는 P2002 를 삼키고 캐시만 건너뛴다', async () => {
    const store = await prisma.store.create({
      data: { name: '테스트매장', slug: uid('slug') },
    });
    const holder = await createCustomer(store.id);
    const other = await createCustomer(store.id);
    const custId = uid('MCID');
    await prisma.customer.update({ where: { id: holder.id }, data: { metacityCustId: custId } });

    await expect(cacheMetacityCustId(other.id, custId)).resolves.toBeUndefined();

    const after = await prisma.customer.findUniqueOrThrow({ where: { id: other.id } });
    expect(after.metacityCustId).toBeNull(); // 캐시는 안 되지만 흐름은 계속
  });
});
