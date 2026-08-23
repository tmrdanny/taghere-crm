import { prisma } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';

// 데이터 분석 (인사이트 > 데이터 분석 탭)
// 매장 단일(storeIds=[id]) / 프랜차이즈 합산(storeIds=[...]) 공용.
// 시간대는 KST 기준 (visitedAt 은 UTC 저장 → +9h).

export interface AnalyticsResult {
  period: { days: number | null; from: string | null };
  menuByHour: {
    topMenus: string[];
    rows: { menu: string; hour: number; qty: number }[];
    hourlyTotals: { hour: number; qty: number }[];
  };
  avgTicketBySegment: {
    byAgeHour: { hour: number; segment: string; avgAmount: number; orders: number }[];
    byGenderHour: { hour: number; segment: string; avgAmount: number; orders: number }[];
  };
  revisitCycle: {
    weekly: { bucket: string; customers: number }[];
    monthly: { bucket: string; customers: number }[];
    noRevisit: number;
    base: number;
  };
  visitHeatmap: { dow: number; hour: number; visits: number }[];
  visitFrequency: { bucket: string; customers: number }[];
  newVsReturning: { label: string; visits: number; revenue: number }[];
  segmentRevisit: { segment: string; base: number; rate30: number }[];
}

function periodFilter(days: number | null): Prisma.Sql {
  if (!days) return Prisma.sql``;
  return Prisma.sql`AND v."visitedAt" >= now() - make_interval(days => ${days}::int)`;
}

