import { prisma } from '../lib/prisma.js';
import { fetchDailyVisitorStatsFromV2 } from './taghere-api.js';

// 일별 방문객 수 집계 (홈 대시보드 방문자 차트 + 프랜차이즈 일별 방문객)
// 매장 단일(storeIds=[id]) / 프랜차이즈 합산(storeIds=[...]) 공용.
// 날짜 버킷은 KST 기준 (createdAt 은 UTC 저장 → +9h).
// 방문객 정의 (매장별로 둘 중 하나):
//   - 기본: 그 날 포인트 EARN 원장이 있는 고유 고객 ∪ 그 날 신규 등록 고객 (CRM 고객 집계)
//   - 태그히어 V2 인원 수 입력 매장: V2 가 집계한 "실제 주문 인원" (세션당 인원 1회 + 세션 없는 주문 1건=1명)으로 대체
// daily_visitor_overrides 에 입력이 있는 (매장, 날짜)는 입력값이 최종 방문객 수가 된다.

export interface DailyVisitorPoint {
  date: string; // 'YYYY-MM-DD' (KST)
  autoVisitors: number; // 시스템 집계 (매장별 CRM 고객 수 또는 V2 주문 인원의 합)
  visitors: number; // 최종값 = 매장별 (직접입력 ?? 시스템집계)의 합
  overridden: boolean; // 해당 날짜에 직접입력이 하나라도 적용됐는지
}

// 시스템 집계 기준: auto = 전 매장 CRM 고객 집계, customer_size = 전 매장 V2 주문 인원, mixed = 혼합(프랜차이즈)
export type VisitorCountingMode = 'auto' | 'customer_size' | 'mixed';

export interface DailyVisitorReport {
  series: DailyVisitorPoint[];
  countingMode: VisitorCountingMode;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// KST 기준 오늘 날짜 문자열
export function todayKstString(): string {
  return new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

// 'YYYY-MM-DD' → @db.Date 저장용 Date (UTC 자정)
export function kstDateStringToDbDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`);
}

export async function computeDailyVisitorSeries(
  storeIds: string[],
  days: number
): Promise<DailyVisitorPoint[]> {
  return (await computeDailyVisitorReport(storeIds, days)).series;
}

export async function computeDailyVisitorReport(
  storeIds: string[],
  days: number
): Promise<DailyVisitorReport> {
  // KST 오늘부터 역산한 days개의 날짜 버킷
  const todayUtcMidnight = kstDateStringToDbDate(todayKstString()).getTime();
  const dateKeys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    dateKeys.push(new Date(todayUtcMidnight - i * 86400000).toISOString().slice(0, 10));
  }
  const firstDate = dateKeys[0];
  // 첫 버킷의 KST 자정에 해당하는 UTC 시각
  const startUtc = new Date(Date.parse(`${firstDate}T00:00:00Z`) - KST_OFFSET_MS);

  // 매장별×일별 고유 방문 고객 수 (EARN 원장 고객 ∪ 신규 고객, 같은 id 공간이라 UNION이 중복 제거)
  const autoRows: { sid: string; d: string; visitors: number }[] = await prisma.$queryRaw`
    SELECT sid, d, COUNT(DISTINCT cid)::int AS visitors FROM (
      SELECT pl."storeId" AS sid,
             to_char(pl."createdAt" + interval '9 hours', 'YYYY-MM-DD') AS d,
             pl."customerId" AS cid
      FROM point_ledger pl
      WHERE pl."storeId" = ANY(${storeIds}) AND pl.type = 'EARN' AND pl."createdAt" >= ${startUtc}
      UNION
      SELECT c."storeId" AS sid,
             to_char(c."createdAt" + interval '9 hours', 'YYYY-MM-DD') AS d,
             c.id AS cid
      FROM customers c
      WHERE c."storeId" = ANY(${storeIds}) AND c."createdAt" >= ${startUtc}
    ) t GROUP BY sid, d`;

  const autoMap = new Map<string, number>();
  for (const row of autoRows) {
    autoMap.set(`${row.sid}:${row.d}`, row.visitors);
  }

  // 태그히어 V2 인원 수 입력 매장은 CRM 고객 집계 대신 V2 의 "실제 주문 인원"을 쓴다.
  // V2 매장 id → CRM 매장 id → 일자별 인원. V2 조회 실패 시엔 전 매장 CRM 집계로 폴백한다.
  const v2Map = new Map<string, Map<string, number>>();
  const v2Links = await prisma.store.findMany({
    where: { id: { in: storeIds }, v2StoreId: { not: null } },
    select: { id: true, v2StoreId: true },
  });
  if (v2Links.length > 0) {
    const crmStoreIdByV2 = new Map(v2Links.map((s) => [s.v2StoreId!, s.id]));
    const stats = await fetchDailyVisitorStatsFromV2({
      v2StoreIds: [...crmStoreIdByV2.keys()],
      from: firstDate,
      to: dateKeys[dateKeys.length - 1],
    });
    if (!stats) {
      console.warn('[Visitor stats] V2 일별 주문 인원 조회 실패 — CRM 고객 집계로 폴백');
    } else {
      if (stats.unmatchedStoreIds.length > 0) {
        console.warn('[Visitor stats] 태그히어에 없는 v2StoreId:', stats.unmatchedStoreIds);
      }
      for (const store of stats.stores) {
        if (!store.customerSizeEnabled) continue;
        const crmStoreId = crmStoreIdByV2.get(store.storeId);
        if (!crmStoreId) continue;
        v2Map.set(crmStoreId, new Map(store.daily.map((d) => [d.date, d.visitors])));
      }
    }
  }

  const overrides = await prisma.dailyVisitorOverride.findMany({
    where: {
      storeId: { in: storeIds },
      date: { gte: kstDateStringToDbDate(firstDate) },
    },
    select: { storeId: true, date: true, visitors: true },
  });
  const overrideMap = new Map<string, number>();
  for (const o of overrides) {
    overrideMap.set(`${o.storeId}:${o.date.toISOString().slice(0, 10)}`, o.visitors);
  }

  const series = dateKeys.map((date) => {
    let autoVisitors = 0;
    let visitors = 0;
    let overridden = false;
    for (const storeId of storeIds) {
      const key = `${storeId}:${date}`;
      // 인원 수 입력 매장은 V2 값이 곧 시스템 집계 (해당 날짜 행이 없으면 0, CRM 집계로 섞지 않음)
      const v2Daily = v2Map.get(storeId);
      const auto = v2Daily ? (v2Daily.get(date) ?? 0) : (autoMap.get(key) ?? 0);
      const override = overrideMap.get(key);
      autoVisitors += auto;
      if (override !== undefined) {
        visitors += override;
        overridden = true;
      } else {
        visitors += auto;
      }
    }
    return { date, autoVisitors, visitors, overridden };
  });

  const customerSizeStoreCount = storeIds.filter((id) => v2Map.has(id)).length;
  const countingMode: VisitorCountingMode =
    customerSizeStoreCount === 0
      ? 'auto'
      : customerSizeStoreCount === storeIds.length
        ? 'customer_size'
        : 'mixed';

  return { series, countingMode };
}
