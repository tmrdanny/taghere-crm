/**
 * 고객 세그먼트 엔진 — 방문·결제·주문 메뉴·스탬프·포인트·인구통계 조건을 하나의 SQL 로 평가한다.
 *
 * 그룹 = 조건 + 직접 추가(includeIds) − 직접 제외(excludeIds).
 * 조건 없이 직접 추가만 있으면 "고른 손님만"인 고정 명단 그룹이다.
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
  stampsMin?: number;            // 현재 보유 스탬프
  stampsMax?: number;
  pointsMin?: number;            // 현재 보유 포인트
  pointsMax?: number;
  earnedPointsMin?: number;      // 누적 적립 포인트 (적립 내역 합계)
  visitSources?: string[];       // 방문 경로 옵션 ID
  includeIds?: string[];         // 직접 추가한 손님 (조건과 상관없이 포함)
  excludeIds?: string[];         // 직접 뺀 손님 (조건에 맞아도 제외)
}

/** 직접 추가·제외를 뺀 "조건" 필드가 하나라도 있는지 */
export function hasFilterConditions(c: SegmentConditions): boolean {
  return Object.keys(c).some((k) => k !== 'includeIds' && k !== 'excludeIds');
}

const MAX_DAYS = 3650;
const MAX_MENU_CONDITIONS = 5;
const MAX_MENU_NAMES = 50;
const MAX_PICKED_IDS = 5000;
const MAX_VISIT_SOURCES = 30;

