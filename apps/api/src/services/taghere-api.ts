/**
 * 태그히어 모바일오더 API 서비스 레이어
 *
 * V1/V2가 매장별로 공존하는 구조를 지원.
 * - V1: ordersheetId 기반, userId(이메일)로 매장 식별
 * - V2: orderId 기반, storeName으로 매장 식별
 */

// ── V1 설정 ──
const V1_API_URL = process.env.TAGHERE_API_URL || 'https://api.tag-here.com';
const V1_API_TOKEN = process.env.TAGHERE_API_TOKEN_FOR_CRM || '';

// ── V2 설정 ──
const V2_API_URL = process.env.TAGHERE_V2_API_URL || '';
const V2_API_TOKEN = process.env.TAGHERE_V2_API_TOKEN || '';

// ── 공통 ──
const CRM_BASE_URL = process.env.TAGHERE_CRM_BASE_URL || 'https://taghere-crm-web-dev.onrender.com';

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

  const orderData = await orderRes.json() as any;
  const menuData = menuRes?.ok ? await menuRes.json() as any : null;

  // V2 응답을 기존 TaghereOrderData shape로 정규화
  // ※ V2 응답 구조 확정 후 필드 매핑 조정 필요
  return {
    resultPrice: orderData.resultPrice ?? orderData.totalPrice ?? orderData.content?.resultPrice,
    totalPrice: orderData.totalPrice ?? orderData.content?.totalPrice,
    tableLabel: orderData.tableLabel ?? orderData.tableName ?? orderData.content?.tableLabel,
    tableID: orderData.tableID ?? orderData.content?.tableID,
    storeName: orderData.storeName,
    displayOrderNumber: orderData.displayOrderNumber ?? orderData.orderNumber,
    orderNumber: orderData.orderNumber,
    items: orderData.items ?? orderData.orderItems ?? orderData.content?.items,
    orderItems: orderData.orderItems ?? orderData.items,
    menuLink: menuData?.menuLink ?? menuData?.url ?? null,
    content: orderData.content ?? orderData,
  };
}

/**
 * CRM ON 알림 — 태그히어 서버에 매장 CRM 활성화 통보
 */
export async function notifyCrmOn(params: {
  version: string;
  userId?: string;     // V1: 오너 이메일
  storeName?: string;  // V2: 매장명
  slug: string;
  isStampMode: boolean;
  isHitejinro?: boolean;
}): Promise<void> {
  const orderParam = params.version === 'v2' ? 'orderId' : 'ordersheetId';
  let pathSegment = 'taghere-enroll';
  if (params.isStampMode) {
    pathSegment = params.isHitejinro ? 'taghere-enroll-stamp-hitejinro' : 'taghere-enroll-stamp';
  }
  const redirectUrl = `${CRM_BASE_URL}/${pathSegment}/${params.slug}?${orderParam}={${orderParam}}`;

  if (params.version === 'v2') {
    if (!V2_API_URL || !V2_API_TOKEN) {
      console.log('[TagHere CRM V2] V2 config not set, skipping CRM ON');
      return;
    }
    try {
      const response = await fetch(`${V2_API_URL}/api/webhooks/crm/on`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${V2_API_TOKEN}`,
        },
        body: JSON.stringify({ storeName: params.storeName, redirectUrl }),
      });
      if (!response.ok) {
        console.error('[TagHere CRM V2] on failed:', response.status, await response.text());
      } else {
        console.log(`[TagHere CRM V2] on success - storeName: ${params.storeName}, redirectUrl: ${redirectUrl}`);
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
  slug: string;
  isStampMode: boolean;
  isHitejinro?: boolean;
}): Promise<void> {
  const orderParam = params.version === 'v2' ? 'orderId' : 'ordersheetId';
  let pathSegment = 'taghere-enroll';
  if (params.isStampMode) {
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
        body: JSON.stringify({ redirectUrl }),
      });
      if (!response.ok) {
        console.error('[TagHere CRM V2] off failed:', response.status, await response.text());
      } else {
        console.log(`[TagHere CRM V2] off success - redirectUrl: ${redirectUrl}`);
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
