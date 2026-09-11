import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import {
  computeDailyVisitorReport,
  parseDateRange,
  kstDateStringToDbDate,
  todayKstString,
} from '../services/visitor-stats.js';

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

// GET /api/dashboard/visitor-chart - 일자별 방문자 수 차트 (KST 기준, 직접입력 덮어쓰기 반영)
router.get('/visitor-chart', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    // startDate/endDate 가 오면 사용자 지정 기간, 아니면 기존 days 프리셋
    const range = parseDateRange(req.query.startDate, req.query.endDate);
    const daysParam = parseInt((req.query.days as string) || '7', 10);
    const daysNum = [7, 30, 90, 365].includes(daysParam) ? daysParam : 7;

    const { series, countingMode } = await computeDailyVisitorReport([storeId], range ?? daysNum);

    const chartData = series.map((p) => ({
      date: p.date,
      visitors: p.visitors, // 최종값 (직접입력 반영)
      autoVisitors: p.autoVisitors,
      manualVisitors: p.overridden ? p.visitors : null, // 단일 매장이므로 최종값 == 입력값
    }));

    // 오늘/어제 방문자 수 (KST, 직접입력 반영된 최종값 기준)
    const todayKey = todayKstString();
    const yesterdayKey = new Date(kstDateStringToDbDate(todayKey).getTime() - 86400000)
      .toISOString()
      .slice(0, 10);
    const todayVisitors = series.find((p) => p.date === todayKey)?.visitors || 0;
    const yesterdayVisitors = series.find((p) => p.date === yesterdayKey)?.visitors || 0;

    res.json({
      chartData,
      countingMode, // 'customer_size' = 태그히어 인원 수 입력 매장 (주문 인원 기준)
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

// YYYY-MM-DD 형식 + 실존 날짜 검증 (2026-02-30 같은 롤오버 날짜 차단)
function isValidKstDateString(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const parsed = kstDateStringToDbDate(dateStr);
  return !isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === dateStr;
}

// PUT /api/dashboard/visitor-overrides/:date - 일별 방문객 수 직접입력 (해당 날짜 최종값 덮어쓰기)
router.put('/visitor-overrides/:date', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const dateStr = req.params.date;
    const { visitors } = req.body;

    if (!isValidKstDateString(dateStr)) {
      return res.status(400).json({ error: '올바른 날짜 형식(YYYY-MM-DD)이 아닙니다.' });
    }
    if (dateStr > todayKstString()) {
      return res.status(400).json({ error: '미래 날짜는 입력할 수 없습니다.' });
    }
    if (!Number.isInteger(visitors) || visitors < 0 || visitors > 1_000_000) {
      return res.status(400).json({ error: '방문객 수는 0 이상의 정수여야 합니다.' });
    }

    const date = kstDateStringToDbDate(dateStr);
    const override = await prisma.dailyVisitorOverride.upsert({
      where: { storeId_date: { storeId, date } },
      update: { visitors },
      create: { storeId, date, visitors },
    });

    res.json({ date: dateStr, visitors: override.visitors });
  } catch (error) {
    console.error('Visitor override upsert error:', error);
    res.status(500).json({ error: '방문객 수 저장 중 오류가 발생했습니다.' });
  }
});

// DELETE /api/dashboard/visitor-overrides/:date - 직접입력 삭제 (자동 집계값으로 복귀)
router.delete('/visitor-overrides/:date', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const dateStr = req.params.date;

    if (!isValidKstDateString(dateStr)) {
      return res.status(400).json({ error: '올바른 날짜 형식(YYYY-MM-DD)이 아닙니다.' });
    }

    await prisma.dailyVisitorOverride.deleteMany({
      where: { storeId, date: kstDateStringToDbDate(dateStr) },
    });

    res.json({ date: dateStr, deleted: true });
  } catch (error) {
    console.error('Visitor override delete error:', error);
    res.status(500).json({ error: '방문객 수 삭제 중 오류가 발생했습니다.' });
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

    // 이름 마스킹 함수: "홍길동" → "홍*동", "김원" → "김*원", "정" → "정"
    const maskName = (name: string | null): string => {
      if (!name) return '익명';
      if (name.length <= 1) return name;
      if (name.length === 2) return name[0] + '*';
      // 3글자 이상: 첫 글자 + 가운데 마스킹 + 마지막 글자
      return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1];
    };

    // 통계 + 3점 미만 수 + 텍스트 긴 피드백 2건을 병렬 조회 (전체 row 로드 방지)
    const [feedbackStats, lowRatingCount, topTextFeedbacks] = await Promise.all([
      prisma.customerFeedback.aggregate({
        where: {
          customer: { storeId },
        },
        _avg: { rating: true },
        _count: { id: true },
      }),
      prisma.customerFeedback.count({
        where: {
          customer: { storeId },
          rating: { lt: 3 },
        },
      }),
      // 텍스트 길이순 상위 2건만 DB에서 정렬해서 조회
      prisma.$queryRaw<
        { id: string; rating: number; text: string | null; createdAt: Date; name: string | null }[]
      >`
        SELECT f.id, f.rating, f.text, f."createdAt", c.name
        FROM customer_feedbacks f
        JOIN customers c ON c.id = f."customerId"
        WHERE c."storeId" = ${storeId}
          AND f.text IS NOT NULL
          AND length(f.text) > 0
        ORDER BY length(f.text) DESC
        LIMIT 2
      `,
    ]);

    const averageRating = feedbackStats._avg.rating
      ? Math.round(feedbackStats._avg.rating * 10) / 10
      : 0;
    const totalFeedbackCount = feedbackStats._count.id;

    let feedbacks = topTextFeedbacks.map((f) => ({
      id: f.id,
      rating: f.rating,
      text: f.text,
      createdAt: f.createdAt.toISOString(),
      customerName: maskName(f.name),
    }));

    // 텍스트가 있는 피드백이 2개 미만이면 최근 피드백으로 보충
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
          customerName: maskName(f.customer.name),
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

// GET /api/dashboard/feedbacks - 고객 피드백 전체 리스트
router.get('/feedbacks', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { limit = '20', offset = '0', rating, hasText } = req.query;

    const limitNum = Math.min(parseInt(limit as string) || 20, 100);
    const offsetNum = parseInt(offset as string) || 0;

    // 이름 마스킹 함수
    const maskName = (name: string | null): string => {
      if (!name) return '익명';
      if (name.length <= 1) return name;
      if (name.length === 2) return name[0] + '*';
      return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1];
    };

    // 필터 조건 설정
    const whereClause: any = {
      customer: { storeId },
    };

    // 별점 필터 (rating 파라미터가 있으면 적용)
    if (rating) {
      const ratingNum = parseInt(rating as string);
      if (ratingNum >= 1 && ratingNum <= 5) {
        whereClause.rating = ratingNum;
      }
    }

    // 텍스트 있는 리뷰만 필터 (hasText=true 파라미터가 있으면 적용)
    if (hasText === 'true') {
      whereClause.text = {
        not: null,
      };
      whereClause.NOT = {
        text: '',
      };
    }

    // 전체 개수 조회
    const total = await prisma.customerFeedback.count({
      where: whereClause,
    });

    // 피드백 목록 조회
    const feedbacks = await prisma.customerFeedback.findMany({
      where: whereClause,
      include: {
        customer: {
          select: { name: true, phone: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limitNum,
      skip: offsetNum,
    });

    const formattedFeedbacks = feedbacks.map((f) => ({
      id: f.id,
      rating: f.rating,
      text: f.text,
      createdAt: f.createdAt.toISOString(),
      customerName: maskName(f.customer.name),
      customerPhone: f.customer.phone
        ? f.customer.phone.replace(/(\d{4})[-]?(\d{4})$/, '****-$2')
        : null,
    }));

    res.json({
      feedbacks: formattedFeedbacks,
      total,
      hasMore: offsetNum + feedbacks.length < total,
    });
  } catch (error) {
    console.error('Feedbacks list error:', error);
    res.status(500).json({ error: '피드백 목록 조회 중 오류가 발생했습니다.' });
  }
});

export default router;
