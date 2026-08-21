import { env } from '../config/env.js';
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { enqueueAlimTalk } from '../services/solapi.js';
import {
  LocalCampaignScope,
  buildExternalRegionOrConditions,
  buildCustomerRegionOrConditions,
  getRegions,
  getTotalCustomerCount,
  getRegionCounts,
  getFilteredCount,
  getSmsEstimate,
  sendCampaignSms,
  sendTestSms,
  getKakaoSendAvailable,
  getKakaoEstimate,
  sendKakaoBrandMessage,
  getCampaigns,
} from '../services/local-campaign.js';
import { customAlphabet } from 'nanoid';

const router = Router();

// 쿠폰 알림톡 비용 (건당)
const COUPON_ALIMTALK_COST = 150;

// 쿠폰 코드 생성기 (10자리, 헷갈리는 문자 제외)
const generateCouponCode = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 10);

// 매장 스코프 (Wallet / storeId 캠페인 귀속)
function storeScope(req: AuthRequest): LocalCampaignScope {
  return { kind: 'store', storeId: req.user!.storeId };
}

// GET /api/local-customers/regions - 지역 목록 조회 (ExternalCustomer 기반)
router.get('/regions', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await getRegions(req.query);
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Regions fetch error:', error);
    res.status(500).json({ error: '지역 목록 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/local-customers/total-count - 전체 고객 수 조회 (ExternalCustomer + 전체 CRM 고객)
router.get('/total-count', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await getTotalCustomerCount();
    res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Total count fetch error:', error);
    res.status(500).json({ error: '전체 고객 수 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/local-customers/region-counts - 지역별 고객 수 조회
router.get('/region-counts', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await getRegionCounts(storeScope(req));
    res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Region counts fetch error:', error);
    res.status(500).json({ error: '지역별 고객 수 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/local-customers/count - 조건에 맞는 고객 수 조회 (ExternalCustomer + Customer 통합)
router.get('/count', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await getFilteredCount(storeScope(req), req.query);
    res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Count fetch error:', error);
    res.status(500).json({ error: '고객 수 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/local-customers/estimate - 비용 예상
router.get('/estimate', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await getSmsEstimate(storeScope(req), req.query);
    res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Estimate error:', error);
    res.status(500).json({ error: '비용 예상 중 오류가 발생했습니다.' });
  }
});

// POST /api/local-customers/send - 메시지 발송 (다중 지역 지원)
router.post('/send', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await sendCampaignSms(storeScope(req), req.body);
    res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Send error:', error);
    res.status(500).json({ error: '메시지 발송 중 오류가 발생했습니다.' });
  }
});

// POST /api/local-customers/test - 테스트 발송
router.post('/test', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await sendTestSms(req.body);
    res.status(result.status).json(result.body);
  } catch (error: any) {
    console.error('Test send error:', error);
    res.status(500).json({ error: error.message || '테스트 발송 중 오류가 발생했습니다.' });
  }
});

// GET /api/local-customers/kakao/send-available - 카카오톡 발송 가능 시간 확인
router.get('/kakao/send-available', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = getKakaoSendAvailable();
    res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Send available check error:', error);
    res.status(500).json({ error: '발송 가능 시간 확인 중 오류가 발생했습니다.' });
  }
});

// GET /api/local-customers/kakao/estimate - 카카오톡 비용 예상
router.get('/kakao/estimate', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await getKakaoEstimate(storeScope(req), req.query);
    res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Kakao estimate error:', error);
    res.status(500).json({ error: '비용 예상 중 오류가 발생했습니다.' });
  }
});

// POST /api/local-customers/kakao/send - 카카오톡 브랜드 메시지 발송 (외부 고객)
router.post('/kakao/send', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await sendKakaoBrandMessage(storeScope(req), req.body);
    res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Kakao send error:', error);
    res.status(500).json({ error: '카카오톡 발송 중 오류가 발생했습니다.' });
  }
});

