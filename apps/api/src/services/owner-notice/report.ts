// 사장님 리포트 — 주간 리포트 알림톡, 로그인 없는 리포트 페이지(/o/:token), CRM 홈 안내가 같은 숫자를 쓴다.
//
// 숫자는 사장님이 바로 이해할 수 있는 것만:
//  - 적립한 손님 / 다시 온 손님 / 처음 온 손님 / 적립 손님 결제액 (최근 7일 vs 그 전 7일)
//  - 문자·알림톡 받고 14일 안에 다시 온 손님 (최근 30일 발송분, 마케팅 성과와 같은 계산)
//  - 충전금 상태 (잔액, 하루 평균 사용액, 남은 일수, 충전금 부족으로 못 나간 알림 수)
//  - 자동 마케팅 켜짐 여부와 지금 켜면 받을 손님 수
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { computeMarketingPerformance, AUTOMATION_LABELS } from '../marketing/performance.js';
import { getCreditStatus } from '../credit-service.js';
import { balanceSkipsSince } from './skip-counter.js';

const DAY = 86400000;
const n = (v: unknown) => Number(v ?? 0);

/** KST 자정 기준 오늘 0시 (UTC Date) */
export function kstStartOfToday(now = new Date()): Date {
  const kst = new Date(now.getTime() + 9 * 3600000);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3600000);
}

export interface PeriodStats {
  from: string;
  to: string;
  visitors: number; // 적립한 손님 (포인트·스탬프 적립 또는 주문 기록)
  returning: number; // 그중 기간 전에 이미 등록돼 있던 손님
  newCustomers: number; // 기간 안에 처음 등록한 손님
  revenue: number; // 기록된 결제액 합계 (적립 손님만)
}

async function periodStats(storeId: string, from: Date, to: Date): Promise<PeriodStats> {
  const [row] = await prisma.$queryRaw<Array<{ visitors: bigint; returning: bigint; revenue: bigint | null }>>(Prisma.sql`
    WITH v AS (
      SELECT "customerId" FROM point_ledger WHERE "storeId" = ${storeId} AND type = 'EARN' AND "createdAt" >= ${from} AND "createdAt" < ${to}
      UNION
      SELECT "customerId" FROM stamp_ledger WHERE "storeId" = ${storeId} AND type = 'EARN' AND "createdAt" >= ${from} AND "createdAt" < ${to}
      UNION
      SELECT "customerId" FROM visits_orders WHERE "storeId" = ${storeId} AND "visitedAt" >= ${from} AND "visitedAt" < ${to}
    )
    SELECT COUNT(*) AS visitors,
           COUNT(*) FILTER (WHERE c."createdAt" < ${from}) AS returning,
           (SELECT COALESCE(SUM("totalAmount"), 0) FROM visits_orders WHERE "storeId" = ${storeId} AND "visitedAt" >= ${from} AND "visitedAt" < ${to}) AS revenue
    FROM v JOIN customers c ON c.id = v."customerId"`);
  const newCustomers = await prisma.customer.count({ where: { storeId, createdAt: { gte: from, lt: to } } });
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    visitors: n(row?.visitors),
    returning: n(row?.returning),
    newCustomers,
    revenue: n(row?.revenue),
  };
}

export interface WalletStatus {
  balance: number;
  dailySpend: number; // 최근 14일 하루 평균 사용액
  daysLeft: number | null; // 지금 속도면 며칠 남았나 (사용이 없으면 null)
  skipped7d: number; // 최근 7일 충전금 부족으로 못 나간 알림
  skippedEarn7d: number; // 그중 적립 알림 (포인트·스탬프)
  freeCreditsLeft: number;
  freeCreditsTotal: number;
  state: 'OK' | 'LOW' | 'EMPTY'; // EMPTY: 알림이 이미 못 나가는 중, LOW: 3일 안에 바닥
}

export async function walletStatus(storeId: string): Promise<WalletStatus> {
  const since = new Date(Date.now() - 14 * DAY);
  const [wallet, spend, skips, credit] = await Promise.all([
    prisma.wallet.findUnique({ where: { storeId }, select: { balance: true } }),
    prisma.paymentTransaction.aggregate({ where: { storeId, type: 'ALIMTALK_SEND', createdAt: { gte: since }, amount: { lt: 0 } }, _sum: { amount: true } }),
    balanceSkipsSince(storeId, 7),
    getCreditStatus(storeId).catch(() => null),
  ]);
  const balance = wallet?.balance ?? 0;
  const dailySpend = Math.round(-(spend._sum.amount ?? 0) / 14);
  const daysLeft = dailySpend > 0 ? Math.floor(balance / dailySpend) : null;
  const skippedEarn7d = (skips.byType.POINTS_EARNED ?? 0) + (skips.byType.STAMP_EARNED ?? 0) + (skips.byType.POINTS_USED ?? 0);
  // 적립 알림 1통(20원)도 못 보내는 잔액이면서 최근에 못 나간 알림이 있으면 '멈춤'
  const state: WalletStatus['state'] =
    balance < 20 && (skips.total > 0 || dailySpend > 0) ? 'EMPTY' : daysLeft !== null && daysLeft <= 3 ? 'LOW' : 'OK';
  return {
    balance,
    dailySpend,
    daysLeft,
    skipped7d: skips.total,
    skippedEarn7d,
    freeCreditsLeft: credit?.remainingCredits ?? 0,
    freeCreditsTotal: credit?.totalCredits ?? 30,
    state,
  };
}