export async function computeAnalytics(storeIds: string[], days: number | null): Promise<AnalyticsResult> {
  const pf = periodFilter(days);
  const from = days ? new Date(Date.now() - days * 86400000).toISOString().slice(0, 10) : null;

  // 1. 시간대별 메뉴 판매량 (상위 10개 메뉴 × 시간)
  const menuRows: any[] = await prisma.$queryRaw`
    WITH item_rows AS (
      SELECT EXTRACT(HOUR FROM v."visitedAt" + interval '9 hours')::int AS hour,
             it->>'name' AS menu,
             GREATEST(COALESCE(NULLIF(it->>'quantity','')::numeric, 1), 1) AS qty
      FROM visits_orders v, jsonb_array_elements(v.items->'items') it
      WHERE v."storeId" = ANY(${storeIds}) AND v.items IS NOT NULL
        AND jsonb_typeof(v.items->'items') = 'array'
        AND it->>'name' IS NOT NULL
        ${pf}
    ),
    top_menus AS (
      SELECT menu FROM item_rows GROUP BY menu ORDER BY SUM(qty) DESC LIMIT 10
    )
    SELECT i.menu, i.hour, SUM(i.qty)::int AS qty
    FROM item_rows i JOIN top_menus t ON t.menu = i.menu
    GROUP BY 1, 2 ORDER BY 1, 2`;
  const hourlyTotals: any[] = await prisma.$queryRaw`
    SELECT EXTRACT(HOUR FROM v."visitedAt" + interval '9 hours')::int AS hour,
           SUM(GREATEST(COALESCE(NULLIF(it->>'quantity','')::numeric, 1), 1))::int AS qty
    FROM visits_orders v, jsonb_array_elements(v.items->'items') it
    WHERE v."storeId" = ANY(${storeIds}) AND v.items IS NOT NULL
      AND jsonb_typeof(v.items->'items') = 'array'
      ${pf}
    GROUP BY 1 ORDER BY 1`;
  const topMenuOrder: string[] = [];
  for (const r of menuRows) if (!topMenuOrder.includes(r.menu)) topMenuOrder.push(r.menu);

  // 2. 시간대별 × 세그먼트 평균 객단가 (연령대 / 성별 각각)
  const byAgeHour: any[] = await prisma.$queryRaw`
    SELECT EXTRACT(HOUR FROM v."visitedAt" + interval '9 hours')::int AS hour,
           (FLOOR((EXTRACT(YEAR FROM now())::int - c."birthYear") / 10) * 10)::int || '대' AS segment,
           ROUND(AVG(v."totalAmount"))::int AS "avgAmount",
           COUNT(*)::int AS orders
    FROM visits_orders v JOIN customers c ON c.id = v."customerId"
    WHERE v."storeId" = ANY(${storeIds}) AND v."totalAmount" IS NOT NULL AND v."totalAmount" > 0
      AND c."birthYear" IS NOT NULL
      AND (EXTRACT(YEAR FROM now())::int - c."birthYear") BETWEEN 10 AND 69
      ${pf}
    GROUP BY 1, 2 ORDER BY 1, 2`;
  const byGenderHour: any[] = await prisma.$queryRaw`
    SELECT EXTRACT(HOUR FROM v."visitedAt" + interval '9 hours')::int AS hour,
           CASE WHEN c.gender = 'MALE' THEN '남성' ELSE '여성' END AS segment,
           ROUND(AVG(v."totalAmount"))::int AS "avgAmount",
           COUNT(*)::int AS orders
    FROM visits_orders v JOIN customers c ON c.id = v."customerId"
    WHERE v."storeId" = ANY(${storeIds}) AND v."totalAmount" IS NOT NULL AND v."totalAmount" > 0
      AND c.gender IS NOT NULL
      ${pf}
    GROUP BY 1, 2 ORDER BY 1, 2`;

  // 3. 재방문 주기 (첫 방문 → 두 번째 방문까지 걸린 기간 분포)
  const cycleRows: any[] = await prisma.$queryRaw`
    WITH firsts AS (
      SELECT v."customerId", MIN(v."visitedAt") AS fv
      FROM visits_orders v
      WHERE v."storeId" = ANY(${storeIds}) ${pf}
      GROUP BY 1
    ),
    seconds AS (
      SELECT f."customerId", f.fv, MIN(v."visitedAt") AS sv
      FROM firsts f
      JOIN visits_orders v ON v."customerId" = f."customerId"
        AND v."storeId" = ANY(${storeIds}) AND v."visitedAt" > f.fv + interval '2 hours'
      GROUP BY 1, 2
    )
    SELECT
      COUNT(*) FILTER (WHERE s.sv IS NOT NULL AND s.sv - f.fv <= interval '7 days')::int AS w1,
      COUNT(*) FILTER (WHERE s.sv - f.fv > interval '7 days' AND s.sv - f.fv <= interval '14 days')::int AS w2,
      COUNT(*) FILTER (WHERE s.sv - f.fv > interval '14 days' AND s.sv - f.fv <= interval '21 days')::int AS w3,
      COUNT(*) FILTER (WHERE s.sv - f.fv > interval '21 days' AND s.sv - f.fv <= interval '28 days')::int AS w4,
      COUNT(*) FILTER (WHERE s.sv - f.fv > interval '28 days' AND s.sv - f.fv <= interval '60 days')::int AS m2,
      COUNT(*) FILTER (WHERE s.sv - f.fv > interval '60 days' AND s.sv - f.fv <= interval '90 days')::int AS m3,
      COUNT(*) FILTER (WHERE s.sv - f.fv > interval '90 days')::int AS m3plus,
      COUNT(*) FILTER (WHERE s.sv IS NULL AND f.fv <= now() - interval '30 days')::int AS norevisit,
      COUNT(*)::int AS base
    FROM firsts f LEFT JOIN seconds s ON s."customerId" = f."customerId"`;
  const cy = cycleRows[0] || {};

  // 4. 요일 × 시간대 방문 히트맵 (0=일요일)
  const visitHeatmap: any[] = await prisma.$queryRaw`
    SELECT EXTRACT(DOW FROM v."visitedAt" + interval '9 hours')::int AS dow,
           EXTRACT(HOUR FROM v."visitedAt" + interval '9 hours')::int AS hour,
           COUNT(*)::int AS visits
    FROM visits_orders v
    WHERE v."storeId" = ANY(${storeIds}) ${pf}
    GROUP BY 1, 2`;

  // 5. 방문 횟수 분포 (단골화 퍼널)
  const freqRows: any[] = await prisma.$queryRaw`
    WITH per_customer AS (
      SELECT v."customerId", COUNT(*)::int AS visits
      FROM visits_orders v
      WHERE v."storeId" = ANY(${storeIds}) ${pf}
      GROUP BY 1
    )
    SELECT
      COUNT(*) FILTER (WHERE visits = 1)::int AS v1,
      COUNT(*) FILTER (WHERE visits = 2)::int AS v2,
      COUNT(*) FILTER (WHERE visits BETWEEN 3 AND 4)::int AS v34,
      COUNT(*) FILTER (WHERE visits BETWEEN 5 AND 9)::int AS v59,
      COUNT(*) FILTER (WHERE visits >= 10)::int AS v10
    FROM per_customer`;
  const fq = freqRows[0] || {};

  // 6. 신규 vs 재방문 방문·매출 비중 (해당 기간 내 방문 기준, 신규 = 그 방문이 생애 첫 방문)
  const nvr: any[] = await prisma.$queryRaw`
    WITH firsts AS (
      SELECT v."customerId", MIN(v."visitedAt") AS fv
      FROM visits_orders v WHERE v."storeId" = ANY(${storeIds})
      GROUP BY 1
    )
    SELECT (v."visitedAt" = f.fv) AS is_new,
           COUNT(*)::int AS visits,
           COALESCE(SUM(v."totalAmount"), 0)::bigint AS revenue
    FROM visits_orders v JOIN firsts f ON f."customerId" = v."customerId"
    WHERE v."storeId" = ANY(${storeIds}) ${pf}
    GROUP BY 1`;

  // 7. 세그먼트별 30일 재방문율
  const segRevisit: any[] = await prisma.$queryRaw`
    WITH firsts AS (
      SELECT v."customerId", MIN(v."visitedAt") AS fv
      FROM visits_orders v WHERE v."storeId" = ANY(${storeIds}) ${pf}
      GROUP BY 1
    ),
    flagged AS (
      SELECT f."customerId",
        MAX(CASE WHEN v."visitedAt" > f.fv + interval '2 hours' AND v."visitedAt" <= f.fv + interval '30 days' THEN 1 ELSE 0 END) AS r30
      FROM firsts f
      JOIN visits_orders v ON v."customerId" = f."customerId" AND v."storeId" = ANY(${storeIds})
      WHERE f.fv <= now() - interval '30 days'
      GROUP BY 1
    )
    SELECT CASE
        WHEN c."birthYear" IS NULL THEN '연령 미상'
        ELSE (FLOOR((EXTRACT(YEAR FROM now())::int - c."birthYear") / 10) * 10)::int || '대'
      END || CASE WHEN c.gender = 'MALE' THEN ' 남성' WHEN c.gender = 'FEMALE' THEN ' 여성' ELSE '' END AS segment,
      COUNT(*)::int AS base,
      ROUND(AVG(fl.r30) * 100, 1)::float AS rate30
    FROM flagged fl JOIN customers c ON c.id = fl."customerId"
    GROUP BY 1 HAVING COUNT(*) >= 10 ORDER BY 3 DESC`;

  return {
    period: { days, from },
    menuByHour: {
      topMenus: topMenuOrder,
      rows: menuRows.map((r) => ({ menu: r.menu, hour: r.hour, qty: r.qty })),
      hourlyTotals: hourlyTotals.map((r) => ({ hour: r.hour, qty: r.qty })),
    },
    avgTicketBySegment: {
      byAgeHour: byAgeHour,
      byGenderHour: byGenderHour,
    },
    revisitCycle: {
      weekly: [
        { bucket: '1주 이내', customers: cy.w1 || 0 },
        { bucket: '1~2주', customers: cy.w2 || 0 },
        { bucket: '2~3주', customers: cy.w3 || 0 },
        { bucket: '3~4주', customers: cy.w4 || 0 },
      ],
      monthly: [
        { bucket: '1개월 이내', customers: (cy.w1 || 0) + (cy.w2 || 0) + (cy.w3 || 0) + (cy.w4 || 0) },
        { bucket: '1~2개월', customers: cy.m2 || 0 },
        { bucket: '2~3개월', customers: cy.m3 || 0 },
        { bucket: '3개월 이후', customers: cy.m3plus || 0 },
      ],
      noRevisit: cy.norevisit || 0,
      base: cy.base || 0,
    },
    visitHeatmap: visitHeatmap,
    visitFrequency: [
      { bucket: '1회', customers: fq.v1 || 0 },
      { bucket: '2회', customers: fq.v2 || 0 },
      { bucket: '3~4회', customers: fq.v34 || 0 },
      { bucket: '5~9회', customers: fq.v59 || 0 },
      { bucket: '10회 이상', customers: fq.v10 || 0 },
    ],
    newVsReturning: nvr.map((r) => ({
      label: r.is_new ? '신규 방문' : '재방문',
      visits: r.visits,
      revenue: Number(r.revenue),
    })),
    segmentRevisit: segRevisit,
  };
}
