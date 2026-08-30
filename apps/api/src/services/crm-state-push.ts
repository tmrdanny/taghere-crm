/**
 * CRM → V2 매장 상태 전체 push (멱등)
 *
 * on/off/모드변경으로 흩어져 있던 notifyCrmOn/Off(V2 분기)를 대체한다.
 * CRM 이 진실원천으로서 { enabled, redirectUrl, slug } 전체 상태를 V2 에 밀어넣고,
 * V2 는 받은 값을 그대로 저장한다 — 부분 전송이 없으므로 순서 의존·재시도 불가 문제가 사라진다.
 *
 * - 매장 식별: stores.v2StoreId (V2 internal.stores.id). 없으면 push 불가 → 경고 로그 + 실패 반환
 * - redirectUrl 은 여기서 조립한다 (경로 규칙은 CRM 웹앱의 라우팅 지식이므로 V2 로 새지 않게)
 * - 실패를 삼키지 않는다: 호출부가 결과를 보고 경고를 응답에 실을 수 있도록 { pushed, reason } 반환
 */
import { prisma } from '../lib/prisma.js';
import { CRM_BASE_URL, V2_API_URL, V2_API_TOKEN, resolveCrmPageMode } from './taghere-api.js';
import { V2_STORE_ID_RE } from './store-ref.js';

export interface CrmStatePushResult {
  pushed: boolean;
  reason?: string;
  state?: { enabled: boolean; redirectUrl: string | null; slug: string | null };
}

/** 등록 페이지 경로 — enrollmentMode/스탬프/하이트진로 판정의 단일 지점 */
export function buildEnrollRedirectUrl(store: {
  slug: string | null;
  crmEnabled: boolean;
  enrollmentMode: string;
  isHitejinro: boolean;
  stampEnabled: boolean;
}): string | null {
  if (!store.crmEnabled || !store.slug) return null;
  const mode = resolveCrmPageMode({ enrollmentMode: store.enrollmentMode, isStampMode: store.stampEnabled });
  let pathSegment = 'taghere-enroll';
  if (mode === 'MEMBERSHIP') {
    pathSegment = 'taghere-enroll-member';
  } else if (mode === 'STAMP') {
    pathSegment = store.isHitejinro ? 'taghere-enroll-stamp-hitejinro' : 'taghere-enroll-stamp';
  }
  return `${CRM_BASE_URL}/${pathSegment}/${store.slug}?orderId={orderId}`;
}

export async function pushCrmStateToV2(storeId: string): Promise<CrmStatePushResult> {
  if (!V2_API_URL || !V2_API_TOKEN) {
    console.log('[CrmStatePush] V2 config not set, skipping');
    return { pushed: false, reason: 'v2_config_not_set' };
  }

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      v2StoreId: true,
      crmEnabled: true,
      slug: true,
      enrollmentMode: true,
      isHitejinro: true,
      stampSetting: { select: { enabled: true } },
    },
  });
  if (!store) return { pushed: false, reason: 'store_not_found' };
  if (!store.v2StoreId) {
    console.warn(`[CrmStatePush] v2StoreId 없음 - CRM storeId=${storeId} (백필 누락 또는 V1 전용 매장)`);
    return { pushed: false, reason: 'no_v2_store_id' };
  }
  if (!V2_STORE_ID_RE.test(store.v2StoreId)) {
    // write 경계 검증을 우회해 저장된 오염 값 방어 — URL 경로에 그대로 들어가면 안 된다
    console.error(`[CrmStatePush] v2StoreId 형식 불일치, push 중단 - CRM storeId=${storeId}, v2StoreId=${store.v2StoreId.slice(0, 40)}`);
    return { pushed: false, reason: 'invalid_v2_store_id' };
  }

  const state = {
    enabled: store.crmEnabled,
    redirectUrl: buildEnrollRedirectUrl({
      slug: store.slug,
      crmEnabled: store.crmEnabled,
      enrollmentMode: store.enrollmentMode,
      isHitejinro: store.isHitejinro,
      stampEnabled: !!store.stampSetting?.enabled,
    }),
    slug: store.slug,
  };

  try {
    const response = await fetch(`${V2_API_URL}/api/webhooks/crm/stores/${encodeURIComponent(store.v2StoreId)}/state`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${V2_API_TOKEN}`,
      },
      body: JSON.stringify(state),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error(`[CrmStatePush] failed - v2StoreId=${store.v2StoreId}, status=${response.status}, body=${text.slice(0, 300)}`);
      return { pushed: false, reason: `v2_${response.status}`, state };
    }
    console.log(`[CrmStatePush] success - v2StoreId=${store.v2StoreId}, enabled=${state.enabled}, redirectUrl=${state.redirectUrl ?? '-'}`);
    return { pushed: true, state };
  } catch (error: any) {
    console.error(`[CrmStatePush] error - v2StoreId=${store.v2StoreId}:`, error?.message ?? error);
    return { pushed: false, reason: 'network_error', state };
  }
}
