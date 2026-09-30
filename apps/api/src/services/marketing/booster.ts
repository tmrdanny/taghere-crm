// 마케팅 성과 · 플레이스 부스터 — 매장(또는 프랜차이즈 전 가맹점)의 부스터 캠페인 성과.
// 숫자는 어드민 리포트(place-booster-service getReport)와 같은 기준이다:
// 클릭 = 추적 링크 클릭, 매출 = 회차별 쿠폰 사용 × 평균 객단(수동 입력), ROI = 매출 ÷ 광고비(VAT 제외) × 100.
import { prisma } from '../../lib/prisma.js';

export interface BoosterWeekPerf {
  weekNo: number;
  scheduledAt: string;
  status: string;
  sentCount: number;
  clickCount: number;
  clickRate: number;
  couponUsedCount: number | null;
  avgTicket: number | null;
  revenue: number;
}

export interface BoosterCampaignPerf {
  id: string;
  storeName: string | null;
  keyword: string;
  couponContent: string;
  status: string;
  totalWeeks: number;
  sentWeeks: number;
  startAt: string | null;
  endAt: string | null;
  totals: {
    sentCount: number;
    clickCount: number;
    clickRate: number;
    couponUsed: number;
    revenue: number;
    adCost: number;
    roi: number | null;
  };
  weeks: BoosterWeekPerf[];
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** 결제가 끝난(발송 예약 이후) 캠페인만 — 미결제 초안·삭제분 제외, 최근 생성 순 */
export async function listBoosterPerformance(storeIds: string[]): Promise<BoosterCampaignPerf[]> {
  if (storeIds.length === 0) return [];
  const campaigns = await prisma.placeBoosterCampaign.findMany({
    where: { storeId: { in: storeIds }, deletedAt: null, status: { not: 'DRAFT' } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { batches: { orderBy: { weekNo: 'asc' } } },
  });
  if (campaigns.length === 0) return [];

  const ids = campaigns.map((c) => c.id);
  const [clicks, stores] = await Promise.all([
    prisma.placeBoosterClick.groupBy({ by: ['campaignId', 'weekNo'], where: { campaignId: { in: ids } }, _count: { _all: true } }),
    prisma.store.findMany({ where: { id: { in: [...new Set(campaigns.map((c) => c.storeId!))] } }, select: { id: true, name: true } }),
  ]);
  const clickBy = new Map(clicks.filter((c) => c.weekNo != null).map((c) => [`${c.campaignId}:${c.weekNo}`, c._count._all]));
  const storeName = new Map(stores.map((s) => [s.id, s.name]));

  return campaigns.map((c) => {
    const weeks: BoosterWeekPerf[] = c.batches.map((b) => {
      const clickCount = clickBy.get(`${c.id}:${b.weekNo}`) ?? 0;
      return {
        weekNo: b.weekNo,
        scheduledAt: b.scheduledAt.toISOString(),
        status: b.status,
        sentCount: b.sentCount,
        clickCount,
        clickRate: b.sentCount > 0 ? round1((clickCount / b.sentCount) * 100) : 0,
        couponUsedCount: b.couponUsedCount,
        avgTicket: b.avgTicket,
        revenue: (b.couponUsedCount ?? 0) * (b.avgTicket ?? 0),
      };
    });
    const sentCount = weeks.reduce((s, w) => s + w.sentCount, 0);
    const clickCount = weeks.reduce((s, w) => s + w.clickCount, 0);
    const revenue = weeks.reduce((s, w) => s + w.revenue, 0);
    const active = c.batches.filter((b) => b.status !== 'CANCELLED');
    return {
      id: c.id,
      storeName: c.storeId ? storeName.get(c.storeId) ?? null : null,
      keyword: c.keyword,
      couponContent: c.couponContent,
      status: c.status,
      totalWeeks: c.totalWeeks,
      sentWeeks: c.batches.filter((b) => b.status === 'SENT').length,
      startAt: active[0]?.scheduledAt.toISOString() ?? null,
      endAt: active[active.length - 1]?.scheduledAt.toISOString() ?? null,
      totals: {
        sentCount,
        clickCount,
        clickRate: sentCount > 0 ? round1((clickCount / sentCount) * 100) : 0,
        couponUsed: weeks.reduce((s, w) => s + (w.couponUsedCount ?? 0), 0),
        revenue,
        adCost: c.adCost,
        roi: c.adCost > 0 ? Math.round((revenue / c.adCost) * 100) : null,
      },
      weeks,
    };
  });
}