// POST /api/local-customers/coupon-alimtalk/send - 쿠폰 알림톡 발송
router.post('/coupon-alimtalk/send', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { regions, sendCount, couponContent, expiryDate, ageGroups, gender, categories } = req.body;

    // Validation
    if (!regions || regions.length === 0) return res.status(400).json({ error: '지역을 선택해주세요.' });
    if (!couponContent?.trim()) return res.status(400).json({ error: '쿠폰 내용을 입력해주세요.' });
    if (!expiryDate?.trim()) return res.status(400).json({ error: '유효기간을 입력해주세요.' });
    if (!sendCount || sendCount <= 0) return res.status(400).json({ error: '발송 수량을 입력해주세요.' });

    const totalCost = sendCount * COUPON_ALIMTALK_COST;

    // Check wallet
    const wallet = await prisma.wallet.findUnique({ where: { storeId } });
    if (!wallet || wallet.balance < totalCost) {
      return res.status(400).json({ error: '잔액이 부족합니다.', walletBalance: wallet?.balance || 0, requiredAmount: totalCost });
    }

    // Get store info
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true, slug: true, naverPlaceUrl: true },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    // Build region filters
    const regionFilters: Array<{ sido: string; sigungu?: string }> = regions;

    // 1. ExternalCustomer 조회
    const regionOrConditions = buildExternalRegionOrConditions(regionFilters);

    // categories가 있으면 AND로 지역+카테고리 결합 (OR 덮어쓰기 방지)
    const externalWhere: any = {
      AND: [
        { OR: regionOrConditions },
        ...(categories && categories.length > 0
          ? [{ OR: categories.map((cat: string) => ({ preferredCategories: { contains: cat } })) }]
          : []),
      ],
      consentMarketing: true,
    };

    if (ageGroups && ageGroups.length > 0) {
      externalWhere.ageGroup = { in: ageGroups };
    }
    if (gender && gender !== 'all') {
      externalWhere.gender = gender;
    }

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
    if (ageGroups && ageGroups.length > 0) {
      customerWhere.ageGroup = { in: ageGroups };
    }
    if (gender && gender !== 'all') {
      customerWhere.gender = gender;
    }

    const customerResult = await prisma.customer.findMany({
      where: customerWhere,
      select: { id: true, phone: true },
    });

    // 3. 통합 고객 목록
    const allCustomers: Array<{ id: string; phone: string; source: 'external' | 'customer' }> = [
      ...externalCustomers.map((c) => ({ id: c.id, phone: c.phone, source: 'external' as const })),
      ...customerResult.filter((c) => c.phone).map((c) => ({ id: c.id, phone: c.phone!, source: 'customer' as const })),
    ];

    if (sendCount > allCustomers.length) {
      return res.status(400).json({
        error: `발송 가능한 고객이 ${allCustomers.length}명입니다.`,
        availableCount: allCustomers.length,
      });
    }

    const selectedCustomers = allCustomers.slice(0, sendCount);

    // Get template ID from env
    const templateId = env.SOLAPI_TEMPLATE_ID_RETARGET_COUPON;
    if (!templateId) return res.status(500).json({ error: '알림톡 템플릿이 설정되지 않았습니다.' });

    const pfId = env.SOLAPI_PF_ID;
    if (!pfId) return res.status(500).json({ error: 'SOLAPI 채널이 설정되지 않았습니다.' });

    // 도메인 설정 (환경별)
    const appUrl = env.PUBLIC_APP_URL || 'http://localhost:3999';
    const domain = appUrl.replace(/^https?:\/\//, '');

    // For each customer phone, create coupon + AlimTalkOutbox record
    let sentCount = 0;
    let failedCount = 0;

    for (const customer of selectedCustomers) {
      try {
        const code = generateCouponCode();
        const verifyUrl = `${domain}/coupon/verify/${code}`;

        // 쿠폰 레코드 생성
        await (prisma as any).retargetCoupon.create({
          data: {
            code,
            storeId,
            customerId: customer.source === 'customer' ? customer.id : null,
            phone: customer.phone,
            couponContent: couponContent.trim(),
            expiryDate: expiryDate.trim(),
            naverPlaceUrl: store.naverPlaceUrl || null,
          },
        });

        // 알림톡 큐 등록
        const idempotencyKey = `local-coupon-${storeId}-${customer.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        await enqueueAlimTalk({
          storeId,
          customerId: customer.source === 'customer' ? customer.id : undefined,
          phone: customer.phone,
          messageType: 'LOCAL_COUPON',
          templateId,
          variables: {
            '#{상호}': store.name,
            '#{쿠폰내용}': couponContent.trim(),
            '#{유효기간}': expiryDate.trim(),
            '#{네이버플레이스}': (store.naverPlaceUrl || '').replace(/^https?:\/\//, ''),
            '#{직원확인}': verifyUrl,
          },
          idempotencyKey,
        });

        sentCount++;
      } catch (err: any) {
        console.error(`[CouponAlimTalk] Send error for ${customer.phone}:`, err.message);
        failedCount++;
      }
    }

    // Deduct wallet (only for successfully enqueued)
    const actualCost = sentCount * COUPON_ALIMTALK_COST;
    if (actualCost > 0) {
      await prisma.wallet.update({
        where: { storeId },
        data: { balance: { decrement: actualCost } },
      });
    }

    // Create campaign record for tracking
    const regionSidoList = [...new Set(regionFilters.map((r) => r.sido))];
    const regionSigunguList = regionFilters.filter((r) => r.sigungu).map((r) => r.sigungu);

    await prisma.externalSmsCampaign.create({
      data: {
        storeId,
        title: `쿠폰 알림톡 - ${new Date().toLocaleDateString('ko-KR')}`,
        content: `쿠폰: ${couponContent.trim()} / 유효기간: ${expiryDate.trim()}`,
        filterAgeGroups: JSON.stringify(ageGroups || []),
        filterGender: gender || null,
        filterRegionSido: regionSidoList.join(','),
        filterRegionSigungu: regionSigunguList.join(','),
        filterCategories: categories && categories.length > 0 ? JSON.stringify(categories) : null,
        targetCount: sendCount,
        costPerMessage: COUPON_ALIMTALK_COST,
        failedCount,
        status: sentCount > 0 ? 'SENDING' : 'COMPLETED',
      },
    });

    res.json({ success: true, sentCount, failedCount, totalCost: actualCost });
  } catch (error) {
    console.error('Coupon alimtalk send error:', error);
    res.status(500).json({ error: '발송 중 오류가 발생했습니다.' });
  }
});

// GET /api/local-customers/campaigns - 캠페인 목록 조회
router.get('/campaigns', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await getCampaigns(storeScope(req), req.query);
    res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Campaigns fetch error:', error);
    res.status(500).json({ error: '캠페인 목록 조회 중 오류가 발생했습니다.' });
  }
});

export default router;
