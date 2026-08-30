// 특성화 테스트 — CRM → V2 매장 상태 push (연결 키 재설계 Phase 3)
//
// 고정하는 동작:
//  1) buildEnrollRedirectUrl 의 경로 규칙 (MEMBERSHIP > STAMP(하이트진로 분기) > POINTS, 비활성/무slug → null)
//  2) pushCrmStateToV2 가 v2StoreId 미연결 매장을 push 없이 skip 하는 것
//  3) push 바디가 { enabled, redirectUrl, slug } 전체 상태인 것
import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import { buildEnrollRedirectUrl, pushCrmStateToV2 } from '../../services/crm-state-push.js';
import { CRM_BASE_URL } from '../../services/taghere-api.js';

describe('buildEnrollRedirectUrl', () => {
  const base = { slug: 'test-slug', crmEnabled: true, enrollmentMode: 'POINTS', isHitejinro: false, stampEnabled: false };

  it('POINTS 모드는 taghere-enroll 경로', () => {
    expect(buildEnrollRedirectUrl(base)).toBe(`${CRM_BASE_URL}/taghere-enroll/test-slug?orderId={orderId}`);
  });

  it('MEMBERSHIP 모드는 스탬프 활성과 무관하게 member 경로 (모드 수렴 우선순위)', () => {
    expect(buildEnrollRedirectUrl({ ...base, enrollmentMode: 'MEMBERSHIP', stampEnabled: true }))
      .toBe(`${CRM_BASE_URL}/taghere-enroll-member/test-slug?orderId={orderId}`);
  });

  it('STAMP 모드(또는 스탬프 설정 활성)는 stamp 경로', () => {
    expect(buildEnrollRedirectUrl({ ...base, enrollmentMode: 'STAMP' }))
      .toBe(`${CRM_BASE_URL}/taghere-enroll-stamp/test-slug?orderId={orderId}`);
    expect(buildEnrollRedirectUrl({ ...base, stampEnabled: true }))
      .toBe(`${CRM_BASE_URL}/taghere-enroll-stamp/test-slug?orderId={orderId}`);
  });

  it('하이트진로 매장의 스탬프는 전용 경로 (기존 notifyCrmOn 은 이 분기를 태울 수 없던 버그)', () => {
    expect(buildEnrollRedirectUrl({ ...base, enrollmentMode: 'STAMP', isHitejinro: true }))
      .toBe(`${CRM_BASE_URL}/taghere-enroll-stamp-hitejinro/test-slug?orderId={orderId}`);
  });

  it('비활성 또는 slug 없음 → null (V2 리다이렉트 클리어)', () => {
    expect(buildEnrollRedirectUrl({ ...base, crmEnabled: false })).toBeNull();
    expect(buildEnrollRedirectUrl({ ...base, slug: null })).toBeNull();
  });
});

describe('pushCrmStateToV2', () => {
  const fetchMock = vi.fn();
  let linkedStoreId = '';
  let unlinkedStoreId = '';

  beforeAll(async () => {
    const linked = await prisma.store.create({
      data: { name: 'push 대상', slug: 'push-linked', v2StoreId: 'SR000000000000000000000PUSH1', crmEnabled: true, enrollmentMode: 'MEMBERSHIP' },
    });
    linkedStoreId = linked.id;
    const unlinked = await prisma.store.create({
      data: { name: 'push 미연결', slug: 'push-unlinked', crmEnabled: true },
    });
    unlinkedStoreId = unlinked.id;
  });

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('v2StoreId 미연결 매장은 fetch 없이 skip (no_v2_store_id)', async () => {
    const r = await pushCrmStateToV2(unlinkedStoreId);
    expect(r).toMatchObject({ pushed: false, reason: 'no_v2_store_id' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('연결 매장은 PUT /api/webhooks/crm/stores/{v2StoreId}/state 로 전체 상태를 보낸다', async () => {
    fetchMock.mockResolvedValue({ ok: true } as any);
    const r = await pushCrmStateToV2(linkedStoreId);
    expect(r.pushed).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/webhooks/crm/stores/SR000000000000000000000PUSH1/state');
    expect(init.method).toBe('PUT');
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      enabled: true,
      redirectUrl: `${CRM_BASE_URL}/taghere-enroll-member/push-linked?orderId={orderId}`,
      slug: 'push-linked',
    });
  });

  it('V2 가 5xx 로 거절하면 pushed=false + 사유 반환 (실패를 삼키지 않는다)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, text: async () => 'unavailable' } as any);
    const r = await pushCrmStateToV2(linkedStoreId);
    expect(r).toMatchObject({ pushed: false, reason: 'v2_503' });
  });
});
