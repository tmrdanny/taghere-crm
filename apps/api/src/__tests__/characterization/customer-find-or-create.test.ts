/**
 * 특성화(characterization) 테스트 — 고객 find-or-create 사이트별 생성 기본값 고정.
 *
 * 이 저장소에는 인라인 고객 find-or-create 사이트가 다수 존재하며,
 * 사이트마다 생성 시 기본값(특히 consentMarketing)이 다르고 그 차이는 법적으로 의미가 있다.
 * 이 테스트는 "현재 동작"을 그대로 고정하는 트립와이어다 — 동작을 통일/수정하면 실패해야 한다.
 *
 * 고정하는 사이트:
 *  1. services/customer-identity.ts findOrCreateCustomerByPhone  → consentMarketing: true
 *  2. POST /api/customers/visit-source (공개)                     → 고객 생성 없음 (customerId 기반 업데이트)
 *  3. POST /api/customers/feedback (공개)                         → 고객 생성 없음, ExternalCustomer 는 consentMarketing: true 로 생성
 *  4. POST /api/taghere/survey-answers (공개)                     → 고객 생성 없음 (SurveyAnswer upsert)
 *  5. POST /api/taghere/auto-earn (공개, fetchOrder 모킹)          → consentMarketing: true + consentKakao: true
 *  6. POST /api/customers (인증, 수동 등록)                        → consentMarketing 생략 → 스키마 기본값 false
 *  7. POST /api/customers/bulk (인증, 엑셀 대량 등록)              → consentMarketing 생략 → 스키마 기본값 false
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// 외부 경계 모킹: 태그히어 모바일오더 API 조회(fetchOrder)만 무력화.
// 나머지 export(isValidWebhookToken, notifyCrmOn 등)는 원본 유지 — 다른 라우트 import가 깨지지 않도록.
vi.mock('../../services/taghere-api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/taghere-api.js')>();
  return {
    ...actual,
    fetchOrder: vi.fn(async () => null),
  };
});

import { app } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { findOrCreateCustomerByPhone } from '../../services/customer-identity.js';

const STORE_ID = 'char-cfoc-store-1';
const STORE_SLUG = 'char-cfoc-store';
const OTHER_STORE_ID = 'char-cfoc-store-2';

let authToken: string;

beforeAll(() => {
  // app.ts → load-env.ts 가 레포 루트 .env 를 로드한다. 혹시 실패했으면 auth 테스트가 무의미하므로 확인.
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET not loaded — root .env must define it for authed tests');
  }
  authToken = jwt.sign(
    { id: 'char-staff-1', email: 'char-test@example.com', storeId: STORE_ID, role: 'OWNER' },
    process.env.JWT_SECRET,
  );
});

beforeEach(async () => {
  // FK-safe 순서로 이 파일이 건드리는 테이블만 비운다 (전용 테스트 DB)
  await prisma.surveyAnswer.deleteMany();
  await prisma.customerFeedback.deleteMany();
  await prisma.pointLedger.deleteMany();
  await prisma.stampLedger.deleteMany();
  await prisma.visitOrOrder.deleteMany();
  await prisma.pendingPointAccrual.deleteMany();
  await prisma.pendingStampAccrual.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.surveyQuestion.deleteMany();
  await prisma.externalCustomerWeeklySlot.deleteMany();
  await prisma.externalCustomer.deleteMany();
  await prisma.store.deleteMany();

  await prisma.store.create({
    data: {
      id: STORE_ID,
      slug: STORE_SLUG,
      name: '특성화테스트매장',
      addressSido: '서울특별시',
      addressSigungu: '강남구',
      // 알림톡 자동발송 경로가 실행되지 않도록(0포인트 적립이라 원래도 스킵되지만 이중 안전망)
      pointsAlimtalkEnabled: false,
    },
  });
});

// ─────────────────────────────────────────────────────────────
// 1. findOrCreateCustomerByPhone (services/customer-identity.ts)
// ─────────────────────────────────────────────────────────────
describe('findOrCreateCustomerByPhone — 서버 간 적립 경로 생성 기본값', () => {
  it('11자리 번호: 하이픈 포맷으로 저장 + consentMarketing=true/consentAt 설정', async () => {
    const { customer, isNewCustomer } = await findOrCreateCustomerByPhone(
      STORE_ID,
      '010-1234-5678',
      '서울특별시',
      '강남구',
    );

    expect(isNewCustomer).toBe(true);
    // 저장 형식: 11자리는 하이픈 재조립, 검색키는 뒤 8자리
    expect(customer.phone).toBe('010-1234-5678');
    expect(customer.phoneLastDigits).toBe('12345678');
    // 동의 기본값 — 이 사이트는 마케팅 동의를 true 로 생성한다 (법적으로 의미 있는 차이)
    expect(customer.consentMarketing).toBe(true);
    expect(customer.consentAt).toBeInstanceOf(Date);
    expect(customer.consentSms).toBe(false);
    expect(customer.consentKakao).toBe(false);
    // 통계 초기값
    expect(customer.visitCount).toBe(0);
    expect(customer.totalPoints).toBe(0);
    expect(customer.totalStamps).toBe(0);
    expect(customer.lastVisitAt).toBeNull();
    // 지역: 시/도는 줄임말로 축약, 시/군/구는 원본 그대로
    expect(customer.regionSido).toBe('서울');
    expect(customer.regionSigungu).toBe('강남구');
    // 그 외 식별자/프로필은 비어 있음
    expect(customer.name).toBeNull();
    expect(customer.kakaoId).toBeNull();

    const rows = await prisma.customer.findMany({ where: { storeId: STORE_ID } });
    expect(rows).toHaveLength(1);
  });

  it('+82 국제번호: 0 치환 후 11자리 하이픈 포맷으로 저장', async () => {
    const { customer } = await findOrCreateCustomerByPhone(STORE_ID, '+82 10-1234-5678', null, null);
    expect(customer.phone).toBe('010-1234-5678');
    expect(customer.phoneLastDigits).toBe('12345678');
    expect(customer.regionSido).toBeNull();
    expect(customer.regionSigungu).toBeNull();
  });

  it('11자리가 아닌 번호: 숫자만 그대로 저장(하이픈 포맷 없음)', async () => {
    const { customer } = await findOrCreateCustomerByPhone(STORE_ID, '1234-5678', null, null);
    expect(customer.phone).toBe('12345678');
    expect(customer.phoneLastDigits).toBe('12345678');
  });

  it('기존 고객이 있으면 그대로 반환하고 동의값을 건드리지 않는다', async () => {
    const seeded = await prisma.customer.create({
      data: {
        storeId: STORE_ID,
        phone: '01012345678',
        phoneLastDigits: '12345678',
        consentMarketing: false,
        consentAt: null,
      },
    });

    const { customer, isNewCustomer } = await findOrCreateCustomerByPhone(
      STORE_ID,
      '010-1234-5678',
      '서울특별시',
      '강남구',
    );

    expect(isNewCustomer).toBe(false);
    expect(customer.id).toBe(seeded.id);

    const after = await prisma.customer.findUniqueOrThrow({ where: { id: seeded.id } });
    expect(after.consentMarketing).toBe(false);
    expect(after.consentAt).toBeNull();
    const rows = await prisma.customer.findMany({ where: { storeId: STORE_ID } });
    expect(rows).toHaveLength(1);
  });

  it('동시 첫 거래 경쟁: 두 호출 모두 성공하고 행은 1개, isNewCustomer 는 정확히 한 번만 true', async () => {
    const [a, b] = await Promise.all([
      findOrCreateCustomerByPhone(STORE_ID, '010-7777-8888', null, null),
      findOrCreateCustomerByPhone(STORE_ID, '010-7777-8888', null, null),
    ]);

    expect(a.customer.id).toBe(b.customer.id);
    expect([a.isNewCustomer, b.isNewCustomer].filter(Boolean)).toHaveLength(1);

    const rows = await prisma.customer.findMany({
      where: { storeId: STORE_ID, phoneLastDigits: '77778888' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].consentMarketing).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// 2. POST /api/customers/visit-source (공개, 무인증)
// ─────────────────────────────────────────────────────────────
describe('POST /api/customers/visit-source — 고객 생성 없음, customerId 기반 업데이트', () => {
  it('customerId 없으면 400', async () => {
    const res = await request(app).post('/api/customers/visit-source').send({ visitSource: 'naver' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: '고객 ID가 필요합니다.' });
  });

  it('visitSource 없으면 조회 없이 성공 응답', async () => {
    const res = await request(app).post('/api/customers/visit-source').send({ customerId: 'nope' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: '방문 경로 없음' });
  });

  it('모르는 customerId 는 404 — 새 고객을 만들지 않는다', async () => {
    const res = await request(app)
      .post('/api/customers/visit-source')
      .send({ customerId: 'char-no-such-customer', visitSource: 'naver' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: '고객을 찾을 수 없습니다.' });
    expect(await prisma.customer.count()).toBe(0);
  });

  it('기존 고객: visitSource 덮어쓰기 + 응답 시각 기록, 동의값은 불변 (매장 스코프/인증 없음)', async () => {
    const seeded = await prisma.customer.create({
      data: { storeId: STORE_ID, phone: '01000001111', phoneLastDigits: '00001111', visitSource: 'friend' },
    });

    const res = await request(app)
      .post('/api/customers/visit-source')
      .send({ customerId: seeded.id, visitSource: 'naver' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, visitSource: 'naver' });

    const after = await prisma.customer.findUniqueOrThrow({ where: { id: seeded.id } });
    expect(after.visitSource).toBe('naver');
    expect(after.visitSourceUpdatedAt).toBeInstanceOf(Date);
    expect(after.consentMarketing).toBe(false);
    expect(after.consentAt).toBeNull();
    expect(await prisma.customer.count()).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────
// 3. POST /api/customers/feedback (공개, 무인증)
// ─────────────────────────────────────────────────────────────
describe('POST /api/customers/feedback — 고객 생성 없음, ExternalCustomer 만 consentMarketing=true 생성', () => {
  it('customerId 없으면 400', async () => {
    const res = await request(app).post('/api/customers/feedback').send({ feedbackRating: 5 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: '고객 ID가 필요합니다.' });
  });

  it('별점/내용 모두 없으면 저장 없이 성공 응답', async () => {
    const res = await request(app).post('/api/customers/feedback').send({ customerId: 'whatever' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: '피드백 없음' });
    expect(await prisma.customerFeedback.count()).toBe(0);
  });

  it('모르는 customerId 는 404 — 새 고객을 만들지 않는다', async () => {
    const res = await request(app)
      .post('/api/customers/feedback')
      .send({ customerId: 'char-no-such-customer', feedbackRating: 5 });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: '고객을 찾을 수 없습니다.' });
    expect(await prisma.customer.count()).toBe(0);
  });

  it('기존 고객: CustomerFeedback 누적 + 고객 최신 피드백 갱신, 동의값 불변', async () => {
    const seeded = await prisma.customer.create({
      data: { storeId: STORE_ID, phone: '01000002222', phoneLastDigits: '00002222' },
    });

    const res = await request(app)
      .post('/api/customers/feedback')
      .send({ customerId: seeded.id, feedbackText: '맛있어요' }); // 별점 없이 내용만

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const feedbacks = await prisma.customerFeedback.findMany({ where: { customerId: seeded.id } });
    expect(feedbacks).toHaveLength(1);
    // 별점 미제공 시 0 으로 저장된다 (rating: feedbackRating || 0)
    expect(feedbacks[0].rating).toBe(0);
    expect(feedbacks[0].text).toBe('맛있어요');

    const after = await prisma.customer.findUniqueOrThrow({ where: { id: seeded.id } });
    expect(after.feedbackRating).toBeNull(); // feedbackRating || null
    expect(after.feedbackText).toBe('맛있어요');
    expect(after.feedbackAt).toBeInstanceOf(Date);
    expect(after.consentMarketing).toBe(false);
    expect(await prisma.customer.count()).toBe(1);
    // preferredCategories 없으면 ExternalCustomer 미생성
    expect(await prisma.externalCustomer.count()).toBe(0);
  });

  it('preferredCategories + 전화번호 + 연령대 산출 가능하면 ExternalCustomer 를 consentMarketing=true 로 생성 (지역은 하드코딩)', async () => {
    const seeded = await prisma.customer.create({
      data: {
        storeId: STORE_ID,
        phone: '01099998888',
        phoneLastDigits: '99998888',
        birthYear: 1990, // 2026년 기준 36세 → THIRTIES
      },
    });

    const res = await request(app)
      .post('/api/customers/feedback')
      .send({ customerId: seeded.id, feedbackRating: 5, preferredCategories: ['CAFE'] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const external = await prisma.externalCustomer.findMany();
    expect(external).toHaveLength(1);
    // 전화번호는 Customer.phone 저장값 그대로 (재정규화 없음)
    expect(external[0].phone).toBe('01099998888');
    expect(external[0].ageGroup).toBe('THIRTIES');
    // 매장 실제 주소와 무관하게 하드코딩된 지역값 (축약형 아님)
    expect(external[0].regionSido).toBe('서울특별시');
    expect(external[0].regionSigungu).toBe('강남구');
    expect(external[0].preferredCategories).toBe('["CAFE"]');
    expect(external[0].consentMarketing).toBe(true);
    expect(external[0].consentAt).toBeInstanceOf(Date);

    // Customer 는 새로 생성되지 않고, 마케팅 동의도 여전히 false
    const after = await prisma.customer.findUniqueOrThrow({ where: { id: seeded.id } });
    expect(after.consentMarketing).toBe(false);
    expect(await prisma.customer.count()).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────
// 4. POST /api/taghere/survey-answers (공개, 무인증)
// ─────────────────────────────────────────────────────────────
describe('POST /api/taghere/survey-answers — 고객 생성 없음, SurveyAnswer upsert', () => {
  it('customerId 나 answers 없으면 400', async () => {
    const res = await request(app).post('/api/taghere/survey-answers').send({ customerId: 'x', answers: [] });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: '고객 ID와 답변이 필요합니다.' });
  });

  it('모르는 customerId 는 404 — 새 고객을 만들지 않는다', async () => {
    const res = await request(app)
      .post('/api/taghere/survey-answers')
      .send({ customerId: 'char-no-such-customer', answers: [{ questionId: 'q1', valueText: 'a' }] });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: '고객을 찾을 수 없습니다.' });
    expect(await prisma.customer.count()).toBe(0);
  });

  it('upsert: 생성 후 재제출 시 갱신, questionId 없는 항목은 무시, storeId 는 고객에서 복사', async () => {
    const seeded = await prisma.customer.create({
      data: { storeId: STORE_ID, phone: '01000003333', phoneLastDigits: '00003333' },
    });
    const question = await prisma.surveyQuestion.create({
      data: { storeId: STORE_ID, type: 'TEXT', label: '방문 목적이 무엇인가요?' },
    });

    const res1 = await request(app)
      .post('/api/taghere/survey-answers')
      .send({
        customerId: seeded.id,
        answers: [
          { questionId: question.id, valueText: '데이트' },
          { valueText: 'questionId 없는 항목 — 무시됨' },
        ],
      });
    expect(res1.status).toBe(200);
    expect(res1.body).toEqual({ success: true });

    const created = await prisma.surveyAnswer.findMany();
    expect(created).toHaveLength(1);
    expect(created[0].questionId).toBe(question.id);
    expect(created[0].customerId).toBe(seeded.id);
    expect(created[0].storeId).toBe(STORE_ID);
    expect(created[0].valueText).toBe('데이트');
    expect(created[0].valueDate).toBeNull();

    const res2 = await request(app)
      .post('/api/taghere/survey-answers')
      .send({ customerId: seeded.id, answers: [{ questionId: question.id, valueText: '회식' }] });
    expect(res2.status).toBe(200);

    const updated = await prisma.surveyAnswer.findMany();
    expect(updated).toHaveLength(1);
    expect(updated[0].valueText).toBe('회식');

    // 고객은 생성/변경되지 않는다
    expect(await prisma.customer.count()).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────
// 5. POST /api/taghere/auto-earn (공개, fetchOrder → null 모킹)
// ─────────────────────────────────────────────────────────────
describe('POST /api/taghere/auto-earn — 카카오 자동 적립 생성 기본값 (consentMarketing=true + consentKakao=true)', () => {
  it('신규 kakaoId: 고객 생성 — consentMarketing/consentKakao=true, visitCount 는 트랜잭션에서 1로 증가', async () => {
    const res = await request(app)
      .post('/api/taghere/auto-earn')
      .send({ kakaoId: '999000111', slug: STORE_SLUG, ordersheetId: 'char-ord-1' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      points: 0, // fetchOrder null → resultPrice 0 → 0포인트
      totalPoints: 0,
      storeName: '특성화테스트매장',
      customerId: expect.any(String),
      resultPrice: 0,
      isNewCustomer: true,
      deferred: false,
      hasExistingPreferences: false,
      hasVisitSource: false,
    });

    const rows = await prisma.customer.findMany({ where: { storeId: STORE_ID } });
    expect(rows).toHaveLength(1);
    const c = rows[0];
    expect(c.kakaoId).toBe('999000111');
    expect(c.phone).toBeNull();
    expect(c.phoneLastDigits).toBeNull();
    // 이 사이트의 동의 기본값: 마케팅 + 카카오 모두 true
    expect(c.consentMarketing).toBe(true);
    expect(c.consentKakao).toBe(true);
    expect(c.consentSms).toBe(false);
    expect(c.consentAt).toBeInstanceOf(Date);
    // 생성은 0이지만 같은 요청의 적립 트랜잭션에서 첫 방문으로 +1
    expect(c.visitCount).toBe(1);
    expect(c.totalPoints).toBe(0);
    expect(c.lastVisitAt).toBeInstanceOf(Date);
    expect(c.regionSido).toBe('서울');
    expect(c.regionSigungu).toBe('강남구');

    // 0포인트라 원장은 없고 방문 기록만 남는다
    expect(await prisma.pointLedger.count()).toBe(0);
    const visits = await prisma.visitOrOrder.findMany();
    expect(visits).toHaveLength(1);
    expect(visits[0].orderId).toBe('char-ord-1');
    expect(visits[0].totalAmount).toBeNull();
  });

  it('다른 매장에 같은 kakaoId 고객이 있으면 프로필(이름/전화/생년)을 복사해 생성한다', async () => {
    await prisma.store.create({ data: { id: OTHER_STORE_ID, name: '다른매장' } });
    await prisma.customer.create({
      data: {
        storeId: OTHER_STORE_ID,
        kakaoId: '999000222',
        name: '김복사',
        phone: '010-5678-1234',
        phoneLastDigits: '56781234',
        birthYear: 1995,
        consentMarketing: false, // 원본 매장 동의값은 복사되지 않는다
      },
    });

    const res = await request(app)
      .post('/api/taghere/auto-earn')
      .send({ kakaoId: '999000222', slug: STORE_SLUG, ordersheetId: 'char-ord-2' });

    expect(res.status).toBe(200);
    expect(res.body.isNewCustomer).toBe(true);

    const created = await prisma.customer.findFirstOrThrow({
      where: { storeId: STORE_ID, kakaoId: '999000222' },
    });
    // 프로필은 복사 (전화번호는 원본 저장 형식 그대로)
    expect(created.name).toBe('김복사');
    expect(created.phone).toBe('010-5678-1234');
    expect(created.phoneLastDigits).toBe('56781234');
    expect(created.birthYear).toBe(1995);
    // 동의값은 복사가 아니라 이 사이트의 기본값(true)
    expect(created.consentMarketing).toBe(true);
    expect(created.consentKakao).toBe(true);
    expect(created.consentAt).toBeInstanceOf(Date);
    // 매장별 독립 통계는 초기화 후 이번 방문 +1
    expect(created.totalPoints).toBe(0);
    expect(created.visitCount).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────
// 6. POST /api/customers (인증 — 수동 등록)
// ─────────────────────────────────────────────────────────────
describe('POST /api/customers — 수동 등록은 consentMarketing 생략(스키마 기본값 false)', () => {
  it('전화번호 없으면 400', async () => {
    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: '홍길동' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: '전화번호는 필수입니다.' });
  });

  it('생성 기본값: 전화는 숫자만 저장, visitCount=1, consentMarketing=false/consentAt=null', async () => {
    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: '홍길동', phone: '010-5555-6666', initialPoints: 500 });

    expect(res.status).toBe(201);
    expect(res.body.isVip).toBe(false);
    expect(res.body.isNew).toBe(true);

    const rows = await prisma.customer.findMany({ where: { storeId: STORE_ID } });
    expect(rows).toHaveLength(1);
    const c = rows[0];
    expect(c.name).toBe('홍길동');
    // auto-earn/웹훅 경로와 달리 하이픈 없이 숫자만 저장
    expect(c.phone).toBe('01055556666');
    expect(c.phoneLastDigits).toBe('55556666');
    // 핵심 대비점: 자동 적립 사이트들과 달리 마케팅 동의를 설정하지 않는다 → 스키마 기본값 false
    expect(c.consentMarketing).toBe(false);
    expect(c.consentSms).toBe(false);
    expect(c.consentKakao).toBe(false);
    expect(c.consentAt).toBeNull();
    // 수동 등록은 등록 자체를 방문 1회로 센다
    expect(c.visitCount).toBe(1);
    expect(c.lastVisitAt).toBeInstanceOf(Date);
    expect(c.totalPoints).toBe(500);
    expect(c.feedbackAt).toBeNull();
    expect(c.regionSido).toBe('서울');
    expect(c.regionSigungu).toBe('강남구');

    const ledger = await prisma.pointLedger.findMany({ where: { customerId: c.id } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0].delta).toBe(500);
    expect(ledger[0].balance).toBe(500);
    expect(ledger[0].type).toBe('EARN');
    expect(ledger[0].reason).toBe('신규 등록 포인트');
  });

  it('같은 매장 내 전화번호 뒷자리 중복이면 400', async () => {
    await prisma.customer.create({
      data: { storeId: STORE_ID, phone: '01055556666', phoneLastDigits: '55556666' },
    });
    const res = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ phone: '010-5555-6666' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: '이미 등록된 전화번호입니다.' });
    expect(await prisma.customer.count()).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────
// 7. POST /api/customers/bulk (인증 — 엑셀 대량 등록)
// ─────────────────────────────────────────────────────────────
describe('POST /api/customers/bulk — 대량 등록도 consentMarketing 생략(false), visitCount=0', () => {
  it('생성/스킵/에러 분류와 생성 행 기본값을 고정한다', async () => {
    // DB 에 이미 존재하는 번호 (스킵 대상)
    await prisma.customer.create({
      data: { storeId: STORE_ID, phone: '01033334444', phoneLastDigits: '33334444' },
    });

    const res = await request(app)
      .post('/api/customers/bulk')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        customers: [
          {
            phone: '010-1111-2222',
            name: ' 김대량 ',
            gender: '남',
            birthYear: '1990',
            birthday: '3-5',
            memo: ' 단골 ',
            initialPoints: '100',
            initialStamps: 2,
          },
          { phone: '01011112222' }, // 파일 내 중복 (같은 뒷 8자리)
          { name: '전화없음' }, // 전화번호 없음
          { phone: '1234567' }, // 8자리 미만
          { phone: '010-3333-4444' }, // DB 기존 → 스킵
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      created: 1,
      skipped: 1,
      total: 5,
      errors: [
        { row: 3, phone: '01011112222', reason: '파일 내 중복 전화번호입니다.' },
        { row: 4, phone: '', reason: '전화번호가 없습니다.' },
        { row: 5, phone: '1234567', reason: '전화번호가 너무 짧습니다.' },
      ],
    });

    const created = await prisma.customer.findFirstOrThrow({
      where: { storeId: STORE_ID, phoneLastDigits: '11112222' },
    });
    expect(created.phone).toBe('01011112222'); // 숫자만 저장
    expect(created.name).toBe('김대량'); // trim
    expect(created.gender).toBe('MALE'); // '남' → MALE
    expect(created.birthYear).toBe(1990);
    expect(created.birthday).toBe('03-05'); // 0 패딩
    expect(created.memo).toBe('단골'); // trim
    // 핵심 대비점: 동의 미설정 → 스키마 기본값 false
    expect(created.consentMarketing).toBe(false);
    expect(created.consentAt).toBeNull();
    // 수동 단건 등록(visitCount=1)과 달리 대량 등록은 0
    expect(created.visitCount).toBe(0);
    expect(created.lastVisitAt).toBeNull();
    expect(created.totalPoints).toBe(100);
    // 주의(현재 동작 고정): initialStamps 는 스탬프 원장만 만들고 customer.totalStamps 는 0 으로 남는다
    expect(created.totalStamps).toBe(0);
    // 대량 등록은 지역 정보를 세팅하지 않는다 (수동 단건 등록과의 차이)
    expect(created.regionSido).toBeNull();
    expect(created.regionSigungu).toBeNull();

    const pointLedger = await prisma.pointLedger.findMany({ where: { customerId: created.id } });
    expect(pointLedger).toHaveLength(1);
    expect(pointLedger[0].delta).toBe(100);
    expect(pointLedger[0].reason).toBe('엑셀 대량 등록 초기 포인트');

    const stampLedger = await prisma.stampLedger.findMany({ where: { customerId: created.id } });
    expect(stampLedger).toHaveLength(1);
    expect(stampLedger[0].delta).toBe(2);
    expect(stampLedger[0].balance).toBe(2);
    expect(stampLedger[0].reason).toBe('엑셀 대량 등록 초기 스탬프');

    // 총 고객 수: 기존 1 + 신규 1
    expect(await prisma.customer.count()).toBe(2);
  });

  it('빈 배열이면 400', async () => {
    const res = await request(app)
      .post('/api/customers/bulk')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ customers: [] });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: '등록할 고객 데이터가 없습니다.' });
  });
});
