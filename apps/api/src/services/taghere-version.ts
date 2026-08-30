/**
 * 태그히어 연동 버전 판정 — taghereVersion 편집 필드의 파생값 대체.
 *
 * 진실원천은 v1StoreId/v2StoreId(주문 서비스 매장 ID 매핑)다.
 * - v2StoreId 만 있으면 v2, v1StoreId 만 있으면 v1
 * - 둘 다 있으면(병행 운영 매장) 주문 ID 포맷으로 건별 판정
 * - 둘 다 없으면(미백필 매장) 기존 taghereVersion 컬럼 폴백 — 폴백 사용은 로그로 관찰
 */

interface VersionSource {
  v1StoreId?: string | null;
  v2StoreId?: string | null;
  taghereVersion?: string | null;
}

/** V2 주문 ID: `OR` prefix + ULID (예: OR01M1122W8C...) — 2026-08 prod 실측 */
const V2_ORDER_ID = /^OR[0-9A-Z]{20,}$/i;
/** V1 주문(ordersheet) ID: MongoDB ObjectId 24-hex */
const V1_ORDER_ID = /^[0-9a-f]{24}$/i;

export function resolveVersion(store: VersionSource): 'v1' | 'v2' {
  if (store.v2StoreId && !store.v1StoreId) return 'v2';
  if (store.v1StoreId && !store.v2StoreId) return 'v1';
  if (store.v1StoreId && store.v2StoreId) {
    // 병행 매장인데 주문 컨텍스트가 없으면 v2 우선 (이관 방향)
    return 'v2';
  }
  // 미백필 매장 — 레거시 컬럼 폴백
  console.warn(`[TaghereVersion] link-id 미설정, taghereVersion 컬럼 폴백: ${store.taghereVersion ?? 'v1'}`);
  return store.taghereVersion === 'v2' ? 'v2' : 'v1';
}

/** 주문 조회용 — 병행 매장은 주문 ID 포맷이 우선한다 */
export function resolveVersionForOrder(store: VersionSource, orderId: string | null | undefined): 'v1' | 'v2' {
  if (orderId) {
    if (V2_ORDER_ID.test(orderId)) return 'v2';
    if (V1_ORDER_ID.test(orderId)) return 'v1';
  }
  return resolveVersion(store);
}
