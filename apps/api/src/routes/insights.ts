import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

// 인증 미들웨어 적용
router.use(authMiddleware);

// 연령대 라벨 변환
const getAgeLabel = (ageGroup: string): string => {
  switch (ageGroup) {
    case 'TWENTIES': return '20대';
    case 'THIRTIES': return '30대';
    case 'FORTIES': return '40대';
    case 'FIFTIES': return '50대';
    case 'SIXTY_PLUS': return '60대 이상';
    default: return ageGroup;
  }
};

// birthYear로부터 ageGroup 계산
const calculateAgeGroup = (birthYear: number | null): string | null => {
  if (!birthYear) return null;
  const currentYear = new Date().getFullYear();
  const age = currentYear - birthYear;

  if (age >= 20 && age < 30) return 'TWENTIES';
  if (age >= 30 && age < 40) return 'THIRTIES';
  if (age >= 40 && age < 50) return 'FORTIES';
  if (age >= 50 && age < 60) return 'FIFTIES';
  if (age >= 60) return 'SIXTY_PLUS';
  return null;
};

// GET /api/insights/customers - 고객 통계
router.get('/customers', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { startDate: startDateParam, endDate: endDateParam } = req.query;

    // 날짜 범위 설정
    const whereCondition: any = { storeId };

    if (startDateParam && typeof startDateParam === 'string') {
      const startDate = new Date(startDateParam);
      startDate.setHours(0, 0, 0, 0);
      whereCondition.createdAt = { ...whereCondition.createdAt, gte: startDate };
    }

    if (endDateParam && typeof endDateParam === 'string') {
      const endDate = new Date(endDateParam);
      endDate.setHours(23, 59, 59, 999);
      whereCondition.createdAt = { ...whereCondition.createdAt, lte: endDate };
    }

    // 1. 전체 고객 조회
    const allCustomers = await prisma.customer.findMany({
      where: whereCondition,
      select: {
        id: true,
        gender: true,
        ageGroup: true,
        birthYear: true,
        visitSource: true,
        visitCount: true,
        totalPoints: true,
      },
    });

    const totalCustomers = allCustomers.length;

    // 2. 성별 분포
    let maleCount = 0;
    let femaleCount = 0;
    let unknownGenderCount = 0;

    allCustomers.forEach((c) => {
      if (c.gender === 'MALE') maleCount++;
      else if (c.gender === 'FEMALE') femaleCount++;
      else unknownGenderCount++;
    });

    const genderDistribution = {
      male: maleCount,
      female: femaleCount,
      unknown: unknownGenderCount,
      total: totalCustomers,
    };

    // 3. 연령대 분포
    const ageMap = new Map<string, number>();
    allCustomers.forEach((c) => {
      const ageGroup = c.ageGroup || calculateAgeGroup(c.birthYear);
      if (ageGroup) {
        ageMap.set(ageGroup, (ageMap.get(ageGroup) || 0) + 1);
      }
    });

    const ageDistribution = Array.from(ageMap.entries())
      .map(([ageGroup, count]) => ({
        ageGroup,
        label: getAgeLabel(ageGroup),
        count,
        percentage: totalCustomers > 0 ? Math.round((count / totalCustomers) * 100) : 0,
      }))
      .sort((a, b) => {
        const order: Record<string, number> = {
          TWENTIES: 1,
          THIRTIES: 2,
          FORTIES: 3,
          FIFTIES: 4,
          SIXTY_PLUS: 5,
        };
        return (order[a.ageGroup] || 999) - (order[b.ageGroup] || 999);
      });

    // 4. 성별 × 연령대별 평균 포인트 (소비 대용)
    const genderAgeMap = new Map<string, { totalPoints: number; count: number }>();

    allCustomers.forEach((c) => {
      const gender = c.gender || 'UNKNOWN';
      const ageGroup = c.ageGroup || calculateAgeGroup(c.birthYear) || 'UNKNOWN';
      const key = `${gender}_${ageGroup}`;

      if (!genderAgeMap.has(key)) {
        genderAgeMap.set(key, { totalPoints: 0, count: 0 });
      }

      const data = genderAgeMap.get(key)!;
      data.totalPoints += c.totalPoints || 0;
      data.count += 1;
    });

    const genderAgeSpending = Array.from(genderAgeMap.entries())
      .filter(([key]) => !key.includes('UNKNOWN'))
      .map(([key, data]) => {
        const [gender, ageGroup] = key.split('_');
        return {
          gender: gender === 'MALE' ? '남성' : '여성',
          genderCode: gender,
          ageGroup,
          ageLabel: getAgeLabel(ageGroup),
          avgPoints: data.count > 0 ? Math.round(data.totalPoints / data.count) : 0,
        };
      })
      .sort((a, b) => {
        const genderOrder = { MALE: 1, FEMALE: 2 };
        const ageOrder: Record<string, number> = {
          TWENTIES: 1,
          THIRTIES: 2,
          FORTIES: 3,
          FIFTIES: 4,
          SIXTY_PLUS: 5,
        };
        const genderDiff =
          (genderOrder[a.genderCode as keyof typeof genderOrder] || 99) -
          (genderOrder[b.genderCode as keyof typeof genderOrder] || 99);
        if (genderDiff !== 0) return genderDiff;
        return (ageOrder[a.ageGroup] || 99) - (ageOrder[b.ageGroup] || 99);
      });

    // 5. 재방문율 (7일, 30일)
    const now = new Date();
    const date7DaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const date30DaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 7일 내 방문 고객
    const visits7Days = await prisma.pointLedger.groupBy({
      by: ['customerId'],
      where: {
        storeId,
        type: 'EARN',
        createdAt: { gte: date7DaysAgo },
      },
      _count: { id: true },
    });

    const total7Days = visits7Days.length;
    const revisit7Days = visits7Days.filter((v) => v._count.id >= 2).length;
    const retention7 = total7Days > 0 ? Math.round((revisit7Days / total7Days) * 100) : 0;

    // 30일 내 방문 고객
    const visits30Days = await prisma.pointLedger.groupBy({
      by: ['customerId'],
      where: {
        storeId,
        type: 'EARN',
        createdAt: { gte: date30DaysAgo },
      },
      _count: { id: true },
    });

    const total30Days = visits30Days.length;
    const revisit30Days = visits30Days.filter((v) => v._count.id >= 2).length;
    const retention30 = total30Days > 0 ? Math.round((revisit30Days / total30Days) * 100) : 0;

    const retention = {
      day7: retention7,
      day30: retention30,
    };

    // 6. 방문 경로 분포
    const visitSourceMap = new Map<string, number>();
    let noSourceCount = 0;

    allCustomers.forEach((c) => {
      if (c.visitSource) {
        visitSourceMap.set(c.visitSource, (visitSourceMap.get(c.visitSource) || 0) + 1);
      } else {
        noSourceCount++;
      }
    });

    // 방문 경로 라벨 조회
    const visitSourceSetting = await prisma.visitSourceSetting.findUnique({
      where: { storeId },
      select: { options: true },
    });

    const optionsArray = (visitSourceSetting?.options as Array<{ id: string; label: string }>) || [];
    const labelMap = new Map(optionsArray.map((opt) => [opt.id, opt.label]));

    const visitSourceDistribution = Array.from(visitSourceMap.entries())
      .map(([source, count]) => ({
        source,
        label: labelMap.get(source) || source,
        count,
        percentage: totalCustomers > 0 ? Math.round((count / totalCustomers) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // 미설정 고객 추가
    if (noSourceCount > 0) {
      visitSourceDistribution.push({
        source: 'none',
        label: '미설정',
        count: noSourceCount,
        percentage: totalCustomers > 0 ? Math.round((noSourceCount / totalCustomers) * 100) : 0,
      });
    }

    res.json({
      totalCustomers,
      genderDistribution,
      ageDistribution,
      genderAgeSpending,
      retention,
      visitSourceDistribution,
    });
  } catch (error) {
    console.error('Customer insights error:', error);
    res.status(500).json({ error: '고객 통계 조회 중 오류가 발생했습니다.' });
  }
});

// ============================================
// 고객 세그먼트 (RFM 분석)
// ============================================

type SegmentType = 'VIP' | 'REGULAR' | 'GROWING' | 'NEW' | 'AT_RISK' | 'CHURNED';

interface SegmentedCustomer {
  id: string;
  name: string | null;
  phone: string | null;
  visitCount: number;
  totalPoints: number;
  lastVisitAt: Date | null;
  recencyDays: number;
  segment: SegmentType;
}

function classifySegment(
  recencyDays: number,
  frequency: number,
  isTopMonetary: boolean
): SegmentType {
  if (recencyDays > 90) return 'CHURNED';
  if (recencyDays > 45 && frequency >= 2) return 'AT_RISK';
  if (frequency >= 10 && recencyDays <= 30 && isTopMonetary) return 'VIP';
  if (frequency >= 5 && recencyDays <= 45) return 'REGULAR';
  if (frequency >= 2 && recencyDays <= 30) return 'GROWING';
  return 'NEW';
}

// GET /api/insights/segments - 고객 세그먼트 분석
router.get('/segments', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const segment = req.query.segment as string | undefined;

    const now = new Date();

    // 전체 고객 조회
    const customers = await prisma.customer.findMany({
      where: { storeId },
      select: {
        id: true,
        name: true,
        phone: true,
        visitCount: true,
        totalPoints: true,
        lastVisitAt: true,
      },
    });

    // Monetary 상위 20% 기준 계산
    const sortedByPoints = [...customers]
      .sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));
    const top20Index = Math.max(1, Math.floor(customers.length * 0.2));
    const top20Threshold = sortedByPoints[top20Index - 1]?.totalPoints || 0;

    // 각 고객 세그먼트 분류
    const segmented: SegmentedCustomer[] = customers.map((c) => {
      const lastVisit = c.lastVisitAt ? new Date(c.lastVisitAt) : null;
      const recencyDays = lastVisit
        ? Math.floor((now.getTime() - lastVisit.getTime()) / (1000 * 60 * 60 * 24))
        : 999;
      const isTopMonetary = (c.totalPoints || 0) >= top20Threshold && top20Threshold > 0;

      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        visitCount: c.visitCount,
        totalPoints: c.totalPoints || 0,
        lastVisitAt: c.lastVisitAt,
        recencyDays,
        segment: classifySegment(recencyDays, c.visitCount, isTopMonetary),
      };
    });

    // 세그먼트별 집계
    const segmentCounts: Record<SegmentType, number> = {
      VIP: 0, REGULAR: 0, GROWING: 0, NEW: 0, AT_RISK: 0, CHURNED: 0,
    };
    segmented.forEach((c) => segmentCounts[c.segment]++);

    const totalCustomers = customers.length;

    const segmentLabels: Record<SegmentType, string> = {
      VIP: 'VIP',
      REGULAR: '단골',
      GROWING: '성장 가능',
      NEW: '신규',
      AT_RISK: '이탈 위험',
      CHURNED: '이탈',
    };

    const segments = (Object.keys(segmentCounts) as SegmentType[]).map((type) => ({
      type,
      label: segmentLabels[type],
      count: segmentCounts[type],
      percentage: totalCustomers > 0 ? Math.round((segmentCounts[type] / totalCustomers) * 100) : 0,
    }));

    // 특정 세그먼트 상세 요청 시
    let customerList: SegmentedCustomer[] | undefined;
    if (segment) {
      customerList = segmented
        .filter((c) => c.segment === segment)
        .sort((a, b) => a.recencyDays - b.recencyDays)
        .slice(0, 100);
    }

    res.json({
      totalCustomers,
      segments,
      customers: customerList,
    });
  } catch (error) {
    console.error('Segment insights error:', error);
    res.status(500).json({ error: '세그먼트 분석 중 오류가 발생했습니다.' });
  }
});

