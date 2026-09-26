/**
 * 고객 세그먼트 엔진 — 방문·결제·주문 메뉴·인구통계 조건을 하나의 SQL 로 평가한다.
 *
 * 조건은 모두 AND 로 결합된다. Prisma where + `id IN (...)` 조합 대신 SQL 한 번으로 평가해
 * 5만 명 매장에서도 바인드 파라미터 한도(32,767)에 걸리지 않고, 결제액·메뉴 조건은
 * visits_orders 를 매장 단위로 집계해 조인한다(별도 집계 테이블 없이 항상 최신 데이터 기준).
 *
 * 발송 대상(resolveSegmentCustomers)은 마케팅 수신 동의 + 전화번호 보유 고객만 반환한다.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { getAgeGroupBirthYearRange } from '../lib/customer-filters.js';

export const AGE_GROUPS = ['TWENTIES', 'THIRTIES', 'FORTIES', 'FIFTIES', 'SIXTY_PLUS'] as const;

export interface MenuCondition {
  names: string[];            // 메뉴명 (하나라도 해당하면 매칭)
  mode: 'ANY' | 'NONE';       // ANY: 주문한 적 있음 / NONE: 주문한 적 없음
  minOrders?: number;         // ANY 일 때 해당 메뉴가 포함된 주문 N회 이상
  withinDays?: number;        // 최근 N일 내 주문만 집계
}

export interface SegmentConditions {
  visitCountMin?: number;
  visitCountMax?: number;
  lastVisitWithinDays?: number;  // 최근 N일 안에 방문
  lastVisitOverDays?: number;    // 마지막 방문이 N일 이상 지남 (방문 이력 없는 고객 제외)
  joinedWithinDays?: number;     // 최근 N일 내 등록
  genders?: Array<'MALE' | 'FEMALE'>;
  ageGroups?: string[];
  birthdayMonths?: number[];     // 1~12
  totalSpentMin?: number;        // 누적 결제액 (원)
  totalSpentMax?: number;
  avgSpendMin?: number;          // 방문당 평균 결제액 (원)
  menus?: MenuCondition[];
}

const MAX_DAYS = 3650;
const MAX_MENU_CONDITIONS = 5;
const MAX_MENU_NAMES = 50;

function toInt(value: unknown, min: number, max: number): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, n));
}

/** 클라이언트 입력을 신뢰하지 않고 허용된 필드·범위만 남긴다. */
export function sanitizeConditions(input: any): SegmentConditions {
  const c = input && typeof input === 'object' ? input : {};
  const out: SegmentConditions = {};

  out.visitCountMin = toInt(c.visitCountMin, 0, 100000);
  out.visitCountMax = toInt(c.visitCountMax, 0, 100000);
  out.lastVisitWithinDays = toInt(c.lastVisitWithinDays, 1, MAX_DAYS);
  out.lastVisitOverDays = toInt(c.lastVisitOverDays, 1, MAX_DAYS);
  out.joinedWithinDays = toInt(c.joinedWithinDays, 1, MAX_DAYS);
  out.totalSpentMin = toInt(c.totalSpentMin, 0, 1_000_000_000);
  out.totalSpentMax = toInt(c.totalSpentMax, 0, 1_000_000_000);
  out.avgSpendMin = toInt(c.avgSpendMin, 0, 100_000_000);

  if (Array.isArray(c.genders)) {
    const g = c.genders.filter((x: unknown) => x === 'MALE' || x === 'FEMALE');
    if (g.length) out.genders = [...new Set(g)] as Array<'MALE' | 'FEMALE'>;
  }
  if (Array.isArray(c.ageGroups)) {
    const a = c.ageGroups.filter((x: unknown) => (AGE_GROUPS as readonly string[]).includes(String(x)));
    if (a.length) out.ageGroups = [...new Set(a)] as string[];
  }
  if (Array.isArray(c.birthdayMonths)) {
    const m = c.birthdayMonths.map((x: unknown) => toInt(x, 1, 12)).filter((x: number | undefined): x is number => !!x);
    if (m.length) out.birthdayMonths = [...new Set(m)] as number[];
  }
  if (Array.isArray(c.menus)) {
    const menus: MenuCondition[] = [];
    for (const raw of c.menus.slice(0, MAX_MENU_CONDITIONS)) {
      if (!raw || !Array.isArray(raw.names)) continue;
      const names = [...new Set(
        raw.names.map((n: unknown) => String(n ?? '').trim()).filter((n: string) => n.length > 0 && n.length <= 100)
      )].slice(0, MAX_MENU_NAMES) as string[];
      if (!names.length) continue;
      menus.push({
        names,
        mode: raw.mode === 'NONE' ? 'NONE' : 'ANY',
        minOrders: toInt(raw.minOrders, 1, 10000),
        withinDays: toInt(raw.withinDays, 1, MAX_DAYS),
      });
    }
    if (menus.length) out.menus = menus;
  }

  // undefined 필드 제거 (저장 JSON 을 깔끔하게)
  for (const key of Object.keys(out) as Array<keyof SegmentConditions>) {
    if (out[key] === undefined) delete out[key];
  }
  return out;
}

