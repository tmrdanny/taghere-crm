/**
 * 태그히어 모바일오더 API 서비스 레이어
 *
 * V1/V2가 매장별로 공존하는 구조를 지원.
 * - V1: ordersheetId 기반, userId(이메일)로 매장 식별
 * - V2: orderId 기반, storeName으로 매장 식별
 */

import { env } from '../config/env.js';

// ── V1 설정 ──
const V1_API_URL = process.env.TAGHERE_API_URL || 'https://api.tag-here.com';
const V1_API_TOKEN = process.env.TAGHERE_API_TOKEN_FOR_CRM || '';

// ── V2 설정 ── (crm-state-push 등 형제 서비스에서도 사용)
export const V2_API_URL = process.env.TAGHERE_V2_API_URL || '';
export const V2_API_TOKEN = process.env.TAGHERE_V2_API_TOKEN || '';

// ── 공통 ──
export const CRM_BASE_URL = env.TAGHERE_CRM_BASE_URL || 'https://taghere-crm-web-dev.onrender.com';

// ── 인바운드 웹훅 토큰 (V1/V2 모두 수용) ──
const WEBHOOK_TOKENS = [
  process.env.TAGHERE_WEBHOOK_TOKEN,
  process.env.TAGHERE_V2_WEBHOOK_TOKEN,
].filter(Boolean) as string[];

export interface TaghereOrderData {
  resultPrice?: number | string;
  totalPrice?: number | string;
  tableLabel?: string;
  tableID?: string;
  orderItems?: any[];
  items?: any[];
  storeName?: string;
  menuLink?: string;
  displayOrderNumber?: string;
  orderNumber?: string;
  /**
   * 후불 + 결제완료 감지 가능 POS 주문 → 적립을 결제완료 시점까지 미뤄야 함.
   * 주문 서비스(V1/V2)가 POS 타입·주문 타입·결제 여부를 보고 계산해 내려준다.
   */
  pointAccrualDeferred?: boolean;
  content?: {
    resultPrice?: number | string;
    totalPrice?: number | string;
    tableLabel?: string;
    tableID?: string;
    items?: any[];
  };
}

/**
 * 웹훅 토큰 검증 (V1/V2 토큰 모두 허용)
 */
export function isValidWebhookToken(token: string): boolean {
  if (WEBHOOK_TOKENS.length === 0) return false;
  return WEBHOOK_TOKENS.includes(token);
}

/**
 * 통합 주문 조회 — version에 따라 V1 또는 V2 API 호출
 */
export async function fetchOrder(orderIdentifier: string, version: string): Promise<TaghereOrderData | null> {
  // 템플릿 플레이스홀더 가드 — {ordersheetId}, {orderId} 등 미치환 값 차단
  if (!orderIdentifier || /^\{.+\}$/.test(orderIdentifier)) {
    console.warn(`[TagHere] Invalid order identifier (template placeholder): ${orderIdentifier}`);
    return null;
  }

  if (version === 'v2') {
    return fetchOrderV2(orderIdentifier);
  }
  return fetchOrderV1(orderIdentifier);
}