export interface AutomationSuggestion {
  type: string;
  label: string;
  enabled: boolean;
  audience: number; // 지금 켜면 이번 달 받을 것으로 보이는 손님 수 (최근 30일 기준)
  why: string;
}

async function automationStatus(storeId: string): Promise<{ enabledCount: number; items: AutomationSuggestion[]; naverPlaceReady: boolean }> {
  const [rules, store, firstVisit, lapsing] = await Promise.all([
    prisma.automationRule.findMany({ where: { storeId }, select: { type: true, enabled: true } }),
    prisma.store.findUnique({ where: { id: storeId }, select: { naverPlaceUrl: true } }),
    // 첫 방문 감사: 최근 30일 새로 등록한 손님
    prisma.customer.count({ where: { storeId, createdAt: { gte: new Date(Date.now() - 30 * DAY) } } }),
    // 이탈 방지: 2번 이상 왔고 31~90일 안 온 손님
    prisma.customer.count({
      where: { storeId, visitCount: { gte: 2 }, lastVisitAt: { lt: new Date(Date.now() - 30 * DAY), gte: new Date(Date.now() - 90 * DAY) } },
    }),
  ]);
  const on = new Set(rules.filter((r) => r.enabled).map((r) => r.type as string));
  const items: AutomationSuggestion[] = [
    {
      type: 'FIRST_VISIT_FOLLOWUP',
      label: AUTOMATION_LABELS.FIRST_VISIT_FOLLOWUP,
      enabled: on.has('FIRST_VISIT_FOLLOWUP'),
      audience: firstVisit,
      why: '처음 온 손님에게 3일 뒤 감사 쿠폰을 보내 두 번째 방문을 만들어요.',
    },
    {
      type: 'CHURN_PREVENTION',
      label: AUTOMATION_LABELS.CHURN_PREVENTION,
      enabled: on.has('CHURN_PREVENTION'),
      audience: lapsing,
      why: '2번 이상 왔다가 한 달 넘게 안 온 단골을 다시 불러요.',
    },
    {
      type: 'BIRTHDAY',
      label: AUTOMATION_LABELS.BIRTHDAY,
      enabled: on.has('BIRTHDAY'),
      audience: 0,
      why: '생일인 손님에게 축하 쿠폰을 보내요.',
    },
  ];
  return { enabledCount: on.size, items, naverPlaceReady: !!store?.naverPlaceUrl };
}

export interface OwnerReport {
  store: { id: string; name: string };
  thisWeek: PeriodStats;
  lastWeek: PeriodStats;
  marketing: {
    days: number;
    recipients: number; // 최근 30일 문자·알림톡을 받은 손님 (자동 포함)
    revisited: number; // 그중 14일 안에 다시 온 손님
    revenue: number; // 다시 온 손님의 결제액
    cost: number; // 발송 비용 (자동 마케팅 제외 캠페인 비용)
  };
  wallet: WalletStatus;
  automation: { enabledCount: number; items: AutomationSuggestion[]; naverPlaceReady: boolean };
}

/** 최근 7일(오늘 제외) vs 그 전 7일 */
export async function buildOwnerReport(storeId: string, now = new Date()): Promise<OwnerReport | null> {
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true } });
  if (!store) return null;
  const end = kstStartOfToday(now);
  const mid = new Date(end.getTime() - 7 * DAY);
  const start = new Date(end.getTime() - 14 * DAY);
  const [thisWeek, lastWeek, perf, wallet, automation] = await Promise.all([
    periodStats(storeId, mid, end),
    periodStats(storeId, start, mid),
    computeMarketingPerformance({ storeIds: [storeId], scope: { storeId }, days: 30 }).catch(() => null),
    walletStatus(storeId),
    automationStatus(storeId),
  ]);
  return {
    store,
    thisWeek,
    lastWeek,
    marketing: {
      days: 30,
      recipients: perf?.summary.recipients ?? 0,
      revisited: perf?.summary.revisited ?? 0,
      revenue: perf?.summary.revenue ?? 0,
      cost: perf?.summary.cost ?? 0,
    },
    wallet,
    automation,
  };
}