function toIdList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = [...new Set(value.map((v) => String(v ?? '').trim()).filter((v) => /^[a-z0-9]{10,40}$/i.test(v)))].slice(0, MAX_PICKED_IDS);
  return ids.length ? ids : undefined;
}

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
  out.stampsMin = toInt(c.stampsMin, 0, 100000);
  out.stampsMax = toInt(c.stampsMax, 0, 100000);
  out.pointsMin = toInt(c.pointsMin, 0, 1_000_000_000);
  out.pointsMax = toInt(c.pointsMax, 0, 1_000_000_000);
  out.earnedPointsMin = toInt(c.earnedPointsMin, 0, 1_000_000_000);
  if (Array.isArray(c.visitSources)) {
    const v = [...new Set(c.visitSources.map((x: unknown) => String(x ?? '').trim()).filter((x: string) => x.length > 0 && x.length <= 50))].slice(0, MAX_VISIT_SOURCES) as string[];
    if (v.length) out.visitSources = v;
  }
  out.includeIds = toIdList(c.includeIds);
  out.excludeIds = toIdList(c.excludeIds);

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
function buildQuery(
  storeIds: string[],
  cond: SegmentConditions,
  opts: { ignoreExclude?: boolean } = {},
): { from: Prisma.Sql; where: Prisma.Sql; filter: Prisma.Sql } {
  const joins: Prisma.Sql[] = [];
  // 매장 1곳(사장님) 또는 여러 곳(프랜차이즈 전 가맹점)
  const inStores = (col: Prisma.Sql) =>
    storeIds.length === 1 ? Prisma.sql`${col} = ${storeIds[0]}` : Prisma.sql`${col} IN (${Prisma.join(storeIds)})`;
  // 탈퇴한 고객(개인정보가 비워진 기록)은 세그먼트에서 항상 제외
  const parts: Prisma.Sql[] = [Prisma.sql`c."withdrawnAt" IS NULL`];

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
      WHERE ${inStores(Prisma.sql`v."storeId"`)}
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
      WHERE ${inStores(Prisma.sql`v."storeId"`)} ${within}
        AND btrim(e ->> 'name') IN (${Prisma.join(menu.names)})
      GROUP BY v."customerId"
    ) ${alias} ON ${alias}."customerId" = c.id`);
    if (menu.mode === 'NONE') {
      parts.push(Prisma.sql`${alias}."customerId" IS NULL`);
    } else {
      parts.push(Prisma.sql`COALESCE(${alias}.n, 0) >= ${menu.minOrders ?? 1}`);
    }
  });

  if (cond.stampsMin !== undefined) parts.push(Prisma.sql`c."totalStamps" >= ${cond.stampsMin}`);
  if (cond.stampsMax !== undefined) parts.push(Prisma.sql`c."totalStamps" <= ${cond.stampsMax}`);
  if (cond.pointsMin !== undefined) parts.push(Prisma.sql`c."totalPoints" >= ${cond.pointsMin}`);
  if (cond.pointsMax !== undefined) parts.push(Prisma.sql`c."totalPoints" <= ${cond.pointsMax}`);
  if (cond.visitSources?.length) parts.push(Prisma.sql`c."visitSource" IN (${Prisma.join(cond.visitSources)})`);
  if (cond.earnedPointsMin !== undefined) {
    joins.push(Prisma.sql`LEFT JOIN (
      SELECT pl."customerId", SUM(pl.delta) AS earned
      FROM point_ledger pl
      WHERE ${inStores(Prisma.sql`pl."storeId"`)} AND pl.type = 'EARN' AND pl.delta > 0
      GROUP BY pl."customerId"
    ) ep ON ep."customerId" = c.id`);
    parts.push(Prisma.sql`COALESCE(ep.earned, 0) >= ${cond.earnedPointsMin}`);
  }

  // 조건 결과 — 조건이 하나도 없으면 아무도 해당하지 않는다 (그룹 = 직접 고른 손님만, 실수로 전체 발송되지 않게)
  const include = cond.includeIds?.length ? Prisma.sql`c.id IN (${Prisma.join(cond.includeIds)})` : null;
  const filter = parts.length > 0 ? Prisma.join(parts, ' AND ') : Prisma.sql`FALSE`;
  const exclude = !opts.ignoreExclude && cond.excludeIds?.length ? Prisma.sql`AND c.id NOT IN (${Prisma.join(cond.excludeIds)})` : Prisma.empty;
  const member = include ? Prisma.sql`((${filter} ${exclude}) OR ${include})` : Prisma.sql`(${filter} ${exclude})`;

  return {
    from: Prisma.sql`customers c ${joins.length ? Prisma.join(joins, ' ') : Prisma.empty}`,
    where: Prisma.sql`${inStores(Prisma.sql`c."storeId"`)} AND ${member}`,
    filter,
  };
}

const REACHABLE_SQL = Prisma.sql`c."consentMarketing" = true AND c.phone IS NOT NULL`;

/** 조건에 맞는 전체 고객 수와, 그중 발송 가능한(수신 동의 + 전화번호) 고객 수 — 여러 매장 합산 */
export async function countSegmentInStores(
  storeIds: string[],
  cond: SegmentConditions,
): Promise<{ total: number; reachable: number }> {
  if (storeIds.length === 0) return { total: 0, reachable: 0 };
  const { from, where } = buildQuery(storeIds, cond);
  const rows = await prisma.$queryRaw<Array<{ total: bigint; reachable: bigint }>>`
    SELECT COUNT(*) AS total,
           COUNT(*) FILTER (WHERE ${REACHABLE_SQL}) AS reachable
    FROM ${from}
    WHERE ${where}`;
  return { total: Number(rows[0]?.total ?? 0), reachable: Number(rows[0]?.reachable ?? 0) };
}

export function countSegment(storeId: string, cond: SegmentConditions) {
  return countSegmentInStores([storeId], cond);
}

/** 발송 대상 — 수신 동의 + 전화번호 보유 고객만 (여러 매장 합산, 고객 소속 매장 포함) */
export async function resolveSegmentCustomersInStores(
  storeIds: string[],
  cond: SegmentConditions,
): Promise<Array<{ id: string; name: string | null; phone: string; storeId: string }>> {
  if (storeIds.length === 0) return [];
  const { from, where } = buildQuery(storeIds, cond);
  return prisma.$queryRaw<Array<{ id: string; name: string | null; phone: string; storeId: string }>>`
    SELECT c.id, c.name, c.phone, c."storeId"
    FROM ${from}
    WHERE ${where} AND ${REACHABLE_SQL}
    ORDER BY c."createdAt" ASC`;
}

export function resolveSegmentCustomers(storeId: string, cond: SegmentConditions) {
  return resolveSegmentCustomersInStores([storeId], cond);
}

export interface SegmentMemberRow {
  id: string;
  name: string | null;
  phone: string | null;
  storeId: string;
  storeName: string | null;
  gender: string | null;
  visitCount: number;
  totalStamps: number;
  totalPoints: number;
  visitSource: string | null;
  lastVisitAt: Date | null;
  reachable: boolean;
  /** 조건(필터)에 맞는 손님 */
  matched: boolean;
  /** 직접 추가 */
  picked: boolean;
  /** 직접 제외 */
  excluded: boolean;
}

/**
 * 그룹 만들기 화면의 명단.
 *  - mode 'group': 조건에 맞는 손님(제외 표시 포함) + 직접 추가한 손님
 *  - mode 'search': 매장 전체 손님에서 검색 (직접 추가할 손님 찾기) — 각 행에 그룹 포함 여부 표시
 */
export async function listSegmentMembers(
  storeIds: string[],
  cond: SegmentConditions,
  opts: { mode: 'group' | 'search'; q?: string; offset?: number; limit?: number },
): Promise<{ rows: SegmentMemberRow[]; hasMore: boolean }> {
  if (storeIds.length === 0) return { rows: [], hasMore: false };
  const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
  const offset = Math.max(0, opts.offset ?? 0);
  const { from, filter } = buildQuery(storeIds, cond, { ignoreExclude: true });
  const inStores = storeIds.length === 1 ? Prisma.sql`c."storeId" = ${storeIds[0]}` : Prisma.sql`c."storeId" IN (${Prisma.join(storeIds)})`;
  const include = cond.includeIds?.length ? Prisma.sql`c.id IN (${Prisma.join(cond.includeIds)})` : Prisma.sql`FALSE`;
  const exclude = cond.excludeIds?.length ? Prisma.sql`c.id IN (${Prisma.join(cond.excludeIds)})` : Prisma.sql`FALSE`;
  const scope = opts.mode === 'group' ? Prisma.sql`AND ((${filter}) OR ${include})` : Prisma.empty;
  // 직접 추가한 손님을 맨 위로 (상수 ORDER BY 는 Postgres 에러라 있을 때만)
  const pickedFirst = cond.includeIds?.length ? Prisma.sql`(c.id IN (${Prisma.join(cond.includeIds)})) DESC,` : Prisma.empty;
  const q = (opts.q ?? '').trim();
  const digits = q.replace(/\D/g, '');
  const search = q
    ? Prisma.sql`AND (c.name ILIKE ${'%' + q + '%'}${digits.length >= 3 ? Prisma.sql` OR c.phone LIKE ${'%' + digits.slice(-8) + '%'} OR c."phoneLastDigits" LIKE ${'%' + digits.slice(-8) + '%'}` : Prisma.empty})`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<Array<any>>`
    SELECT c.id, c.name, c.phone, c."storeId", s.name AS "storeName", c.gender::text AS gender, c."visitCount",
           c."totalStamps", c."totalPoints", c."visitSource", c."lastVisitAt",
           (${REACHABLE_SQL}) AS reachable,
           (${filter}) AS matched,
           (${include}) AS picked,
           (${exclude}) AS excluded
    FROM ${from}
    LEFT JOIN stores s ON s.id = c."storeId"
    WHERE ${inStores} ${scope} ${search}
    ORDER BY ${pickedFirst} c."lastVisitAt" DESC NULLS LAST, c."createdAt" DESC
    LIMIT ${limit + 1} OFFSET ${offset}`;
  return {
    rows: rows.slice(0, limit).map((r) => ({
      ...r,
      visitCount: Number(r.visitCount ?? 0),
      totalStamps: Number(r.totalStamps ?? 0),
      totalPoints: Number(r.totalPoints ?? 0),
      reachable: !!r.reachable,
      matched: !!r.matched,
      picked: !!r.picked,
      excluded: !!r.excluded,
    })),
    hasMore: rows.length > limit,
  };
}

/** 그룹 요약 — 조건 해당 / 직접 추가(조건 밖) / 직접 제외(조건 안) / 최종 인원·발송 가능 */
export async function summarizeSegment(storeIds: string[], cond: SegmentConditions) {
  if (storeIds.length === 0) return { matched: 0, pickedExtra: 0, excludedMatched: 0, total: 0, reachable: 0 };
  const { from, filter, where } = buildQuery(storeIds, cond, { ignoreExclude: true });
  const inStores = storeIds.length === 1 ? Prisma.sql`c."storeId" = ${storeIds[0]}` : Prisma.sql`c."storeId" IN (${Prisma.join(storeIds)})`;
  const include = cond.includeIds?.length ? Prisma.sql`c.id IN (${Prisma.join(cond.includeIds)})` : Prisma.sql`FALSE`;
  const exclude = cond.excludeIds?.length ? Prisma.sql`c.id IN (${Prisma.join(cond.excludeIds)})` : Prisma.sql`FALSE`;
  const rows = await prisma.$queryRaw<Array<{ matched: bigint; picked_extra: bigint; excluded_matched: bigint }>>`
    SELECT COUNT(*) FILTER (WHERE ${filter}) AS matched,
           COUNT(*) FILTER (WHERE ${include} AND NOT (${filter})) AS picked_extra,
           COUNT(*) FILTER (WHERE ${exclude} AND (${filter}) AND NOT ${include}) AS excluded_matched
    FROM ${from}
    WHERE ${inStores}`;
  void where;
  const counts = await countSegmentInStores(storeIds, cond);
  return {
    matched: Number(rows[0]?.matched ?? 0),
    pickedExtra: Number(rows[0]?.picked_extra ?? 0),
    excludedMatched: Number(rows[0]?.excluded_matched ?? 0),
    ...counts,
  };
}

/** 방문 경로 값 목록 (조건 선택용) — 손님 수 많은 순 */
export async function listVisitSources(storeIds: string[]): Promise<Array<{ value: string; count: number }>> {
  if (storeIds.length === 0) return [];
  const rows = await prisma.$queryRaw<Array<{ value: string; n: bigint }>>`
    SELECT c."visitSource" AS value, COUNT(*) AS n
    FROM customers c
    WHERE c."storeId" IN (${Prisma.join(storeIds)}) AND NULLIF(c."visitSource", '') IS NOT NULL
    GROUP BY 1 ORDER BY 2 DESC LIMIT 50`;
  return rows.map((r) => ({ value: r.value, count: Number(r.n) }));
}

/** 저장된 세그먼트를 매장 소유 확인 후 조건과 함께 반환 */
export async function loadStoreSegment(storeId: string, segmentId: string) {
  const segment = await prisma.customerSegment.findFirst({ where: { id: segmentId, storeId } });
  if (!segment) return null;
  return { ...segment, conditions: sanitizeConditions(segment.conditions) };
}

/** 매장 주문 메뉴 목록 (메뉴 조건 선택용) — 주문 수 많은 순 */
/** 저장된 프랜차이즈 고객 그룹을 소유 확인 후 조건과 함께 반환 */
export async function loadFranchiseSegment(franchiseId: string, segmentId: string) {
  const segment = await prisma.franchiseSegment.findFirst({ where: { id: segmentId, franchiseId } });
  if (!segment) return null;
  return { ...segment, conditions: sanitizeConditions(segment.conditions) };
}

export function listStoreMenus(storeId: string, days: number, limit = 300) {
  return listMenusInStores([storeId], days, limit);
}

/** 여러 매장 주문 메뉴 목록 (프랜차이즈 전 가맹점 합산) */
export async function listMenusInStores(
  storeIds: string[],
  days: number,
  limit = 300,
): Promise<Array<{ name: string; orderCount: number; customerCount: number }>> {
  if (storeIds.length === 0) return [];
  const rows = await prisma.$queryRaw<Array<{ name: string; order_count: bigint; customer_count: bigint }>>`
    SELECT btrim(e ->> 'name') AS name,
           COUNT(DISTINCT v.id) AS order_count,
           COUNT(DISTINCT v."customerId") AS customer_count
    FROM visits_orders v
    CROSS JOIN LATERAL jsonb_array_elements(${ITEMS_ARRAY_SQL}) AS e
    WHERE v."storeId" IN (${Prisma.join(storeIds)})
      AND v."visitedAt" >= ${daysAgoSql(days)}
      AND NULLIF(btrim(e ->> 'name'), '') IS NOT NULL
    GROUP BY 1
    ORDER BY order_count DESC
    LIMIT ${limit}`;
  return rows.map((r) => ({ name: r.name, orderCount: Number(r.order_count), customerCount: Number(r.customer_count) }));
}
