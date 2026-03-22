import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { enqueueAlimTalk } from '../services/solapi.js';
import { getPlaceRankByKeyword } from '../services/naver-place-rank.js';

const router = Router();

// 건당 비용
const TRAFFIC_BOOST_COST = 150;

// 허용 발송 수량
const ALLOWED_SEND_COUNTS = [1000, 2000, 3000, 5000, 10000];

// 주간 최대 요청 횟수
const WEEKLY_LIMIT = 2;

// ============================================
// 어드민 인증 미들웨어 (admin.ts와 동일 패턴)
// ============================================

interface AdminRequest extends Request {
  isAdmin?: boolean;
}

const adminAuthMiddleware = (req: AdminRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '인증이 필요합니다.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { isSystemAdmin: boolean };

    if (!decoded.isSystemAdmin) {
      return res.status(403).json({ error: '어드민 권한이 필요합니다.' });
    }

    req.isAdmin = true;
    next();
  } catch (error) {
    return res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
  }
};

// ============================================
// 지역 필터 조건 빌드 헬퍼 (local-customers.ts와 동일 패턴)
// ============================================

function buildExternalRegionOrConditions(regionFilters: Array<{ sido: string; sigungu?: string }>) {
  return regionFilters.map((r) => {
    if (r.sido === '미지정') {
      return { regionSido: '' };
    }
    if (r.sigungu) {
      return { regionSido: r.sido, regionSigungu: r.sigungu };
    }
    return { regionSido: r.sido };
  });
}

function buildCustomerRegionOrConditions(regionFilters: Array<{ sido: string; sigungu?: string }>) {
  return regionFilters.map((r) => {
    if (r.sido === '미지정') {
      return { OR: [{ regionSido: null }, { regionSido: '' }] } as any;
    }
    if (r.sigungu) {
      return { regionSido: r.sido, regionSigungu: r.sigungu };
    }
    return { regionSido: r.sido };
  });
}

// ============================================
// 이번 주 월요일 0시 (KST) 계산
// ============================================
function getThisWeekMondayKST(): Date {
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstNow = new Date(now.getTime() + kstOffset);

  const dayOfWeek = kstNow.getUTCDay(); // 0=Sun, 1=Mon, ...
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const monday = new Date(kstNow);
  monday.setUTCDate(monday.getUTCDate() - diffToMonday);
  monday.setUTCHours(0, 0, 0, 0);

  // Convert back to UTC
  return new Date(monday.getTime() - kstOffset);
}

// ============================================
// Store Owner Endpoints (authMiddleware)
// ============================================

