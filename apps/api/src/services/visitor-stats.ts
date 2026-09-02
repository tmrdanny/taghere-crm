import { prisma } from '../lib/prisma.js';

// 일별 방문객 수 집계 (홈 대시보드 방문자 차트 + 프랜차이즈 일별 방문객)
// 매장 단일(storeIds=[id]) / 프랜차이즈 합산(storeIds=[...]) 공용.
// 날짜 버킷은 KST 기준 (createdAt 은 UTC 저장 → +9h).
// 방문객 정의 = 그 날 포인트 EARN 원장이 있는 고유 고객 ∪ 그 날 신규 등록 고객.
// daily_visitor_overrides 에 입력이 있는 (매장, 날짜)는 입력값이 최종 방문객 수가 된다.

export interface DailyVisitorPoint {
  date: string; // 'YYYY-MM-DD' (KST)
  autoVisitors: number; // 자동 집계 (매장별 고유 고객 수의 합)
  visitors: number; // 최종값 = 매장별 (직접입력 ?? 자동집계)의 합
  overridden: boolean; // 해당 날짜에 직접입력이 하나라도 적용됐는지
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

/**
 * 일별 방문객 시계열.
 *
 * - 숫자를 넘기면 KST 오늘부터 역산한 N일 (기존 동작)
 * - { from, to } 를 넘기면 해당 날짜 범위 (YYYY-MM-DD, 양끝 포함). 하루만 조회하려면 from === to
 */
export async function computeDailyVisitorSeries(
  storeIds: string[],
  range: number | { from: string; to: string }
): Promise<DailyVisitorPoint[]> {
  const dateKeys: string[] = [];

  if (typeof range === 'number') {
    // KST 오늘부터 역산한 days개의 날짜 버킷
    const todayUtcMidnight = kstDateStringToDbDate(todayKstString()).getTime();
    for (let i = range - 1; i >= 0; i--) {
      dateKeys.push(new Date(todayUtcMidnight - i * 86400000).toISOString().slice(0, 10));
    }
  } else {
    const startMs = kstDateStringToDbDate(range.from).getTime();
    const endMs = kstDateStringToDbDate(range.to).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) return [];
    for (let t = startMs; t <= endMs; t += 86400000) {
      dateKeys.push(new Date(t).toISOString().slice(0, 10));
    }
  }

  if (dateKeys.length === 0) return [];
  const firstDate = dateKeys[0];
  const lastDate = dateKeys[dateKeys.length - 1];
  // 마지막 버킷의 KST 자정 다음날 = 범위 종료 경계 (UTC)
  const endUtc = new Date(Date.parse(`${lastDate}T00:00:00Z`) - KST_OFFSET_MS + 86400000);
  // 첫 버킷의 KST 자정에 해당하는 UTC 시각
  const startUtc = new Date(Date.parse(`${firstDate}T00:00:00Z`) - KST_OFFSET_MS);

  // 매장별×일별 고유 방문 고객 수 (EARN 원장 고객 ∪ 신규 고객, 같은 id 공간이라 UNION이 중복 제거)
  const autoRows: { sid: string; d: string; visitors: number }[] = await prisma.$queryRaw`
    SELECT sid, d, COUNT(DISTINCT cid)::int AS visitors FROM (
      SELECT pl."storeId" AS sid,
             to_char(pl."createdAt" + interval '9 hours', 'YYYY-MM-DD') AS d,
             pl."customerId" AS cid
      FROM point_ledger pl
      WHERE pl."storeId" = ANY(${storeIds}) AND pl.type = 'EARN'
        AND pl."createdAt" >= ${startUtc} AND pl."createdAt" < ${endUtc}
      UNION
      SELECT c."storeId" AS sid,
             to_char(c."createdAt" + interval '9 hours', 'YYYY-MM-DD') AS d,
             c.id AS cid
      FROM customers c
      WHERE c."storeId" = ANY(${storeIds})
        AND c."createdAt" >= ${startUtc} AND c."createdAt" < ${endUtc}
    ) t GROUP BY sid, d`;

  const autoMap = new Map<string, number>();
  for (const row of autoRows) {
    autoMap.set(`${row.sid}:${row.d}`, row.visitors);
  }

  const overrides = await prisma.dailyVisitorOverride.findMany({
    where: {
      storeId: { in: storeIds },
      date: { gte: kstDateStringToDbDate(firstDate), lte: kstDateStringToDbDate(lastDate) },
    },
    select: { storeId: true, date: true, visitors: true },
  });
  const overrideMap = new Map<string, number>();
  for (const o of overrides) {
    overrideMap.set(`${o.storeId}:${o.date.toISOString().slice(0, 10)}`, o.visitors);
  }

  return dateKeys.map((date) => {
    let autoVisitors = 0;
    let visitors = 0;
    let overridden = false;
    for (const storeId of storeIds) {
      const key = `${storeId}:${date}`;
      const auto = autoMap.get(key) ?? 0;
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
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 쿼리스트링의 startDate/endDate 를 검증해 날짜 범위로 만든다.
 * 둘 다 유효할 때만 범위를 반환하고, 아니면 null (호출측이 기존 days 방식으로 폴백).
 * 최대 366일로 제한한다.
 */
export function parseDateRange(
  startDate: unknown,
  endDate: unknown,
): { from: string; to: string } | null {
  if (typeof startDate !== 'string' || typeof endDate !== 'string') return null;
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) return null;
  const from = startDate <= endDate ? startDate : endDate;
  const to = startDate <= endDate ? endDate : startDate;
  const spanDays = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 + 1;
  if (!Number.isFinite(spanDays) || spanDays < 1 || spanDays > 366) return null;
  return { from, to };
}