// items 는 {items:[...]} 또는 과거 데이터의 [...] 형태 — 둘 다 펼친다
const ITEMS_ARRAY_SQL = Prisma.sql`(CASE
  WHEN jsonb_typeof(v.items::jsonb) = 'array' THEN v.items::jsonb
  WHEN jsonb_typeof(v.items::jsonb -> 'items') = 'array' THEN v.items::jsonb -> 'items'
  ELSE '[]'::jsonb END)`;

function daysAgoSql(days: number) {
  return Prisma.sql`now() - make_interval(days => ${days}::int)`;
}

/**
 * 조건 → FROM 절(조인 포함) + WHERE 절 (customers 별칭 c)
 *
 * 결제액·메뉴 조건은 고객별 상관 서브쿼리로 쓰면 플래너가 고객마다 주문 테이블을 훑어
 * 5만 명 매장에서 수십 초가 걸렸다. 매장 단위로 한 번 집계한 결과를 LEFT JOIN 한다.
 */
function buildQuery(storeId: string, cond: SegmentConditions): { from: Prisma.Sql; where: Prisma.Sql } {
  const joins: Prisma.Sql[] = [];
  const parts: Prisma.Sql[] = [Prisma.sql`c."storeId" = ${storeId}`];

  if (cond.visitCountMin !== undefined) parts.push(Prisma.sql`c."visitCount" >= ${cond.visitCountMin}`);
  if (cond.visitCountMax !== undefined) parts.push(Prisma.sql`c."visitCount" <= ${cond.visitCountMax}`);
  if (cond.lastVisitWithinDays !== undefined) {
    parts.push(Prisma.sql`c."lastVisitAt" >= ${daysAgoSql(cond.lastVisitWithinDays)}`);
  }
  if (cond.lastVisitOverDays !== undefined) {
    parts.push(Prisma.sql`c."lastVisitAt" < ${daysAgoSql(cond.lastVisitOverDays)}`);
  }
  if (cond.joinedWithinDays !== undefined) {
    parts.push(Prisma.sql`c."createdAt" >= ${daysAgoSql(cond.joinedWithinDays)}`);
  }
  if (cond.genders?.length) {
    parts.push(Prisma.sql`c.gender::text IN (${Prisma.join(cond.genders)})`);
  }
  if (cond.ageGroups?.length) {
    // 출생연도가 있으면 출생연도 기준(기존 발송 필터와 동일), 없으면 수집된 연령대 값 기준
    const ors = cond.ageGroups.map((g) => {
      const range = getAgeGroupBirthYearRange(g);
      return range
        ? Prisma.sql`(c."birthYear" BETWEEN ${range.gte} AND ${range.lte} OR (c."birthYear" IS NULL AND c."ageGroup"::text = ${g}))`
        : Prisma.sql`c."ageGroup"::text = ${g}`;
    });
    parts.push(Prisma.sql`(${Prisma.join(ors, ' OR ')})`);
  }
  if (cond.birthdayMonths?.length) {
    const months = cond.birthdayMonths.map((m) => String(m).padStart(2, '0'));
    parts.push(Prisma.sql`substring(c.birthday from 1 for 2) IN (${Prisma.join(months)})`);
  }

  const needSpend = cond.totalSpentMin !== undefined || cond.totalSpentMax !== undefined || cond.avgSpendMin !== undefined;
  if (needSpend) {
    joins.push(Prisma.sql`LEFT JOIN (
      SELECT v."customerId", SUM(v."totalAmount") AS total, AVG(v."totalAmount") AS avg
      FROM visits_orders v
      WHERE v."storeId" = ${storeId}
      GROUP BY v."customerId"
    ) sp ON sp."customerId" = c.id`);
    if (cond.totalSpentMin !== undefined) parts.push(Prisma.sql`COALESCE(sp.total, 0) >= ${cond.totalSpentMin}`);
    if (cond.totalSpentMax !== undefined) parts.push(Prisma.sql`COALESCE(sp.total, 0) <= ${cond.totalSpentMax}`);
    if (cond.avgSpendMin !== undefined) parts.push(Prisma.sql`COALESCE(sp.avg, 0) >= ${cond.avgSpendMin}`);
  }

  (cond.menus ?? []).forEach((menu, i) => {
    const alias = Prisma.raw(`m${i}`); // 인덱스 기반 고정 별칭 (사용자 입력 아님)
    const within = menu.withinDays !== undefined ? Prisma.sql`AND v."visitedAt" >= ${daysAgoSql(menu.withinDays)}` : Prisma.empty;
    joins.push(Prisma.sql`LEFT JOIN (
      SELECT v."customerId", COUNT(DISTINCT v.id) AS n
      FROM visits_orders v
      CROSS JOIN LATERAL jsonb_array_elements(${ITEMS_ARRAY_SQL}) AS e
      WHERE v."storeId" = ${storeId} ${within}
        AND btrim(e ->> 'name') IN (${Prisma.join(menu.names)})
      GROUP BY v."customerId"
    ) ${alias} ON ${alias}."customerId" = c.id`);
    if (menu.mode === 'NONE') {
      parts.push(Prisma.sql`${alias}."customerId" IS NULL`);
    } else {
      parts.push(Prisma.sql`COALESCE(${alias}.n, 0) >= ${menu.minOrders ?? 1}`);
    }
  });

  return {
    from: Prisma.sql`customers c ${joins.length ? Prisma.join(joins, ' ') : Prisma.empty}`,
    where: Prisma.join(parts, ' AND '),
  };
}

