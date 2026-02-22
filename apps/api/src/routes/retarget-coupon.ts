import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { customAlphabet } from 'nanoid';
import { calculateCostWithCredits, useCredits } from '../services/credit-service.js';

const router = Router();

const COUPON_COST_PER_MESSAGE = 50; // 건당 50원

// 쿠폰 코드 생성기 (10자리, 헷갈리는 문자 제외)
const generateCouponCode = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 10);

// GET /api/retarget-coupon/settings - 매장 설정 조회
router.get('/settings', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.user?.storeId;
    if (!storeId) {
      return res.status(401).json({ error: '인증이 필요합니다.' });
    }

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: {
        name: true,
        naverPlaceUrl: true,
      },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    res.json({
      storeName: store.name,
      naverPlaceUrl: store.naverPlaceUrl || '',
    });
  } catch (error) {
    console.error('Failed to fetch retarget coupon settings:', error);
    res.status(500).json({ error: '설정을 불러오는데 실패했습니다.' });
  }
});

// GET /api/retarget-coupon/estimate - 비용 예상 (무료 크레딧 포함)
router.get('/estimate', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.user?.storeId;
    if (!storeId) {
      return res.status(401).json({ error: '인증이 필요합니다.' });
    }

    const targetCount = parseInt(req.query.targetCount as string) || 0;

    // 무료 크레딧 적용 계산 (isRetarget = true)
    const creditResult = await calculateCostWithCredits(
      storeId,
      targetCount,
      COUPON_COST_PER_MESSAGE,
      true // 리타겟 쿠폰이므로 무료 크레딧 적용
    );

    // 지갑 잔액 조회
    const wallet = await prisma.wallet.findUnique({
      where: { storeId },
    });

    res.json({
      targetCount,
      costPerMessage: COUPON_COST_PER_MESSAGE,
      totalCost: creditResult.totalCost,
      walletBalance: wallet?.balance || 0,
      canSend: (wallet?.balance || 0) >= creditResult.totalCost,
      freeCredits: {
        remaining: creditResult.remainingCredits,
        freeCount: creditResult.freeCount,
        paidCount: creditResult.paidCount,
      },
    });
  } catch (error) {
    console.error('Failed to estimate retarget coupon cost:', error);
    res.status(500).json({ error: '비용 예상 중 오류가 발생했습니다.' });
  }
});

// POST /api/retarget-coupon/send - 쿠폰 알림톡 발송
router.post('/send', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.user?.storeId;
    if (!storeId) {
      return res.status(401).json({ error: '인증이 필요합니다.' });
    }

    const { customerIds, couponContent, expiryDate, naverPlaceUrl } = req.body;

    if (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0) {
      return res.status(400).json({ error: '발송할 고객을 선택해주세요.' });
    }

    if (!couponContent || !couponContent.trim()) {
      return res.status(400).json({ error: '쿠폰 내용을 입력해주세요.' });
    }

    if (!expiryDate || !expiryDate.trim()) {
      return res.status(400).json({ error: '유효기간을 입력해주세요.' });
    }

    // 매장 정보 조회
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true, naverPlaceUrl: true },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    // 무료 크레딧 적용 비용 계산
    const creditResult = await calculateCostWithCredits(
      storeId,
      customerIds.length,
      COUPON_COST_PER_MESSAGE,
      true // 리타겟 쿠폰이므로 무료 크레딧 적용
    );

    // 지갑 잔액 확인 (유료분만 확인)
    const wallet = await prisma.wallet.findUnique({
      where: { storeId },
    });

    if (creditResult.paidCount > 0 && (!wallet || wallet.balance < creditResult.totalCost)) {
      return res.status(400).json({
        error: `충전금이 부족합니다. 필요: ${creditResult.totalCost.toLocaleString()}원, 잔액: ${(wallet?.balance || 0).toLocaleString()}원`,
      });
    }

    // 고객 정보 조회
    const customers = await prisma.customer.findMany({
      where: {
        id: { in: customerIds },
        storeId,
        phone: { not: null },
      },
      select: {
        id: true,
        phone: true,
      },
    });

    if (customers.length === 0) {
      return res.status(400).json({ error: '발송 가능한 고객이 없습니다.' });
    }

    // 도메인 설정 (환경별)
    const appUrl = process.env.PUBLIC_APP_URL || 'http://localhost:3999';
    const domain = appUrl.replace(/^https?:\/\//, ''); // https:// 제거

    // 알림톡 템플릿 ID
    const templateId = process.env.SOLAPI_TEMPLATE_ID_RETARGET_COUPON;
    if (!templateId) {
      return res.status(500).json({ error: '알림톡 템플릿이 설정되지 않았습니다.' });
    }

    const pfId = process.env.SOLAPI_PF_ID;
    if (!pfId) {
      return res.status(500).json({ error: 'SOLAPI 채널이 설정되지 않았습니다.' });
    }

    // 쿠폰 생성 및 알림톡 큐 등록
    const results = await Promise.all(
      customers.map(async (customer) => {
        const code = generateCouponCode();
        const verifyUrl = `${domain}/coupon/verify/${code}`;

        // 쿠폰 레코드 생성
        await (prisma as any).retargetCoupon.create({
          data: {
            code,
            storeId,
            customerId: customer.id,
            phone: customer.phone!,
            couponContent: couponContent.trim(),
            expiryDate: expiryDate.trim(),
            naverPlaceUrl: naverPlaceUrl || store.naverPlaceUrl || null,
          },
        });

        // 알림톡 큐 등록
        const idempotencyKey = `retarget-coupon-${storeId}-${customer.id}-${Date.now()}`;

        await prisma.alimTalkOutbox.create({
          data: {
            storeId,
            customerId: customer.id,
            phone: customer.phone!,
            messageType: 'RETARGET_COUPON',
            templateId,
            variables: {
              '#{상호}': store.name,
              '#{쿠폰내용}': couponContent.trim(),
              '#{유효기간}': expiryDate.trim(),
              '#{네이버플레이스}': (naverPlaceUrl || store.naverPlaceUrl || '').replace(/^https?:\/\//, ''),
              '#{직원확인}': verifyUrl,
            },
            idempotencyKey,
            status: 'PENDING',
          },
        });

        return { customerId: customer.id, code };
      })
    );

    res.json({
      success: true,
      message: `${results.length}명에게 쿠폰 알림톡 발송이 예약되었습니다.`,
      count: results.length,
    });
  } catch (error) {
    console.error('Failed to send retarget coupon:', error);
    res.status(500).json({ error: '쿠폰 발송에 실패했습니다.' });
  }
});

// GET /api/retarget-coupon/history - 발송 내역 조회
router.get('/history', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.user?.storeId;
    if (!storeId) {
      return res.status(401).json({ error: '인증이 필요합니다.' });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [coupons, total] = await Promise.all([
      (prisma as any).retargetCoupon.findMany({
        where: { storeId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          customer: {
            select: { name: true, phone: true },
          },
        },
      }),
      (prisma as any).retargetCoupon.count({ where: { storeId } }),
    ]);

    res.json({
      coupons,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Failed to fetch coupon history:', error);
    res.status(500).json({ error: '발송 내역을 불러오는데 실패했습니다.' });
  }
});

export default router;