// GET /api/traffic-boost/weekly-usage - 이번 주 사용 횟수 조회
router.get('/weekly-usage', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.user!.storeId;
    const weekStart = getThisWeekMondayKST();

    const count = await prisma.trafficBoostRequest.count({
      where: {
        storeId,
        status: { in: ['PENDING', 'SENDING', 'COMPLETED'] },
        createdAt: { gte: weekStart },
      },
    });

    res.json({ weeklyUsage: count, weeklyLimit: WEEKLY_LIMIT });
  } catch (error) {
    console.error('[TrafficBoost] Weekly usage error:', error);
    res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/traffic-boost/requests - 매장 요청 목록 조회
router.get('/requests', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.user!.storeId;

    const requests = await prisma.trafficBoostRequest.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ requests });
  } catch (error) {
    console.error('[TrafficBoost] List requests error:', error);
    res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/traffic-boost/rank-check - 키워드 순위 조회
// 사장님이 직접 네이버 플레이스 URL과 키워드를 입력하여 조회
router.get('/rank-check', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { keyword, naverPlaceUrl } = req.query;

    if (!keyword || typeof keyword !== 'string') {
      return res.status(400).json({ error: '키워드를 입력해주세요.' });
    }

    if (!naverPlaceUrl || typeof naverPlaceUrl !== 'string') {
      return res.status(400).json({ error: '네이버 플레이스 URL을 입력해주세요.' });
    }

    const result = await getPlaceRankByKeyword(naverPlaceUrl, keyword);

    res.json({
      keyword,
      naverPlaceUrl,
      rank: result.rank,
      totalResults: result.totalResults,
      message: result.rank
        ? `현재 "${keyword}" 검색 ${result.rank}위`
        : `"${keyword}" 검색 결과에서 순위권 밖입니다.`,
    });
  } catch (error) {
    console.error('[TrafficBoost] Rank check error:', error);
    res.status(500).json({ error: '순위 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/traffic-boost/request - 새 요청 제출
router.post('/request', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.user!.storeId;
    const { keyword, couponContent, expiryDate, regionSidos, regionSigungus, sendCount } = req.body;

    // Validation
    if (!keyword?.trim()) return res.status(400).json({ error: '키워드를 입력해주세요.' });
    if (!couponContent?.trim()) return res.status(400).json({ error: '쿠폰 내용을 입력해주세요.' });
    if (!expiryDate?.trim()) return res.status(400).json({ error: '유효기간을 입력해주세요.' });
    if (!regionSidos || !Array.isArray(regionSidos) || regionSidos.length === 0) {
      return res.status(400).json({ error: '지역을 선택해주세요.' });
    }
    if (!sendCount || !ALLOWED_SEND_COUNTS.includes(sendCount)) {
      return res.status(400).json({
        error: `발송 수량은 ${ALLOWED_SEND_COUNTS.join(', ')} 중에서 선택해주세요.`,
      });
    }

    // 주간 제한 확인
    const weekStart = getThisWeekMondayKST();
    const weeklyCount = await prisma.trafficBoostRequest.count({
      where: {
        storeId,
        status: { in: ['PENDING', 'SENDING', 'COMPLETED'] },
        createdAt: { gte: weekStart },
      },
    });

    if (weeklyCount >= WEEKLY_LIMIT) {
      return res.status(400).json({
        error: `주간 요청 한도(${WEEKLY_LIMIT}회)를 초과했습니다.`,
        weeklyUsage: weeklyCount,
        weeklyLimit: WEEKLY_LIMIT,
      });
    }

    // 비용 계산 및 잔액 확인
    const totalCost = sendCount * TRAFFIC_BOOST_COST;
    const wallet = await prisma.wallet.findUnique({ where: { storeId } });

    if (!wallet || wallet.balance < totalCost) {
      return res.status(400).json({
        error: '잔액이 부족합니다.',
        walletBalance: wallet?.balance || 0,
        requiredAmount: totalCost,
      });
    }

    // 잔액 차감 + 요청 생성 (트랜잭션)
    const [request] = await prisma.$transaction([
      prisma.trafficBoostRequest.create({
        data: {
          storeId,
          keyword: keyword.trim(),
          couponContent: couponContent.trim(),
          expiryDate: expiryDate.trim(),
          regionSidos: regionSidos as any,
          regionSigungus: regionSigungus ? (regionSigungus as any) : undefined,
          sendCount,
          totalCost,
          status: 'PENDING',
        },
      }),
      prisma.wallet.update({
        where: { storeId },
        data: { balance: { decrement: totalCost } },
      }),
    ]);

    res.json({
      success: true,
      request,
      deductedAmount: totalCost,
    });
  } catch (error) {
    console.error('[TrafficBoost] Create request error:', error);
    res.status(500).json({ error: '요청 생성 중 오류가 발생했습니다.' });
  }
});

// ============================================
// Admin Endpoints (adminAuthMiddleware)
// ============================================

// GET /api/traffic-boost/admin/requests - 전체 요청 목록 (어드민)
router.get('/admin/requests', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const requests = await prisma.trafficBoostRequest.findMany({
      include: {
        store: {
          select: { name: true, slug: true, naverPlaceUrl: true },
        },
      },
      orderBy: [
        { status: 'asc' }, // PENDING first
        { createdAt: 'desc' },
      ],
    });

    res.json({ requests });
  } catch (error) {
    console.error('[TrafficBoost] Admin list error:', error);
    res.status(500).json({ error: '조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/traffic-boost/admin/:id/send - 발송 실행 (어드민)
router.post('/admin/:id/send', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;

    const request = await prisma.trafficBoostRequest.findUnique({
      where: { id },
      include: {
        store: {
          select: { name: true, slug: true, naverPlaceUrl: true },
        },
      },
    });

    if (!request) {
      return res.status(404).json({ error: '요청을 찾을 수 없습니다.' });
    }

    if (request.status !== 'PENDING') {
      return res.status(400).json({ error: '이미 처리된 요청입니다.' });
    }

    // Update status to SENDING
    await prisma.trafficBoostRequest.update({
      where: { id },
      data: { status: 'SENDING' },
    });

    // Build region filters from stored data
    const regionSidos = request.regionSidos as unknown as string[];
    const regionSigungus = request.regionSigungus as unknown as string[] | null;

    const regionFilters: Array<{ sido: string; sigungu?: string }> = [];

    if (regionSigungus && regionSigungus.length > 0) {
      // If sigungus are provided, pair them with sidos
      for (const sido of regionSidos) {
        const matchingSigungus = regionSigungus.filter((s) => s); // filter empty
        if (matchingSigungus.length > 0) {
          for (const sigungu of matchingSigungus) {
            regionFilters.push({ sido, sigungu });
          }
        } else {
          regionFilters.push({ sido });
        }
      }
    } else {
      for (const sido of regionSidos) {
        regionFilters.push({ sido });
      }
    }

    // 1. ExternalCustomer 조회
    const regionOrConditions = buildExternalRegionOrConditions(regionFilters);
    const externalWhere: any = {
      AND: [{ OR: regionOrConditions }],
      consentMarketing: true,
    };

    const externalCustomers = await prisma.externalCustomer.findMany({
      where: externalWhere,
      select: { id: true, phone: true },
    });

    // 2. Customer 조회
    const customerRegionOrConditions = buildCustomerRegionOrConditions(regionFilters);
    const customerWhere: any = {
      OR: customerRegionOrConditions,
      consentMarketing: true,
      phone: { not: null },
    };

    const customerResult = await prisma.customer.findMany({
      where: customerWhere,
      select: { id: true, phone: true },
    });

    // 3. 통합 고객 목록
    const allCustomers: Array<{ id: string; phone: string; source: 'external' | 'customer' }> = [
      ...externalCustomers.map((c) => ({ id: c.id, phone: c.phone, source: 'external' as const })),
      ...customerResult.filter((c) => c.phone).map((c) => ({ id: c.id, phone: c.phone!, source: 'customer' as const })),
    ];

    // 4. 랜덤 선택
    const shuffled = allCustomers.sort(() => Math.random() - 0.5);
    const selectedCustomers = shuffled.slice(0, request.sendCount);

    // 5. 알림톡 템플릿 설정
    const templateId = process.env.SOLAPI_TEMPLATE_ID_TRAFFIC_BOOST;
    if (!templateId) {
      await prisma.trafficBoostRequest.update({
        where: { id },
        data: { status: 'FAILED', failReason: '알림톡 템플릿이 설정되지 않았습니다.' },
      });
      return res.status(500).json({ error: '알림톡 템플릿이 설정되지 않았습니다.' });
    }

    // 6. 발송
    let sentCount = 0;
    let failedCount = 0;
    const searchUrl = `https://search.naver.com/search.naver?query=${encodeURIComponent(request.keyword)}`;

    for (const customer of selectedCustomers) {
      try {
        const idempotencyKey = `traffic-boost-${id}-${customer.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        // 지역은 시/도 단위 (서울, 경기 등)
        const regionLabel = (request.regionSidos as unknown as string[]).join(', ');

        await enqueueAlimTalk({
          storeId: request.storeId,
          customerId: customer.source === 'customer' ? customer.id : undefined,
          phone: customer.phone,
          messageType: 'TRAFFIC_BOOST',
          templateId,
          variables: {
            '#{지역}': regionLabel,
            '#{쿠폰내용}': request.couponContent,
            '#{쿠폰}': request.couponContent,
            '#{유효기간}': request.expiryDate,
          },
          idempotencyKey,
        });

        sentCount++;
      } catch (err: any) {
        console.error(`[TrafficBoost] Send error for ${customer.phone}:`, err.message);
        failedCount++;
      }
    }

    // 7. 실패 분 환불
    if (failedCount > 0) {
      const refundAmount = failedCount * TRAFFIC_BOOST_COST;
      await prisma.wallet.update({
        where: { storeId: request.storeId },
        data: { balance: { increment: refundAmount } },
      });
    }

    // 8. 요청 상태 업데이트
    await prisma.trafficBoostRequest.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        sentCount,
        failedCount,
        processedAt: new Date(),
      },
    });

    res.json({
      success: true,
      sentCount,
      failedCount,
      refundedAmount: failedCount * TRAFFIC_BOOST_COST,
    });
  } catch (error) {
    console.error('[TrafficBoost] Admin send error:', error);
    res.status(500).json({ error: '발송 중 오류가 발생했습니다.' });
  }
});

// POST /api/traffic-boost/admin/:id/reject - 요청 거부 및 환불 (어드민)
router.post('/admin/:id/reject', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const request = await prisma.trafficBoostRequest.findUnique({
      where: { id },
    });

    if (!request) {
      return res.status(404).json({ error: '요청을 찾을 수 없습니다.' });
    }

    if (request.status !== 'PENDING') {
      return res.status(400).json({ error: '이미 처리된 요청입니다.' });
    }

    // 환불 + 상태 업데이트 (트랜잭션)
    await prisma.$transaction([
      prisma.trafficBoostRequest.update({
        where: { id },
        data: {
          status: 'REJECTED',
          failReason: reason || '관리자에 의해 거부되었습니다.',
          processedAt: new Date(),
        },
      }),
      prisma.wallet.update({
        where: { storeId: request.storeId },
        data: { balance: { increment: request.totalCost } },
      }),
    ]);

    res.json({
      success: true,
      refundedAmount: request.totalCost,
    });
  } catch (error) {
    console.error('[TrafficBoost] Admin reject error:', error);
    res.status(500).json({ error: '거부 처리 중 오류가 발생했습니다.' });
  }
});

export default router;