const REACHABLE_SQL = Prisma.sql`c."consentMarketing" = true AND c.phone IS NOT NULL`;

/** 조건에 맞는 전체 고객 수와, 그중 발송 가능한(수신 동의 + 전화번호) 고객 수 */
export async function countSegment(storeId: string, cond: SegmentConditions): Promise<{ total: number; reachable: number }> {
  const { from, where } = buildQuery(storeId, cond);
  const rows = await prisma.$queryRaw<Array<{ total: bigint; reachable: bigint }>>`
    SELECT COUNT(*) AS total,
           COUNT(*) FILTER (WHERE ${REACHABLE_SQL}) AS reachable
    FROM ${from}
    WHERE ${where}`;
  return { total: Number(rows[0]?.total ?? 0), reachable: Number(rows[0]?.reachable ?? 0) };
}

/** 발송 대상 — 수신 동의 + 전화번호 보유 고객만 */
export async function resolveSegmentCustomers(
  storeId: string,
  cond: SegmentConditions,
): Promise<Array<{ id: string; name: string | null; phone: string }>> {
  const { from, where } = buildQuery(storeId, cond);
  return prisma.$queryRaw<Array<{ id: string; name: string | null; phone: string }>>`
    SELECT c.id, c.name, c.phone
    FROM ${from}
    WHERE ${where} AND ${REACHABLE_SQL}
    ORDER BY c."createdAt" ASC`;
}

/** 저장된 세그먼트를 매장 소유 확인 후 조건과 함께 반환 */
export async function loadStoreSegment(storeId: string, segmentId: string) {
  const segment = await prisma.customerSegment.findFirst({ where: { id: segmentId, storeId } });
  if (!segment) return null;
  return { ...segment, conditions: sanitizeConditions(segment.conditions) };
}

/** 매장 주문 메뉴 목록 (메뉴 조건 선택용) — 주문 수 많은 순 */
export async function listStoreMenus(
  storeId: string,
  days: number,
  limit = 300,
): Promise<Array<{ name: string; orderCount: number; customerCount: number }>> {
  const rows = await prisma.$queryRaw<Array<{ name: string; order_count: bigint; customer_count: bigint }>>`
    SELECT btrim(e ->> 'name') AS name,
           COUNT(DISTINCT v.id) AS order_count,
           COUNT(DISTINCT v."customerId") AS customer_count
    FROM visits_orders v
    CROSS JOIN LATERAL jsonb_array_elements(${ITEMS_ARRAY_SQL}) AS e
    WHERE v."storeId" = ${storeId}
      AND v."visitedAt" >= ${daysAgoSql(days)}
      AND NULLIF(btrim(e ->> 'name'), '') IS NOT NULL
    GROUP BY 1
    ORDER BY order_count DESC
    LIMIT ${limit}`;
  return rows.map((r) => ({ name: r.name, orderCount: Number(r.order_count), customerCount: Number(r.customer_count) }));
}