// V1: 단일 호출
async function fetchOrderV1(ordersheetId: string): Promise<TaghereOrderData | null> {
  console.log(`[TagHere V1] Fetching ordersheet - ordersheetId: ${ordersheetId}`);

  const response = await fetch(
    `${V1_API_URL}/webhook/crm/ordersheet?ordersheetId=${ordersheetId}`,
    {
      headers: {
        Authorization: `Bearer ${V1_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[TagHere V1] API error:', response.status, errorText);
    // 4xx 에러는 잘못된 요청이므로 null 반환 (404, 422 등)
    if (response.status >= 400 && response.status < 500) return null;
    throw new Error(`TagHere V1 API error: ${response.status}`);
  }

  return response.json() as Promise<TaghereOrderData>;
}

// V2: 2개 API 병렬 호출 → 통합
async function fetchOrderV2(orderId: string): Promise<TaghereOrderData | null> {
  if (!V2_API_URL) {
    console.error('[TagHere V2] TAGHERE_V2_API_URL not configured');
    return null;
  }

  console.log(`[TagHere V2] Fetching order - orderId: ${orderId}`);
  const headers = {
    Authorization: `Bearer ${V2_API_TOKEN}`,
    'Content-Type': 'application/json',
  };

  const [orderRes, menuRes] = await Promise.all([
    fetch(`${V2_API_URL}/api/webhooks/orders/${orderId}`, { headers }).catch((err) => {
      console.error('[TagHere V2] orders API error:', err);
      return null;
    }),
    fetch(`${V2_API_URL}/api/webhooks/menu-link/${orderId}`, { headers }).catch((err) => {
      console.error('[TagHere V2] menu-link API error:', err);
      return null;
    }),
  ]);

  if (!orderRes || !orderRes.ok) {
    if (orderRes?.status === 404) return null;
    console.error('[TagHere V2] orders API failed:', orderRes?.status);
    return null;
  }

  const orderJson = await orderRes.json() as any;
  const menuJson = menuRes?.ok ? await menuRes.json() as any : null;

  // V2는 DataResponse<T> 로 래핑: { status, message, result }
  const order = orderJson?.result ?? orderJson;
  const menu = menuJson?.result ?? menuJson;

  // V2 OrderProductWithoutOrderDto → CRM 다운스트림이 기대하는 item shape로 정규화
  // (다운스트림은 item.price / item.name / item.quantity 등을 fallback 체인으로 읽음)
  const normalizedItems = Array.isArray(order?.orderProducts)
    ? order.orderProducts.map((p: any) => ({
        name: p.label ?? p.title ?? null,
        title: p.title ?? null,
        label: p.label ?? null,
        quantity: p.count ?? 1,
        count: p.count ?? 1,
        price: p.amount ?? 0,
        amount: p.amount ?? 0,
        option: p.orderProductOptions ?? null,
      }))
    : [];

  return {
    resultPrice: order?.totalAmount,
    totalPrice: order?.totalAmount,
    tableLabel: order?.orderReceiverLabel ?? null,
    tableID: order?.orderReceiverId ?? null,
    storeName: order?.storeName,
    displayOrderNumber: order?.orderNumber,
    orderNumber: order?.orderNumber,
    items: normalizedItems,
    orderItems: normalizedItems,
    menuLink: menu?.menuLink ?? null,
    pointAccrualDeferred: order?.pointAccrualDeferred === true,
    content: order,
  };
}

export type CrmPageMode = 'MEMBERSHIP' | 'STAMP' | 'POINTS';

/**
 * 적립 화면(등록 페이지) 선택에 쓰이는 수렴 모드 판별.
 * 우선순위: MEMBERSHIP > (STAMP || 스탬프 활성) > POINTS.
 * `notifyCrmOn` 의 리다이렉트 페이지 선택과 `store-crm-info` 조회가 동일 규칙을 공유한다.
 */
export function resolveCrmPageMode(params: {
  enrollmentMode?: string | null;
  isStampMode: boolean;
}): CrmPageMode {
  if (params.enrollmentMode === 'MEMBERSHIP') return 'MEMBERSHIP';
  if (params.enrollmentMode === 'STAMP' || params.isStampMode) return 'STAMP';
  return 'POINTS';
}

/**
 * CRM ON 알림 — 태그히어 서버에 매장 CRM 활성화 통보
 */
export async function notifyCrmOn(params: {
  version: string;
  userId?: string;     // V1: 오너 이메일
  storeName?: string;  // V2: 매장명 (레거시 키 — v2StoreId 로 대체 중)
  v2StoreId?: string | null; // V2 매장 ID (stores.v2StoreId) — 있으면 V2 가 이 값으로 매장을 찾는다
  slug: string;
  isStampMode: boolean;
  isHitejinro?: boolean;
  enrollmentMode?: string; // 'POINTS' | 'STAMP' | 'MEMBERSHIP'
}): Promise<void> {
  const orderParam = params.version === 'v2' ? 'orderId' : 'ordersheetId';
  const mode = resolveCrmPageMode({ enrollmentMode: params.enrollmentMode, isStampMode: params.isStampMode });
  let pathSegment = 'taghere-enroll';
  if (mode === 'MEMBERSHIP') {
    pathSegment = 'taghere-enroll-member';
  } else if (mode === 'STAMP') {
    pathSegment = params.isHitejinro ? 'taghere-enroll-stamp-hitejinro' : 'taghere-enroll-stamp';
  }
  const redirectUrl = `${CRM_BASE_URL}/${pathSegment}/${params.slug}?${orderParam}={${orderParam}}`;

  if (params.version === 'v2') {
    if (!V2_API_URL || !V2_API_TOKEN) {
      console.log('[TagHere CRM V2] V2 config not set, skipping CRM ON');
      return;
    }
    // V2의 crm_store_slug 컬럼/검증이 100자 제한 — 초과 slug를 보내면 활성화 요청 전체가 400으로 거절되므로 slug만 생략한다.
    let slug: string | undefined = params.slug;
    if (slug.length > 100) {
      console.warn(`[TagHere CRM V2] slug exceeds 100 chars, omitting from CRM ON - storeName: ${params.storeName}, slug: ${slug}`);
      slug = undefined;
    }
    try {
      const response = await fetch(`${V2_API_URL}/api/webhooks/crm/on`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${V2_API_TOKEN}`,
        },
        body: JSON.stringify({ storeId: params.v2StoreId || undefined, storeName: params.storeName, redirectUrl, slug }),
      });
      if (!response.ok) {
        console.error('[TagHere CRM V2] on failed:', response.status, await response.text());
      } else {
        console.log(`[TagHere CRM V2] on success - storeId: ${params.v2StoreId ?? '-'}, storeName: ${params.storeName}, redirectUrl: ${redirectUrl}`);
      }
    } catch (error) {
      console.error('[TagHere CRM V2] on error:', error);
    }
  } else {
    const v1Token = process.env.TAGHERE_API_TOKEN_FOR_CRM || process.env.TAGHERE_WEBHOOK_TOKEN || process.env.TAGHERE_DEV_API_TOKEN || '';
    if (!v1Token) {
      console.log('[TagHere CRM V1] Token not configured, skipping CRM ON');
      return;
    }
    const webhookUrl = process.env.TAGHERE_WEBHOOK_URL || `${V1_API_URL}/webhook/crm`;
    try {
      const response = await fetch(`${webhookUrl}/on`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${v1Token}`,
        },
        body: JSON.stringify({ userId: params.userId, redirectUrl }),
      });
      if (!response.ok) {
        console.error('[TagHere CRM V1] on failed:', response.status, await response.text());
      } else {
        console.log(`[TagHere CRM V1] on success - userId: ${params.userId}, redirectUrl: ${redirectUrl}`);
      }
    } catch (error) {
      console.error('[TagHere CRM V1] on error:', error);
    }
  }
}

/**
 * CRM OFF 알림 — 태그히어 서버에 매장 CRM 비활성화 통보
 */
export async function notifyCrmOff(params: {
  version: string;
  userId?: string;
  storeName?: string;
  v2StoreId?: string | null; // V2 매장 ID — 있으면 V2 가 redirectUrl 대신 이 값으로 매장을 찾는다
  slug: string;
  isStampMode: boolean;
  isHitejinro?: boolean;
  enrollmentMode?: string;
}): Promise<void> {
  const orderParam = params.version === 'v2' ? 'orderId' : 'ordersheetId';
  let pathSegment = 'taghere-enroll';
  if (params.enrollmentMode === 'MEMBERSHIP') {
    pathSegment = 'taghere-enroll-member';
  } else if (params.enrollmentMode === 'STAMP' || params.isStampMode) {
    pathSegment = params.isHitejinro ? 'taghere-enroll-stamp-hitejinro' : 'taghere-enroll-stamp';
  }
  const redirectUrl = `${CRM_BASE_URL}/${pathSegment}/${params.slug}?${orderParam}={${orderParam}}`;

  if (params.version === 'v2') {
    if (!V2_API_URL || !V2_API_TOKEN) {
      console.log('[TagHere CRM V2] V2 config not set, skipping CRM OFF');
      return;
    }
    try {
      const response = await fetch(`${V2_API_URL}/api/webhooks/crm/off`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${V2_API_TOKEN}`,
        },
        body: JSON.stringify({ storeId: params.v2StoreId || undefined, redirectUrl }),
      });
      if (!response.ok) {
        console.error('[TagHere CRM V2] off failed:', response.status, await response.text());
      } else {
        console.log(`[TagHere CRM V2] off success - storeId: ${params.v2StoreId ?? '-'}, redirectUrl: ${redirectUrl}`);
      }
    } catch (error) {
      console.error('[TagHere CRM V2] off error:', error);
    }
  } else {
    const v1Token = process.env.TAGHERE_API_TOKEN_FOR_CRM || process.env.TAGHERE_WEBHOOK_TOKEN || process.env.TAGHERE_DEV_API_TOKEN || '';
    if (!v1Token) {
      console.log('[TagHere CRM V1] Token not configured, skipping CRM OFF');
      return;
    }
    const webhookUrl = process.env.TAGHERE_WEBHOOK_URL || `${V1_API_URL}/webhook/crm`;
    try {
      const response = await fetch(`${webhookUrl}/off`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${v1Token}`,
        },
        body: JSON.stringify({ userId: params.userId, redirectUrl }),
      });
      if (!response.ok) {
        console.error('[TagHere CRM V1] off failed:', response.status, await response.text());
      } else {
        console.log(`[TagHere CRM V1] off success - userId: ${params.userId}, redirectUrl: ${redirectUrl}`);
      }
    } catch (error) {
      console.error('[TagHere CRM V1] off error:', error);
    }
  }
}

/**
 * V2 매장 매직포스 설정 동기화 — 어드민에서 변경된 메타씨티 설정을 V2 StoreSetting 에 반영
 * V2 는 매직포스 단독 회원 매장 분기에 metacityEnabled/metacityMembershipType 을 사용한다.
 * fire-and-forget. 실패는 ERROR 로그만 남기고 어드민 응답 흐름은 막지 않는다.
 */
export async function notifyStoreMetacitySettingsToV2(params: {
  crmStoreSlug: string;
  v2StoreId?: string | null; // 있으면 V2 가 slug 대신 이 값으로 매장을 찾는다
  metacityEnabled: boolean;
  metacityMembershipType: 'INTEGRATED' | 'STANDALONE';
}): Promise<void> {
  if (!V2_API_URL || !V2_API_TOKEN) {
    console.log('[TagHere V2] V2 config not set, skipping metacity settings sync');
    return;
  }
  try {
    const response = await fetch(`${V2_API_URL}/api/v2/internal/crm/store-settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${V2_API_TOKEN}`,
      },
      body: JSON.stringify({
        storeId: params.v2StoreId || undefined,
        crmStoreSlug: params.crmStoreSlug,
        metacityEnabled: params.metacityEnabled,
        metacityMembershipType: params.metacityMembershipType,
      }),
    });
    if (!response.ok) {
      console.error(
        '[TagHere V2] metacity settings sync failed:',
        response.status,
        await response.text(),
      );
    } else {
      console.log(
        `[TagHere V2] metacity settings synced - slug=${params.crmStoreSlug}, enabled=${params.metacityEnabled}, type=${params.metacityMembershipType}`,
      );
    }
  } catch (error) {
    console.error('[TagHere V2] metacity settings sync error:', error);
  }
}

/**
 * V2 에 매직포스 매장 코드 자동 발견 요청 — 매직포스 Agent 를 통해 매장 POS 에 WORK_CD=1100 호출
 * 성공: { storeIdx, storeName } 반환
 * 실패: throw (호출자가 status 별로 에러 응답 분기)
 */
export async function discoverMetacityStoreIdxFromV2(
  crmStoreSlug: string,
  v2StoreId?: string | null,
): Promise<{ storeIdx: string; storeName: string | null }> {
  if (!V2_API_URL || !V2_API_TOKEN) {
    const err: any = new Error('V2 API 설정이 없습니다.');
    err.status = 500;
    throw err;
  }

  const response = await fetch(`${V2_API_URL}/api/v2/internal/crm/discover-metacity-store-idx`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${V2_API_TOKEN}`,
    },
    body: JSON.stringify({ storeId: v2StoreId || undefined, crmStoreSlug }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.error('[TagHere V2] discover metacity storeIdx failed:', response.status, text);
    const err: any = new Error(text || `V2 응답 실패 (${response.status})`);
    err.status = response.status;
    throw err;
  }

  const json: any = await response.json().catch(() => ({}));
  // V2 DataResponse 형식: { status, message, result: { storeIdx, storeName } }
  const data = json?.result ?? json;
  if (!data?.storeIdx) {
    const err: any = new Error('V2 응답에 storeIdx 가 없습니다.');
    err.status = 503;
    throw err;
  }
  return {
    storeIdx: String(data.storeIdx),
    storeName: data.storeName ? String(data.storeName) : null,
  };
}

export interface OrderLanguageBreakdown {
  totalOrders: number;
  identifiedOrders: number;
  unknownCount: number;
  languages: { language: string; count: number; percentage: number }[];
}

export interface OrderLanguageStatsResult {
  stores: { crmStoreSlug: string; storeId: string; storeName: string; breakdown: OrderLanguageBreakdown }[];
  total: OrderLanguageBreakdown;
  unmatchedCrmStoreSlugs: string[];
}

const ORDER_LANGUAGE_STATS_TIMEOUT_MS = 5000;
// V2 요청 DTO 의 slug 상한과 맞춘다. 초과분은 나눠 호출 후 합산한다
const ORDER_LANGUAGE_STATS_MAX_SLUGS = 200;

// 여러 번 나눠 호출한 집계를 하나로 합친다 (비율은 합산 후 다시 계산)
function mergeOrderLanguageBreakdowns(breakdowns: OrderLanguageBreakdown[]): OrderLanguageBreakdown {
  const merged: OrderLanguageBreakdown = {
    totalOrders: 0,
    identifiedOrders: 0,
    unknownCount: 0,
    languages: [],
  };
  const countByLanguage = new Map<string, number>();

  for (const breakdown of breakdowns) {
    merged.totalOrders += breakdown.totalOrders;
    merged.identifiedOrders += breakdown.identifiedOrders;
    merged.unknownCount += breakdown.unknownCount;
    for (const item of breakdown.languages) {
      countByLanguage.set(item.language, (countByLanguage.get(item.language) ?? 0) + item.count);
    }
  }

  merged.languages = [...countByLanguage.entries()]
    .map(([language, count]) => ({
      language,
      count,
      percentage:
        merged.identifiedOrders > 0 ? Math.round((count / merged.identifiedOrders) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return merged;
}

async function requestOrderLanguageStats(body: {
  crmStoreSlugs: string[];
  from?: string;
  to?: string;
}): Promise<OrderLanguageStatsResult | null> {
  try {
    const response = await fetch(`${V2_API_URL}/api/v2/internal/crm/order-language-stats`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${V2_API_TOKEN}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ORDER_LANGUAGE_STATS_TIMEOUT_MS),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error('[TagHere V2] order language stats failed:', response.status, text);
      return null;
    }

    const json: any = await response.json().catch(() => ({}));
    const data = json?.result ?? json;
    // 이후 병합에서 flatMap/순회를 하므로 형태를 여기서 확정해 둔다
    if (
      !data?.total ||
      !Array.isArray(data.total.languages) ||
      !Array.isArray(data.stores) ||
      !Array.isArray(data.unmatchedCrmStoreSlugs)
    ) {
      console.error('[TagHere V2] order language stats: 예상과 다른 응답 형태');
      return null;
    }
    return data as OrderLanguageStatsResult;
  } catch (error) {
    console.error('[TagHere V2] order language stats error:', error);
    return null;
  }
}

/**
 * V2에서 주문 언어별 집계를 가져온다 (외국인 주문 비율).
 * 인사이트 화면이 V2 장애에 묶이지 않도록 throw 하지 않고, 실패는 전부 null 로 반환한다.
 * 가맹점이 많은 프랜차이즈는 V2 slug 상한에 맞춰 나눠 호출한 뒤 합산한다.
 */
export async function fetchOrderLanguageStatsFromV2(params: {
  crmStoreSlugs: string[];
  from?: string;
  to?: string;
}): Promise<OrderLanguageStatsResult | null> {
  if (!V2_API_URL || !V2_API_TOKEN) return null;
  if (params.crmStoreSlugs.length === 0) return null;

  const chunks: string[][] = [];
  for (let i = 0; i < params.crmStoreSlugs.length; i += ORDER_LANGUAGE_STATS_MAX_SLUGS) {
    chunks.push(params.crmStoreSlugs.slice(i, i + ORDER_LANGUAGE_STATS_MAX_SLUGS));
  }

  // 상한 이내면 V2 응답을 그대로 쓴다 (재계산으로 비율이 0.1%p 어긋나지 않도록)
  if (chunks.length === 1) {
    return requestOrderLanguageStats({
      crmStoreSlugs: chunks[0],
      from: params.from,
      to: params.to,
    });
  }

  const results = await Promise.all(
    chunks.map((crmStoreSlugs) =>
      requestOrderLanguageStats({ crmStoreSlugs, from: params.from, to: params.to })
    )
  );

  // 한 조각이라도 실패하면 부분 집계를 지표로 내보내지 않는다
  if (results.some((result) => result === null)) return null;
  const succeeded = results as OrderLanguageStatsResult[];

  return {
    stores: succeeded.flatMap((result) => result.stores),
    total: mergeOrderLanguageBreakdowns(succeeded.map((result) => result.total)),
    unmatchedCrmStoreSlugs: succeeded.flatMap((result) => result.unmatchedCrmStoreSlugs),
  };
}
