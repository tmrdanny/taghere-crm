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

export default router;
