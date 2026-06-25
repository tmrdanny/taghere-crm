import { Router, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { AdminRequest, adminAuthMiddleware } from './admin-shared.js';

const router = Router();

// GET /api/admin/stats - 대시보드 통계
router.get('/stats', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const [storeCount, customerCount, userCount] = await Promise.all([
      prisma.store.count(),
      prisma.customer.count(),
      prisma.staffUser.count(),
    ]);

    res.json({
      storeCount,
      customerCount,
      userCount,
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: '통계 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/admin/customer-trend - 고객 증감 추이
router.get('/customer-trend', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { days = '30' } = req.query;
    const daysNum = days === 'all' ? 365 : parseInt(days as string);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum);
    startDate.setHours(0, 0, 0, 0);

    // 기간 내 일별 고객 등록 수 (DB에서 일 단위 집계 - 전체 row 로드 방지)
    const [dailyCounts, baseCount] = await Promise.all([
      prisma.$queryRaw<{ date: string; count: number }[]>`
        SELECT to_char("createdAt", 'YYYY-MM-DD') AS date, COUNT(*)::int AS count
        FROM customers
        WHERE "createdAt" >= ${startDate}
        GROUP BY 1
        ORDER BY 1
      `,
      // 시작일 이전 총 고객 수
      prisma.customer.count({
        where: {
          createdAt: {
            lt: startDate,
          },
        },
      }),
    ]);

    // 일별 데이터 집계
    const dailyData: { date: string; count: number; cumulative: number }[] = [];
    const dateMap = new Map<string, number>();
    let periodNew = 0;

    dailyCounts.forEach((row) => {
      dateMap.set(row.date, row.count);
      periodNew += row.count;
    });

    // 기간 내 모든 날짜 생성
    let cumulative = baseCount;
    const currentDate = new Date(startDate);
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    while (currentDate <= today) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const count = dateMap.get(dateStr) || 0;
      cumulative += count;

      dailyData.push({
        date: dateStr,
        count,
        cumulative,
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    res.json({
      trend: dailyData,
      totalCustomers: cumulative,
      periodNew,
    });
  } catch (error) {
    console.error('Admin customer trend error:', error);
    res.status(500).json({ error: '고객 추이 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/admin/payment-stats - 토스페이먼츠 실 결제 금액 통계
router.get('/payment-stats', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const tossStoreTopupWhere = {
      type: 'TOPUP' as const,
      status: 'SUCCESS' as const,
      meta: { path: ['source'], equals: 'tosspayments' },
    };
    const tossStoreRefundWhere = {
      type: 'REFUND' as const,
      status: 'SUCCESS' as const,
      meta: { path: ['source'], equals: 'tosspayments' },
    };
    const tossFranchiseTopupWhere = {
      type: 'TOPUP' as const,
      meta: { path: ['source'], equals: 'tosspayments' },
    };

    // 전체 row를 가져오지 않고 DB에서 합산
    const [
      storeTopupAgg,
      storeTopupMonthAgg,
      storeRefundAgg,
      storeRefundMonthAgg,
      franchiseAgg,
      franchiseMonthAgg,
      externalAgg,
      externalMonthAgg,
    ] = await Promise.all([
      prisma.paymentTransaction.aggregate({ where: tossStoreTopupWhere, _sum: { amount: true }, _count: true }),
      prisma.paymentTransaction.aggregate({ where: { ...tossStoreTopupWhere, createdAt: { gte: startOfMonth } }, _sum: { amount: true } }),
      prisma.paymentTransaction.aggregate({ where: tossStoreRefundWhere, _sum: { amount: true } }),
      prisma.paymentTransaction.aggregate({ where: { ...tossStoreRefundWhere, createdAt: { gte: startOfMonth } }, _sum: { amount: true } }),
      prisma.franchiseTransaction.aggregate({ where: tossFranchiseTopupWhere, _sum: { amount: true }, _count: true }),
      prisma.franchiseTransaction.aggregate({ where: { ...tossFranchiseTopupWhere, createdAt: { gte: startOfMonth } }, _sum: { amount: true } }),
      prisma.externalRevenue.aggregate({ _sum: { amount: true } }),
      prisma.externalRevenue.aggregate({ where: { revenueDate: { gte: startOfMonth } }, _sum: { amount: true } }),
    ]);

    // Store 매출 합산 (TOPUP - REFUND)
    const storeTotal = (storeTopupAgg._sum.amount || 0) - (storeRefundAgg._sum.amount || 0);
    const franchiseTotal = franchiseAgg._sum.amount || 0;
    const totalRealPayments = storeTotal + franchiseTotal;

    // 이번 달 매출
    const monthlyStorePayments = (storeTopupMonthAgg._sum.amount || 0) - (storeRefundMonthAgg._sum.amount || 0);
    const monthlyFranchisePayments = franchiseMonthAgg._sum.amount || 0;
    const monthlyRealPayments = monthlyStorePayments + monthlyFranchisePayments;

    // 총 결제 건수 (토스페이먼츠만)
    const totalTransactions = storeTopupAgg._count + franchiseAgg._count;

    // 외부 매출 (계좌이체 등)
    const totalExternalRevenue = externalAgg._sum.amount || 0;
    const monthlyExternalRevenue = externalMonthAgg._sum.amount || 0;

    res.json({
      totalRealPayments: totalRealPayments + totalExternalRevenue,
      monthlyRealPayments: monthlyRealPayments + monthlyExternalRevenue,
      totalTransactions,
      // 분리된 값도 제공
      tossPayments: totalRealPayments,
      externalRevenue: totalExternalRevenue,
    });
  } catch (error) {
    console.error('Admin payment stats error:', error);
    res.status(500).json({ error: '결제 통계 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/admin/external-revenue - 외부 매출 목록 조회
router.get('/external-revenue', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const revenues = await prisma.externalRevenue.findMany({
      orderBy: { revenueDate: 'desc' },
      take: 50,
    });

    res.json({ revenues });
  } catch (error) {
    console.error('Admin external revenue list error:', error);
    res.status(500).json({ error: '외부 매출 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/admin/external-revenue - 외부 매출 추가
router.post('/external-revenue', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { amount, description, revenueDate } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: '금액을 입력해주세요.' });
    }

    const revenue = await prisma.externalRevenue.create({
      data: {
        amount: Number(amount),
        description: description || '계좌이체',
        revenueDate: revenueDate ? new Date(revenueDate) : new Date(),
      },
    });

    res.json({ success: true, revenue });
  } catch (error) {
    console.error('Admin external revenue create error:', error);
    res.status(500).json({ error: '외부 매출 추가 중 오류가 발생했습니다.' });
  }
});

// DELETE /api/admin/external-revenue/:id - 외부 매출 삭제
router.delete('/external-revenue/:id', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.externalRevenue.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Admin external revenue delete error:', error);
    res.status(500).json({ error: '외부 매출 삭제 중 오류가 발생했습니다.' });
  }
});

// GET /api/admin/point-stats - 누적 적립 포인트 통계
router.get('/point-stats', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    // 추적 시작일: 2026년 1월 1일
    const trackingStartDate = new Date('2026-01-01T00:00:00+09:00');

    // 누적 적립 포인트 (2026.01.01부터, EARN 타입만)
    const result = await prisma.pointLedger.aggregate({
      where: {
        type: 'EARN',
        createdAt: {
          gte: trackingStartDate,
        },
      },
      _sum: {
        delta: true,
      },
    });

    // 이번 달 적립 포인트
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlyResult = await prisma.pointLedger.aggregate({
      where: {
        type: 'EARN',
        createdAt: {
          gte: startOfMonth,
        },
      },
      _sum: {
        delta: true,
      },
    });

    res.json({
      totalEarnedPoints: result._sum.delta || 0,
      monthlyEarnedPoints: monthlyResult._sum.delta || 0,
    });
  } catch (error) {
    console.error('Admin point stats error:', error);
    res.status(500).json({ error: '포인트 통계 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/admin/visit-source-stats - 전체 고객 방문경로 통계
router.get('/visit-source-stats', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    // visitSource별 카운트를 DB에서 집계 (전체 고객 row 로드 방지)
    const [visitSourceGroups, visitSourceSettings] = await Promise.all([
      prisma.customer.groupBy({
        by: ['visitSource'],
        _count: { _all: true },
      }),
      // 모든 매장의 VisitSourceSetting에서 라벨 조회
      prisma.visitSourceSetting.findMany({
        select: { options: true },
      }),
    ]);

    const visitSourceMap = new Map<string, number>();
    let noSourceCount = 0;
    let totalCustomerCount = 0;

    visitSourceGroups.forEach((g) => {
      totalCustomerCount += g._count._all;
      if (g.visitSource) {
        visitSourceMap.set(g.visitSource, g._count._all);
      } else {
        noSourceCount += g._count._all;
      }
    });

    // 모든 옵션을 합쳐서 라벨 맵 생성
    const labelMap = new Map<string, string>();
    visitSourceSettings.forEach((setting) => {
      const optionsArray = (setting.options as Array<{ id: string; label: string }>) || [];
      optionsArray.forEach((opt) => {
        if (!labelMap.has(opt.id)) {
          labelMap.set(opt.id, opt.label);
        }
      });
    });

    // 결과 배열 생성
    const totalWithSource = totalCustomerCount - noSourceCount;
    const distribution = Array.from(visitSourceMap.entries())
      .map(([source, count]) => ({
        source,
        label: labelMap.get(source) || source,
        count,
        percentage: totalWithSource > 0 ? Math.round((count / totalWithSource) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    res.json({
      totalCustomers: totalCustomerCount,
      totalWithSource,
      noSourceCount,
      distribution,
    });
  } catch (error) {
    console.error('Admin visit source stats error:', error);
    res.status(500).json({ error: '방문경로 통계 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/admin/demographic-stats - 전체 고객 성별/연령대 통계
router.get('/demographic-stats', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    // 성별/연령대 카운트를 DB에서 집계 (전체 고객 row 로드 방지)
    const [genderGroups, ageGroupGroups] = await Promise.all([
      prisma.customer.groupBy({ by: ['gender'], _count: { _all: true } }),
      prisma.customer.groupBy({ by: ['ageGroup'], _count: { _all: true } }),
    ]);

    const total = genderGroups.reduce((sum, g) => sum + g._count._all, 0);

    // 성별 집계
    const genderMap: Record<string, number> = { MALE: 0, FEMALE: 0, UNKNOWN: 0 };
    genderGroups.forEach((g) => {
      if (g.gender === 'MALE' || g.gender === 'FEMALE') {
        genderMap[g.gender] += g._count._all;
      } else {
        genderMap['UNKNOWN'] += g._count._all;
      }
    });

    const genderDistribution = [
      { key: 'MALE', label: '남성', count: genderMap['MALE'], percentage: total > 0 ? Math.round((genderMap['MALE'] / total) * 1000) / 10 : 0 },
      { key: 'FEMALE', label: '여성', count: genderMap['FEMALE'], percentage: total > 0 ? Math.round((genderMap['FEMALE'] / total) * 1000) / 10 : 0 },
      { key: 'UNKNOWN', label: '미입력', count: genderMap['UNKNOWN'], percentage: total > 0 ? Math.round((genderMap['UNKNOWN'] / total) * 1000) / 10 : 0 },
    ];

    // 연령대 집계
    const ageGroupMap: Record<string, number> = {
      TWENTIES: 0, THIRTIES: 0, FORTIES: 0, FIFTIES: 0, SIXTY_PLUS: 0, UNKNOWN: 0,
    };
    ageGroupGroups.forEach((g) => {
      if (g.ageGroup && ageGroupMap[g.ageGroup] !== undefined) {
        ageGroupMap[g.ageGroup] += g._count._all;
      } else {
        ageGroupMap['UNKNOWN'] += g._count._all;
      }
    });

    const ageGroupDistribution = [
      { key: 'TWENTIES', label: '20대', count: ageGroupMap['TWENTIES'], percentage: total > 0 ? Math.round((ageGroupMap['TWENTIES'] / total) * 1000) / 10 : 0 },
      { key: 'THIRTIES', label: '30대', count: ageGroupMap['THIRTIES'], percentage: total > 0 ? Math.round((ageGroupMap['THIRTIES'] / total) * 1000) / 10 : 0 },
      { key: 'FORTIES', label: '40대', count: ageGroupMap['FORTIES'], percentage: total > 0 ? Math.round((ageGroupMap['FORTIES'] / total) * 1000) / 10 : 0 },
      { key: 'FIFTIES', label: '50대', count: ageGroupMap['FIFTIES'], percentage: total > 0 ? Math.round((ageGroupMap['FIFTIES'] / total) * 1000) / 10 : 0 },
      { key: 'SIXTY_PLUS', label: '60대 이상', count: ageGroupMap['SIXTY_PLUS'], percentage: total > 0 ? Math.round((ageGroupMap['SIXTY_PLUS'] / total) * 1000) / 10 : 0 },
      { key: 'UNKNOWN', label: '미입력', count: ageGroupMap['UNKNOWN'], percentage: total > 0 ? Math.round((ageGroupMap['UNKNOWN'] / total) * 1000) / 10 : 0 },
    ];

    res.json({
      totalCustomers: total,
      genderDistribution,
      ageGroupDistribution,
    });
  } catch (error) {
    console.error('Admin demographic stats error:', error);
    res.status(500).json({ error: '성별/연령대 통계 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/admin/external-customer-stats - 신규고객(ExternalCustomer) 수집 통계
router.get('/external-customer-stats', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { period = 'daily' } = req.query;

    const now = new Date();
    // 시작일: 2026년 1월 18일 고정
    const fixedStartDate = new Date('2026-01-18T00:00:00');
    let startDate: Date;

    switch (period) {
      case 'weekly':
        // 1월 18일 이후 주별
        startDate = fixedStartDate;
        break;
      case 'monthly':
        // 1월 18일 이후 월별
        startDate = fixedStartDate;
        break;
      case 'daily':
      default:
        // 1월 18일 이후 일별
        startDate = fixedStartDate;
        break;
    }

    // 전체 ExternalCustomer 수
    const total = await prisma.externalCustomer.count({
      where: { consentMarketing: true },
    });

    // 기간 내 집계 — DB 레벨 그룹핑(전체 행 메모리 로드 제거). period는 화이트리스트라 인젝션 없음.
    const bucketExpr =
      period === 'weekly'
        ? `to_char(date_trunc('week', "createdAt"), 'YYYY-MM-DD')`
        : period === 'monthly'
          ? `to_char("createdAt", 'YYYY-MM')`
          : `to_char("createdAt", 'YYYY-MM-DD')`;
    const grouped = await prisma.$queryRawUnsafe<{ date: string; count: number }[]>(
      `SELECT ${bucketExpr} AS date, COUNT(*)::int AS count
       FROM external_customers
       WHERE "createdAt" >= $1 AND "consentMarketing" = true
       GROUP BY 1 ORDER BY 1`,
      startDate
    );
    const data = grouped.map((r) => ({ date: r.date, count: Number(r.count) }));

    // 기간 내 총 수집 수
    const periodTotal = data.reduce((s, r) => s + r.count, 0);

    // 일평균 계산
    const daysDiff = Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const averagePerDay = daysDiff > 0 ? Math.round((periodTotal / daysDiff) * 10) / 10 : 0;

    res.json({
      period,
      data,
      summary: {
        total,
        periodTotal,
        averagePerDay,
      },
    });
  } catch (error) {
    console.error('Admin external customer stats error:', error);
    res.status(500).json({ error: '신규고객 통계 조회 중 오류가 발생했습니다.' });
  }
});

// ============================================
// 프랜차이즈 충전금 관리
// ============================================

// GET /api/admin/automation-stats — 전체 요약 통계
router.get('/automation-stats', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [totalStores, activeStoreIds, totalRulesEnabled, logsThisMonth, ruleTypeCounts] = await Promise.all([
      prisma.store.count(),
      prisma.automationRule.findMany({
        where: { enabled: true },
        select: { storeId: true },
        distinct: ['storeId'],
      }),
      prisma.automationRule.count({ where: { enabled: true } }),
      prisma.automationLog.findMany({
        where: { sentAt: { gte: startOfMonth } },
        select: { couponUsed: true },
      }),
      prisma.automationRule.groupBy({
        by: ['type'],
        where: { enabled: true },
        _count: { _all: true },
      }),
    ]);

    const totalSentThisMonth = logsThisMonth.length;
    const totalCouponUsed = logsThisMonth.filter(l => l.couponUsed).length;
    const usageRate = totalSentThisMonth > 0 ? Math.round((totalCouponUsed / totalSentThisMonth) * 100) : 0;

    const ruleTypeBreakdown: Record<string, number> = {};
    ruleTypeCounts.forEach(r => {
      ruleTypeBreakdown[r.type] = r._count._all;
    });

    res.json({
      totalStores,
      activeStores: activeStoreIds.length,
      totalRulesEnabled,
      totalSentThisMonth,
      totalCouponUsed,
      usageRate,
      ruleTypeBreakdown,
    });
  } catch (error) {
    console.error('Admin automation stats error:', error);
    res.status(500).json({ error: '자동 마케팅 통계 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/admin/automation-stores — 매장별 자동 마케팅 현황
router.get('/automation-stores', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const stores = await prisma.store.findMany({
      select: {
        id: true,
        name: true,
        ownerName: true,
        automationRules: {
          select: { type: true, enabled: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    const storeIds = stores.map(s => s.id);

    // 이번 달 로그를 매장별로 집계 (3종 groupBy 병렬)
    const [logStats, couponStats, lastSentMap] = await Promise.all([
      prisma.automationLog.groupBy({
        by: ['storeId'],
        where: { storeId: { in: storeIds }, sentAt: { gte: startOfMonth } },
        _count: { _all: true },
      }),
      prisma.automationLog.groupBy({
        by: ['storeId'],
        where: { storeId: { in: storeIds }, sentAt: { gte: startOfMonth }, couponUsed: true },
        _count: { _all: true },
      }),
      prisma.automationLog.groupBy({
        by: ['storeId'],
        where: { storeId: { in: storeIds } },
        _max: { sentAt: true },
      }),
    ]);

    const logMap: Record<string, number> = {};
    logStats.forEach(l => { logMap[l.storeId] = l._count._all; });

    const couponMap: Record<string, number> = {};
    couponStats.forEach(c => { couponMap[c.storeId] = c._count._all; });

    const lastSentAtMap: Record<string, Date | null> = {};
    lastSentMap.forEach(l => { lastSentAtMap[l.storeId] = l._max.sentAt; });

    const result = stores.map(store => {
      const enabledRules = store.automationRules.filter(r => r.enabled).map(r => r.type);
      const totalSent = logMap[store.id] || 0;
      const couponUsed = couponMap[store.id] || 0;
      return {
        storeId: store.id,
        storeName: store.name,
        ownerName: store.ownerName,
        enabledRules,
        totalSent,
        couponUsed,
        usageRate: totalSent > 0 ? Math.round((couponUsed / totalSent) * 100) : 0,
        lastSentAt: lastSentAtMap[store.id] || null,
      };
    });

    // 활성 매장 우선 정렬
    result.sort((a, b) => {
      if (a.enabledRules.length !== b.enabledRules.length) return b.enabledRules.length - a.enabledRules.length;
      return b.totalSent - a.totalSent;
    });

    res.json({ stores: result });
  } catch (error) {
    console.error('Admin automation stores error:', error);
    res.status(500).json({ error: '매장별 자동 마케팅 현황 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/admin/automation-trend — 일별 추세 데이터
router.get('/automation-trend', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const [logs, activations] = await Promise.all([
      prisma.automationLog.findMany({
        where: { sentAt: { gte: startDate } },
        select: { sentAt: true, couponUsed: true },
      }),
      prisma.automationRule.findMany({
        where: { enabled: true, updatedAt: { gte: startDate } },
        select: { updatedAt: true },
      }),
    ]);

    // 일별 집계
    const dayMap: Record<string, { sent: number; couponUsed: number; newActivations: number }> = {};

    // 날짜 배열 초기화
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      dayMap[key] = { sent: 0, couponUsed: 0, newActivations: 0 };
    }

    logs.forEach(log => {
      const key = log.sentAt.toISOString().slice(0, 10);
      if (dayMap[key]) {
        dayMap[key].sent++;
        if (log.couponUsed) dayMap[key].couponUsed++;
      }
    });

    activations.forEach(rule => {
      const key = rule.updatedAt.toISOString().slice(0, 10);
      if (dayMap[key]) {
        dayMap[key].newActivations++;
      }
    });

    const trend = Object.entries(dayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));

    res.json({ trend });
  } catch (error) {
    console.error('Admin automation trend error:', error);
    res.status(500).json({ error: '자동 마케팅 추세 조회 중 오류가 발생했습니다.' });
  }
});

export default router;
