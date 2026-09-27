// 마케팅 성과 — 캠페인별 발송 · 쿠폰 사용(직원 확인) · 발송 후 재방문 · 재방문 매출 · ROI.
//
// 재방문은 “발송 후 WINDOW_DAYS 일 안에 받은 고객이 방문(주문)했는가”로 본다. 쿠폰을 쓰지 않고
// 다시 온 손님도 메시지 효과로 세고, 쿠폰 사용은 직원 확인으로 따로 센다.
// 평소 재방문율(같은 기간 아무 메시지 없이도 다시 오는 비율)과 비교해 “메시지 덕분에 더 온” 정도를 본다.
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

export const WINDOW_DAYS = 14;

export const CHANNEL_LABELS: Record<string, string> = {
  SMS: '문자',
  KAKAO_COUPON: '카카오 쿠폰',
  PREMIUM_KAKAO: '프리미엄 카카오톡',
  AUTOMATION: '자동 마케팅',
};

export const AUTOMATION_LABELS: Record<string, string> = {
  BIRTHDAY: '생일 축하',
  CHURN_PREVENTION: '이탈 방지',
  ANNIVERSARY: '가입 기념일',
  FIRST_VISIT_FOLLOWUP: '첫 방문 감사',
  VIP_MILESTONE: 'VIP 달성',
  WINBACK: '장기 미방문',
  SLOW_DAY: '한가한 날 프로모션',
};

export interface CampaignPerf {
  id: string;
  channel: string;
  channelLabel: string;
  title: string;
  targetLabel: string | null;
  sentAt: string;
  recipients: number;
  cost: number;
  couponEnabled: boolean;
  couponIssued: number;
  couponUsed: number;
  couponUseRate: number | null;
  revisited: number;
  revisitRate: number | null;
  revenue: number;
  roi: number | null;
  maturing: boolean; // 발송 후 아직 WINDOW_DAYS 가 지나지 않아 집계 중
}

export interface AutomationPerf {
  type: string;
  label: string;
  enabled: boolean;
  sent: number;
  couponUsed: number;
  revisited: number;
  revisitRate: number | null;
  revenue: number;
}

export interface PerformanceResult {
  days: number;
  windowDays: number;
  summary: {
    campaigns: number;
    recipients: number;
    cost: number;
    couponIssued: number;
    couponUsed: number;
    couponUseRate: number | null;
    revisited: number;
    revisitRate: number | null;
    revenue: number;
    roi: number | null;
    baselineRevisitRate: number | null;
  };
  campaigns: CampaignPerf[];
  automation: AutomationPerf[];
  channels: Array<{ channel: string; label: string; campaigns: number; recipients: number; revisitRate: number | null; couponUseRate: number | null; costPerRevisit: number | null }>;
}

const rate = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const n = (v: unknown) => Number(v ?? 0);

