// 특성화 테스트 — POST /api/external/register (연결 키 재설계 Phase 2·3)
//
// 고정하는 동작:
//  1) 신규 등록(created): storeId(body) → stores.v2StoreId 저장, 응답 계약 {result:'created', storeId, staffUserId, slug}
//  2) 같은 storeId 재호출(linked): 새 매장을 만들지 않고 기존 매장 반환 — 중복 CRM 매장(에이직피자형) 구조적 차단
//  3) 이메일 exists: 기존 매장에 v2StoreId 백필, 이미 다른 값이면 덮어쓰지 않음
//  4) 하위호환: storeId 없는 구버전 요청도 기존처럼 동작
//
// notifyCrmOn / pushCrmStateToV2 는 외부 경계 — mock 으로 차단하고 호출 여부만 본다.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { TEST_WEBHOOK_TOKEN } from '../helpers/test-env.js';

const pushMock = vi.hoisted(() => vi.fn());
const notifyOnMock = vi.hoisted(() => vi.fn());

vi.mock('../../services/crm-state-push.js', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return { ...original, pushCrmStateToV2: pushMock };
});
vi.mock('../../services/taghere-api.js', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return { ...original, notifyCrmOn: notifyOnMock };
});

const auth = (r: request.Test) => r.set('Authorization', `Bearer ${TEST_WEBHOOK_TOKEN}`);

const baseBody = {
  email: 'register-test@tmr.com',
  storeName: '레지스터 특성화 매장',
  ownerName: '테스트 오너',
  phone: '010-0000-0000',
  source: 'v2',
};

beforeEach(async () => {
  pushMock.mockReset().mockResolvedValue({ pushed: true });
  notifyOnMock.mockReset().mockResolvedValue(undefined);
  await prisma.store.deleteMany({});
});

describe('POST /api/external/register', () => {
  it('신규 등록: v2StoreId 저장 + created 응답 + 상태 push', async () => {
    const res = await auth(request(app).post('/api/external/register'))
      .send({ ...baseBody, storeId: 'SR00000000000000000000TEST01' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ result: 'created' });
    expect(res.body.slug).toBeTruthy();

    const store = await prisma.store.findUnique({ where: { id: res.body.storeId } });
    expect(store?.v2StoreId).toBe('SR00000000000000000000TEST01');
    expect(store?.taghereVersion).toBe('v2');
    expect(pushMock).toHaveBeenCalledWith(res.body.storeId);
  });

  it('같은 storeId 재호출(오너 이메일이 달라도): 매장을 새로 만들지 않고 exists 반환', async () => {
    const first = await auth(request(app).post('/api/external/register'))
      .send({ ...baseBody, storeId: 'SR00000000000000000000TEST02' });
    expect(first.status).toBe(201);

    const second = await auth(request(app).post('/api/external/register'))
      .send({ ...baseBody, email: 'different-owner@tmr.com', storeId: 'SR00000000000000000000TEST02' });

    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ result: 'exists', storeId: first.body.storeId });
    expect(await prisma.store.count()).toBe(1);
  });

  it('이메일 exists: 기존 매장의 비어 있는 v2StoreId 를 백필한다', async () => {
    const created = await auth(request(app).post('/api/external/register')).send(baseBody); // storeId 없이 생성
    expect(created.status).toBe(201);
    expect((await prisma.store.findUnique({ where: { id: created.body.storeId } }))?.v2StoreId).toBeNull();

    const again = await auth(request(app).post('/api/external/register'))
      .send({ ...baseBody, storeId: 'SR00000000000000000000TEST03' });

    expect(again.status).toBe(200);
    expect(again.body.result).toBe('exists');
    expect((await prisma.store.findUnique({ where: { id: created.body.storeId } }))?.v2StoreId).toBe('SR00000000000000000000TEST03');
  });

  it('이메일 exists + 이미 다른 v2StoreId: 덮어쓰지 않는다', async () => {
    const created = await auth(request(app).post('/api/external/register'))
      .send({ ...baseBody, storeId: 'SR00000000000000000000TEST04' });
    expect(created.status).toBe(201);

    const conflicting = await auth(request(app).post('/api/external/register'))
      .send({ ...baseBody, storeId: 'SR00000000000000000000TEST99' });

    expect(conflicting.status).toBe(200); // exists 계약 유지 (경고 로그만)
    expect((await prisma.store.findUnique({ where: { id: created.body.storeId } }))?.v2StoreId).toBe('SR00000000000000000000TEST04');
  });

  it('하위호환: storeId 없는 구버전 요청은 기존 계약대로 동작 (push 대신 legacy notifyCrmOn)', async () => {
    const res = await auth(request(app).post('/api/external/register')).send(baseBody);

    expect(res.status).toBe(201);
    expect(res.body.result).toBe('created');
    expect(pushMock).not.toHaveBeenCalled();
    expect(notifyOnMock).toHaveBeenCalledTimes(1);
  });
});