// ============================================
// 방문 주기 분석
// ============================================

// GET /api/insights/visit-cycle - 방문 주기 분석
router.get('/visit-cycle', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const now = new Date();

    // 방문 3회 이상인 고객의 포인트 적립 기록 조회
    const eligibleCustomers = await prisma.customer.findMany({
      where: { storeId, visitCount: { gte: 3 } },
      select: { id: true, visitCount: true, lastVisitAt: true },
    });

    const eligibleIds = eligibleCustomers.map((c) => c.id);

    // 모든 적립 기록 한 번에 조회
    const earnRecords = await prisma.pointLedger.findMany({
      where: {
        storeId,
        customerId: { in: eligibleIds },
        type: 'EARN',
      },
      select: { customerId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    // 고객별 방문 간격 계산
    const customerVisits = new Map<string, Date[]>();
    earnRecords.forEach((r) => {
      if (!customerVisits.has(r.customerId)) {
        customerVisits.set(r.customerId, []);
      }
      customerVisits.get(r.customerId)!.push(new Date(r.createdAt));
    });

    const customerCycles: { customerId: string; avgCycle: number; lastVisitAt: Date | null }[] = [];
    const allGaps: number[] = [];

    customerVisits.forEach((visits, customerId) => {
      // 같은 날 중복 방문 제거
      const uniqueDays: Date[] = [];
      let prevDay = '';
      for (const v of visits) {
        const dayStr = v.toISOString().slice(0, 10);
        if (dayStr !== prevDay) {
          uniqueDays.push(v);
          prevDay = dayStr;
        }
      }

      if (uniqueDays.length < 3) return;

      // 간격 계산
      const gaps: number[] = [];
      for (let i = 1; i < uniqueDays.length; i++) {
        const gap = Math.round(
          (uniqueDays[i].getTime() - uniqueDays[i - 1].getTime()) / (1000 * 60 * 60 * 24)
        );
        if (gap > 0) gaps.push(gap);
      }

      if (gaps.length < 2) return;

      // 이상치 제거 (상위/하위 10%)
      const sorted = [...gaps].sort((a, b) => a - b);
      const trimCount = Math.max(1, Math.floor(sorted.length * 0.1));
      const trimmed = sorted.slice(trimCount, sorted.length - trimCount);

      if (trimmed.length === 0) return;

      const avg = Math.round(trimmed.reduce((a, b) => a + b, 0) / trimmed.length);
      const customer = eligibleCustomers.find((c) => c.id === customerId);

      customerCycles.push({
        customerId,
        avgCycle: avg,
        lastVisitAt: customer?.lastVisitAt || null,
      });

      allGaps.push(avg);
    });

    // 매장 평균 방문 주기
    const avgCycleDays = allGaps.length > 0
      ? Math.round((allGaps.reduce((a, b) => a + b, 0) / allGaps.length) * 10) / 10
      : 0;

    // 히스토그램 분포
    const ranges = [
      { label: '1-3일', min: 1, max: 3 },
      { label: '4-7일', min: 4, max: 7 },
      { label: '8-14일', min: 8, max: 14 },
      { label: '15-21일', min: 15, max: 21 },
      { label: '22-30일', min: 22, max: 30 },
      { label: '31-45일', min: 31, max: 45 },
      { label: '46일+', min: 46, max: 9999 },
    ];

    const distribution = ranges.map((range) => ({
      label: range.label,
      count: allGaps.filter((g) => g >= range.min && g <= range.max).length,
    }));

    // 가장 많은 고객의 방문 주기 구간
    const peakRange = distribution.reduce(
      (max, d) => (d.count > max.count ? d : max),
      distribution[0]
    );

    // 넛지 대상 현황
    let stage1 = 0;
    let stage2 = 0;
    let stage3 = 0;

    customerCycles.forEach((c) => {
      if (!c.lastVisitAt) return;
      const daysSince = Math.floor(
        (now.getTime() - new Date(c.lastVisitAt).getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSince >= c.avgCycle * 3 || daysSince >= 90) {
        stage3++;
      } else if (daysSince >= c.avgCycle * 1.5) {
        stage2++;
      } else if (daysSince >= c.avgCycle) {
        stage1++;
      }
    });

    const totalCustomers = await prisma.customer.count({ where: { storeId } });

    res.json({
      avgCycleDays,
      analyzableCount: customerCycles.length,
      totalCustomers,
      distribution,
      peakRange: peakRange?.label || '-',
      peakCount: peakRange?.count || 0,
      nudgeTargets: { stage1, stage2, stage3 },
    });
  } catch (error) {
    console.error('Visit cycle insights error:', error);
    res.status(500).json({ error: '방문 주기 분석 중 오류가 발생했습니다.' });
  }
});

// ============================================
// 매출 기여 대시보드
// ============================================

// GET /api/insights/revenue - 매출 기여 분석
router.get('/revenue', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // 1. 자동화 매출 (AutomationLog에서 쿠폰 사용된 건)
    const automationLogs = await prisma.automationLog.findMany({
      where: {
        storeId,
        couponUsed: true,
        sentAt: { gte: startOfMonth },
      },
      include: {
        rule: { select: { type: true } },
      },
    });

    let automationBirthdayRevenue = 0;
    let automationChurnRevenue = 0;
    let automationBirthdayCouponsUsed = 0;
    let automationChurnCouponsUsed = 0;

    automationLogs.forEach((log) => {
      const amount = log.resultAmount || 0;
      if (log.rule.type === 'BIRTHDAY') {
        automationBirthdayRevenue += amount;
        automationBirthdayCouponsUsed++;
      } else if (log.rule.type === 'CHURN_PREVENTION') {
        automationChurnRevenue += amount;
        automationChurnCouponsUsed++;
      }
    });

    // 2. 수동 캠페인 쿠폰 사용 (RetargetCoupon에서 자동화 로그에 없는 것)
    const automationCouponCodes = new Set(
      automationLogs.map((l) => l.couponCode).filter(Boolean)
    );

    const manualCouponsUsed = await prisma.retargetCoupon.count({
      where: {
        storeId,
        usedAt: { not: null, gte: startOfMonth },
        code: { notIn: Array.from(automationCouponCodes) as string[] },
      },
    });

    const manualCouponsTotal = await prisma.retargetCoupon.count({
      where: {
        storeId,
        createdAt: { gte: startOfMonth },
        code: { notIn: Array.from(automationCouponCodes) as string[] },
      },
    });

    // 3. 전체 자동화 발송 건수
    const automationTotalSent = await prisma.automationLog.count({
      where: { storeId, sentAt: { gte: startOfMonth } },
    });

    // 4. 메시지 비용 (PaymentTransaction)
    const costs = await prisma.paymentTransaction.findMany({
      where: {
        storeId,
        type: 'ALIMTALK_SEND',
        createdAt: { gte: startOfMonth },
        amount: { lt: 0 },
      },
      select: { amount: true, meta: true },
    });

    let automationCost = 0;
    let campaignCost = 0;

    costs.forEach((t) => {
      const meta = t.meta as Record<string, any> | null;
      const msgType = meta?.messageType || '';
      const cost = Math.abs(t.amount);

      if (msgType.startsWith('AUTO_')) {
        automationCost += cost;
      } else if (msgType === 'RETARGET_COUPON') {
        campaignCost += cost;
      } else {
        campaignCost += cost;
      }
    });

    // 5. 총합 계산
    const totalRevenue = automationBirthdayRevenue + automationChurnRevenue;
    const totalCost = automationCost + campaignCost;
    const roi = totalCost > 0 ? Math.round((totalRevenue / totalCost) * 10) / 10 : 0;

    // 전체 쿠폰 발송/사용
    const totalCouponsSent = automationTotalSent + manualCouponsTotal;
    const totalCouponsUsed = automationBirthdayCouponsUsed + automationChurnCouponsUsed + manualCouponsUsed;
    const couponUsageRate = totalCouponsSent > 0
      ? Math.round((totalCouponsUsed / totalCouponsSent) * 1000) / 10
      : 0;

    // 활성 고객 수 (30일 이내 방문)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const activeCustomers = await prisma.customer.count({
      where: { storeId, lastVisitAt: { gte: thirtyDaysAgo } },
    });

    // 채널별 매출
    const channels = [
      { name: '이탈방지 자동화', revenue: automationChurnRevenue, couponsUsed: automationChurnCouponsUsed },
      { name: '생일 자동화', revenue: automationBirthdayRevenue, couponsUsed: automationBirthdayCouponsUsed },
      { name: '수동 캠페인', revenue: 0, couponsUsed: manualCouponsUsed },
    ].filter((ch) => ch.revenue > 0 || ch.couponsUsed > 0);

    // 월별 추이 (최근 6개월)
    const monthlyTrend: { month: string; revenue: number; cost: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const yearMonth = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`;

      const monthLogs = await prisma.automationLog.findMany({
        where: {
          storeId,
          couponUsed: true,
          sentAt: { gte: monthStart, lt: monthEnd },
        },
        select: { resultAmount: true },
      });

      const monthCosts = await prisma.paymentTransaction.aggregate({
        where: {
          storeId,
          type: 'ALIMTALK_SEND',
          createdAt: { gte: monthStart, lt: monthEnd },
          amount: { lt: 0 },
        },
        _sum: { amount: true },
      });

      const monthRevenue = monthLogs.reduce((sum, l) => sum + (l.resultAmount || 0), 0);
      const monthCost = Math.abs(monthCosts._sum.amount || 0);

      monthlyTrend.push({ month: yearMonth, revenue: monthRevenue, cost: monthCost });
    }

    // 비용 대비 효과 테이블
    const costEffectiveness = [
      {
        name: '자동화 메시지',
        cost: automationCost,
        revenue: totalRevenue,
        roi: automationCost > 0 ? Math.round((totalRevenue / automationCost) * 10) / 10 : 0,
      },
      {
        name: '수동 캠페인',
        cost: campaignCost,
        revenue: 0,
        roi: 0,
      },
    ];

    res.json({
      totalRevenue,
      totalCost,
      roi,
      couponUsageRate,
      activeCustomers,
      channels,
      monthlyTrend,
      costEffectiveness,
      summary: {
        automationSent: automationTotalSent,
        couponsSent: totalCouponsSent,
        couponsUsed: totalCouponsUsed,
      },
    });
  } catch (error) {
    console.error('Revenue insights error:', error);
    res.status(500).json({ error: '매출 기여 분석 중 오류가 발생했습니다.' });
  }
});

export default router;