export async function computeMarketingPerformance(p: {
  storeIds: string[];
  scope: { storeId?: string; franchiseId?: string };
  days: number;
}): Promise<PerformanceResult> {
  const since = new Date(Date.now() - p.days * 86400000);
  const now = Date.now();
  const scopeWhere = p.scope.franchiseId ? { franchiseId: p.scope.franchiseId } : { storeId: p.scope.storeId };

  const campaigns = await prisma.marketingCampaign.findMany({
    where: { ...scopeWhere, sentAt: { gte: since }, recipientCount: { gt: 0 }, canceledAt: null },
    orderBy: { sentAt: 'desc' },
    take: 200,
  });
  const ids = campaigns.map((c) => c.id);

  const [coupons, visits] = await Promise.all([
    ids.length
      ? prisma.retargetCoupon.groupBy({ by: ['campaignId'], where: { campaignId: { in: ids } }, _count: { _all: true, usedAt: true } })
      : Promise.resolve([] as Array<{ campaignId: string | null; _count: { _all: number; usedAt: number } }>),
    ids.length
      ? prisma.$queryRaw<Array<{ id: string; revisited: bigint; revenue: bigint | null }>>`
          SELECT r."campaignId" AS id,
                 COUNT(DISTINCT v."customerId") AS revisited,
                 COALESCE(SUM(v."totalAmount"), 0) AS revenue
          FROM marketing_campaign_recipients r
          JOIN marketing_campaigns c ON c.id = r."campaignId"
          JOIN visits_orders v ON v."customerId" = r."customerId"
               AND v."visitedAt" > c."sentAt"
               AND v."visitedAt" <= c."sentAt" + make_interval(days => ${WINDOW_DAYS}::int)
          WHERE r."campaignId" IN (${Prisma.join(ids)})
          GROUP BY r."campaignId"`
      : Promise.resolve([]),
  ]);
  const couponBy = new Map(coupons.map((c) => [c.campaignId, c._count]));
  const visitBy = new Map(visits.map((v) => [v.id, v]));

  const campaignPerf: CampaignPerf[] = campaigns.map((c) => {
    const cp = couponBy.get(c.id);
    const v = visitBy.get(c.id);
    const revisited = n(v?.revisited);
    const revenue = n(v?.revenue);
    const couponIssued = cp?._all ?? 0;
    const couponUsed = cp?.usedAt ?? 0;
    return {
      id: c.id,
      channel: c.channel,
      channelLabel: CHANNEL_LABELS[c.channel] ?? c.channel,
      title: c.title,
      targetLabel: c.targetLabel,
      sentAt: c.sentAt.toISOString(),
      recipients: c.recipientCount,
      cost: c.cost,
      couponEnabled: c.couponEnabled,
      couponIssued,
      couponUsed,
      couponUseRate: c.couponEnabled ? rate(couponUsed, couponIssued) : null,
      revisited,
      revisitRate: rate(revisited, c.recipientCount),
      revenue,
      roi: c.cost > 0 ? Math.round((revenue / c.cost) * 10) / 10 : null,
      maturing: now - c.sentAt.getTime() < WINDOW_DAYS * 86400000,
    };
  });

  // 자동 마케팅 (규칙별)
  const automationRows = p.storeIds.length
    ? await prisma.$queryRaw<Array<{ type: string; sent: bigint; used: bigint; revisited: bigint; revenue: bigint | null }>>`
        SELECT ar.type::text AS type,
               COUNT(*) AS sent,
               COUNT(*) FILTER (WHERE l."couponUsed") AS used,
               COUNT(DISTINCT l."customerId") FILTER (WHERE rv.amount IS NOT NULL) AS revisited,
               COALESCE(SUM(rv.amount), 0) AS revenue
        FROM automation_logs l
        JOIN automation_rules ar ON ar.id = l."automationRuleId"
        LEFT JOIN LATERAL (
          SELECT SUM(COALESCE(v."totalAmount", 0)) AS amount
          FROM visits_orders v
          WHERE v."customerId" = l."customerId"
            AND v."visitedAt" > l."sentAt"
            AND v."visitedAt" <= l."sentAt" + make_interval(days => ${WINDOW_DAYS}::int)
          HAVING COUNT(*) > 0
        ) rv ON true
        WHERE l."storeId" IN (${Prisma.join(p.storeIds)}) AND l."sentAt" >= ${since}
        GROUP BY ar.type`
    : [];
  const rules = p.storeIds.length
    ? await prisma.automationRule.findMany({ where: { storeId: { in: p.storeIds } }, select: { type: true, enabled: true } })
    : [];
  const enabledTypes = new Set(rules.filter((r) => r.enabled).map((r) => r.type as string));
  const autoBy = new Map(automationRows.map((r) => [r.type, r]));
  const automation: AutomationPerf[] = Object.keys(AUTOMATION_LABELS).map((type) => {
    const r = autoBy.get(type);
    const sent = n(r?.sent);
    const revisited = n(r?.revisited);
    return {
      type,
      label: AUTOMATION_LABELS[type],
      enabled: enabledTypes.has(type),
      sent,
      couponUsed: n(r?.used),
      revisited,
      revisitRate: rate(revisited, sent),
      revenue: n(r?.revenue),
    };
  });

  // 평소 재방문율: 이전에 방문한 적 있는 고객 중 최근 WINDOW_DAYS 안에 다시 온 비율
  const baselineRows = p.storeIds.length
    ? await prisma.$queryRaw<Array<{ base: bigint; came: bigint }>>`
        SELECT COUNT(*) AS base,
               COUNT(*) FILTER (WHERE EXISTS (
                 SELECT 1 FROM visits_orders v
                 WHERE v."customerId" = c.id AND v."visitedAt" > now() - make_interval(days => ${WINDOW_DAYS}::int)
               )) AS came
        FROM customers c
        WHERE c."storeId" IN (${Prisma.join(p.storeIds)})
          AND c."lastVisitAt" IS NOT NULL
          AND c."createdAt" < now() - make_interval(days => ${WINDOW_DAYS}::int)`
    : [];
  const baselineRevisitRate = rate(n(baselineRows[0]?.came), n(baselineRows[0]?.base));

  // 합계 — 재방문율·쿠폰 사용률은 집계가 끝난(발송 후 14일 지난) 캠페인 기준
  const matured = campaignPerf.filter((c) => !c.maturing);
  const sum = (arr: CampaignPerf[], k: keyof CampaignPerf) => arr.reduce((s, c) => s + (Number(c[k]) || 0), 0);
  const autoSent = automation.reduce((s, a) => s + a.sent, 0);
  const autoRevisited = automation.reduce((s, a) => s + a.revisited, 0);
  const autoRevenue = automation.reduce((s, a) => s + a.revenue, 0);
  const autoCouponUsed = automation.reduce((s, a) => s + a.couponUsed, 0);
  const cost = sum(campaignPerf, 'cost');
  const revenue = sum(campaignPerf, 'revenue') + autoRevenue;
  const couponCampaigns = matured.filter((c) => c.couponEnabled);

  const channels = ['PREMIUM_KAKAO', 'KAKAO_COUPON', 'SMS'].map((ch) => {
    const list = matured.filter((c) => c.channel === ch);
    const recipients = sum(list, 'recipients');
    const revisited = sum(list, 'revisited');
    const withCoupon = list.filter((c) => c.couponEnabled);
    const chCost = sum(list, 'cost');
    return {
      channel: ch,
      label: CHANNEL_LABELS[ch],
      campaigns: list.length,
      recipients,
      revisitRate: rate(revisited, recipients),
      couponUseRate: rate(sum(withCoupon, 'couponUsed'), sum(withCoupon, 'couponIssued')),
      costPerRevisit: revisited > 0 ? Math.round(chCost / revisited) : null,
    };
  });
  if (autoSent > 0) {
    channels.push({ channel: 'AUTOMATION', label: CHANNEL_LABELS.AUTOMATION, campaigns: automation.filter((a) => a.sent > 0).length, recipients: autoSent, revisitRate: rate(autoRevisited, autoSent), couponUseRate: rate(autoCouponUsed, autoSent), costPerRevisit: null });
  }

  return {
    days: p.days,
    windowDays: WINDOW_DAYS,
    summary: {
      campaigns: campaignPerf.length,
      recipients: sum(campaignPerf, 'recipients') + autoSent,
      cost,
      couponIssued: sum(couponCampaigns, 'couponIssued') + autoSent,
      couponUsed: sum(couponCampaigns, 'couponUsed') + autoCouponUsed,
      couponUseRate: rate(sum(couponCampaigns, 'couponUsed') + autoCouponUsed, sum(couponCampaigns, 'couponIssued') + autoSent),
      revisited: sum(matured, 'revisited') + autoRevisited,
      revisitRate: rate(sum(matured, 'revisited') + autoRevisited, sum(matured, 'recipients') + autoSent),
      revenue,
      roi: cost > 0 ? Math.round((revenue / cost) * 10) / 10 : null,
      baselineRevisitRate,
    },
    campaigns: campaignPerf,
    automation,
    channels,
  };
}
