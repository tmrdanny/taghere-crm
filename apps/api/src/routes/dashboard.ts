import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

// GET /api/dashboard/summary
router.get('/summary', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const now = new Date();

    // Calculate date ranges
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);

    // Calculate last week's date range
    const startOfLastWeek = new Date(now);
    startOfLastWeek.setDate(now.getDate() - 14);
    const endOfLastWeek = new Date(now);
    endOfLastWeek.setDate(now.getDate() - 7);

    // Get customer stats
    const [
      totalCustomers,
      lastMonthCustomers,
      newCustomersThisWeek,
      newCustomersLastWeek,
      wallet,
      reviewLogsThisMonth,
      reviewLogsLastMonth,
    ] = await Promise.all([
      prisma.customer.count({ where: { storeId } }),
      prisma.customer.count({
        where: {
          storeId,
          createdAt: { lt: startOfMonth },
        },
      }),
      prisma.customer.count({
        where: {
          storeId,
          createdAt: { gte: startOfWeek },
        },
      }),
      prisma.customer.count({
        where: {
          storeId,
          createdAt: { gte: startOfLastWeek, lt: endOfLastWeek },
        },
      }),
      prisma.wallet.findUnique({ where: { storeId } }),
      prisma.reviewRequestLog.count({
        where: {
          storeId,
          status: 'SENT',
          createdAt: { gte: startOfMonth },
        },
      }),
      prisma.reviewRequestLog.count({
        where: {
          storeId,
          status: 'SENT',
          createdAt: {
            gte: startOfLastMonth,
            lt: startOfMonth,
          },
        },
      }),
    ]);

    // Calculate growth percentages
    const customerGrowth = lastMonthCustomers > 0
      ? Math.round(((totalCustomers - lastMonthCustomers) / lastMonthCustomers) * 100)
      : 0;

    const reviewGrowth = reviewLogsLastMonth > 0
      ? Math.round(((reviewLogsThisMonth - reviewLogsLastMonth) / reviewLogsLastMonth) * 100)
      : 0;

    // Calculate new customers growth (this week vs last week)
    const newCustomersGrowth = newCustomersLastWeek > 0
      ? Math.round(((newCustomersThisWeek - newCustomersLastWeek) / newCustomersLastWeek) * 100)
      : 0;

    // Get marketing consent count
    const marketingConsentCount = await prisma.customer.count({
      where: {
        storeId,
        consentMarketing: true,
      },
    });

    res.json({
      totalCustomers,
      customerGrowth,
      newCustomers: newCustomersThisWeek,
      newCustomersGrowth,
      marketingConsentCount,
      reviewBalance: wallet?.balance || 0,
      monthlyReviews: reviewLogsThisMonth,
      reviewGrowth,
    });
  } catch (error) {
    console.error('Dashboard summary error:', error);
    res.status(500).json({ error: '대시보드 요약 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/dashboard/review-chart
router.get('/review-chart', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { days = '30' } = req.query;

    const daysNum = parseInt(days as string);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum);

    const reviewLogs = await prisma.reviewRequestLog.findMany({
      where: {
        storeId,
        status: 'SENT',
        createdAt: { gte: startDate },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by day and calculate cumulative
    const dailyData: { [key: string]: number } = {};
    let cumulative = 0;

    for (let i = 0; i <= daysNum; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const key = date.toISOString().split('T')[0];
      dailyData[key] = 0;
    }

    reviewLogs.forEach((log) => {
      const key = log.createdAt.toISOString().split('T')[0];
      if (dailyData[key] !== undefined) {
        dailyData[key]++;
      }
    });

    const chartData = Object.entries(dailyData).map(([date, count]) => {
      cumulative += count;
      return {
        date,
        day: `${new Date(date).getDate()}일`,
        reviews: cumulative,
      };
    });

    res.json({ chartData });
  } catch (error) {
    console.error('Review chart error:', error);
    res.status(500).json({ error: '리뷰 차트 데이터 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/dashboard/visitor-chart - 일자별 방문자 수 차트
router.get('/visitor-chart', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { days = '7' } = req.query;

    const daysNum = parseInt(days as string);
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - daysNum + 1);

    // 날짜별 데이터 초기화
    const dailyData: { [key: string]: number } = {};
    for (let i = 0; i < daysNum; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const key = date.toISOString().split('T')[0];
      dailyData[key] = 0;
    }

    // 포인트 적립 (EARN) 기록으로 방문 수 계산
    // visitCount가 증가하거나, 포인트가 적립된 날짜 기준
    const pointLedgers = await prisma.pointLedger.findMany({
      where: {
        storeId,
        type: 'EARN',
        createdAt: { gte: startDate },
      },
      select: {
        createdAt: true,
        customerId: true,
      },
    });

    // 날짜별로 유니크한 고객 수 계산 (같은 날 같은 고객은 1회로)
    const dailyVisitors: { [key: string]: Set<string> } = {};
    for (const key of Object.keys(dailyData)) {
      dailyVisitors[key] = new Set();
    }

    pointLedgers.forEach((ledger) => {
      const key = ledger.createdAt.toISOString().split('T')[0];
      if (dailyVisitors[key]) {
        dailyVisitors[key].add(ledger.customerId);
      }
    });

    // 신규 고객 등록도 방문으로 카운트 (포인트 적립과 별개로)
    const newCustomers = await prisma.customer.findMany({
      where: {
        storeId,
        createdAt: { gte: startDate },
      },
      select: {
        id: true,
        createdAt: true,
      },
    });

    newCustomers.forEach((customer) => {
      const key = customer.createdAt.toISOString().split('T')[0];
      if (dailyVisitors[key]) {
        dailyVisitors[key].add(customer.id);
      }
    });

    // Set을 숫자로 변환
    for (const key of Object.keys(dailyData)) {
      dailyData[key] = dailyVisitors[key].size;
    }

    const chartData = Object.entries(dailyData).map(([date, visitors]) => ({
      date,
      visitors,
    }));

    // 오늘 방문자 수
    const todayKey = new Date().toISOString().split('T')[0];
    const todayVisitors = dailyData[todayKey] || 0;

    // 어제 방문자 수
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = yesterday.toISOString().split('T')[0];
    const yesterdayVisitors = dailyData[yesterdayKey] || 0;

    res.json({
      chartData,
      todayVisitors,
      yesterdayVisitors,
      growth: yesterdayVisitors > 0
        ? Math.round(((todayVisitors - yesterdayVisitors) / yesterdayVisitors) * 100)
        : (todayVisitors > 0 ? 100 : 0),
    });
  } catch (error) {
    console.error('Visitor chart error:', error);
    res.status(500).json({ error: '방문자 차트 데이터 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/dashboard/announcements - 활성화된 공지사항 조회 (매장 사용자용)
router.get('/announcements', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const now = new Date();

    const announcements = await prisma.announcement.findMany({
      where: {
        isActive: true,
        OR: [
          { startAt: null },
          { startAt: { lte: now } },
        ],
        AND: [
          {
            OR: [
              { endAt: null },
              { endAt: { gte: now } },
            ],
          },
        ],
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
      select: {
        id: true,
        title: true,
        content: true,
        priority: true,
        createdAt: true,
      },
    });

    res.json(announcements);
  } catch (error) {
    console.error('Announcements error:', error);
    res.status(500).json({ error: '공지사항 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/dashboard/feedback-summary - 고객 피드백 평점 및 리뷰 요약
router.get('/feedback-summary', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;

    // 전체 피드백 통계 조회
    const feedbackStats = await prisma.customerFeedback.aggregate({
      where: {
        customer: { storeId },
      },
      _avg: { rating: true },
      _count: { id: true },
    });

    const averageRating = feedbackStats._avg.rating
      ? Math.round(feedbackStats._avg.rating * 10) / 10
      : 0;
    const totalFeedbackCount = feedbackStats._count.id;

    // 3점 미만 피드백 수
    const lowRatingCount = await prisma.customerFeedback.count({
      where: {
        customer: { storeId },
        rating: { lt: 3 },
      },
    });

    // 3점 미만 피드백 조회 (최신순, 최대 2개)
    const lowRatingFeedbacks = await prisma.customerFeedback.findMany({
      where: {
        customer: { storeId },
        rating: { lt: 3 },
      },
      orderBy: { createdAt: 'desc' },
      take: 2,
      include: {
        customer: {
          select: { name: true },
        },
      },
    });

    // 3점 미만 피드백이 2개 미만이면 최근 피드백으로 보충
    let feedbacks = lowRatingFeedbacks.map((f) => ({
      id: f.id,
      rating: f.rating,
      text: f.text,
      createdAt: f.createdAt.toISOString(),
      customerName: f.customer.name,
    }));

    if (feedbacks.length < 2) {
      const existingIds = feedbacks.map((f) => f.id);
      const recentFeedbacks = await prisma.customerFeedback.findMany({
        where: {
          customer: { storeId },
          id: { notIn: existingIds },
        },
        orderBy: { createdAt: 'desc' },
        take: 2 - feedbacks.length,
        include: {
          customer: {
            select: { name: true },
          },
        },
      });

      feedbacks = [
        ...feedbacks,
        ...recentFeedbacks.map((f) => ({
          id: f.id,
          rating: f.rating,
          text: f.text,
          createdAt: f.createdAt.toISOString(),
          customerName: f.customer.name,
        })),
      ];
    }

    res.json({
      averageRating,
      totalFeedbackCount,
      lowRatingCount,
      feedbacks,
    });
  } catch (error) {
    console.error('Feedback summary error:', error);
    res.status(500).json({ error: '피드백 요약 조회 중 오류가 발생했습니다.' });
  }
});

export default router;
