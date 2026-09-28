/**
 * 테이블 체류 시간 — 고객 주문 목록에 V2 세션 체류 시간(분)을 붙인다.
 *
 * 체류 시간은 V2 가 "첫 태그(세션 시작) → POS 결제완료" 로 계산하며, 후불 POS 매장만 지원한다.
 * V1 매장·V2 미연결 매장·V1 형식 주문·V2 장애는 모두 stayMinutes=null 로 두고 응답을 막지 않는다.
 */

import { fetchOrderStayTimesFromV2, type OrderStayTimesResult } from './taghere-api.js';
import { isV2OrderId, resolveVersion } from './taghere-version.js';

interface StayTimeStoreSource {
  v1StoreId?: string | null;
  v2StoreId?: string | null;
  taghereVersion?: string | null;
}

interface OrderEntry {
  orderId: string | null;
}

export type WithStayMinutes<T> = T & { stayMinutes: number | null };

/** V2 결과를 주문 목록에 병합한다 (순수 함수). 결과가 없거나 미지원이면 전부 null */
export function mergeStayMinutes<T extends OrderEntry>(
  entries: T[],
  result: OrderStayTimesResult | null
): WithStayMinutes<T>[] {
  const byOrderId = new Map<string, number | null>();
  if (result?.supported) {
    for (const order of result.orders) {
      byOrderId.set(order.orderId, typeof order.stayMinutes === 'number' ? order.stayMinutes : null);
    }
  }
  return entries.map((entry) => ({
    ...entry,
    stayMinutes: entry.orderId ? (byOrderId.get(entry.orderId) ?? null) : null,
  }));
}

/** 매장이 V2 이고 V2 형식 주문이 있을 때만 V2 를 호출해 체류 시간을 붙인다. throw 하지 않는다 */
export async function attachStayMinutes<T extends OrderEntry>(
  store: StayTimeStoreSource | null,
  entries: T[]
): Promise<WithStayMinutes<T>[]> {
  if (!store?.v2StoreId || resolveVersion(store) !== 'v2') {
    return mergeStayMinutes(entries, null);
  }
  const orderIds = [...new Set(entries.map((entry) => entry.orderId).filter(isV2OrderId))];
  if (orderIds.length === 0) {
    return mergeStayMinutes(entries, null);
  }
  const result = await fetchOrderStayTimesFromV2({ v2StoreId: store.v2StoreId, orderIds });
  return mergeStayMinutes(entries, result);
}
