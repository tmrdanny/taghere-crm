import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { franchiseAuthMiddleware, FranchiseAuthRequest } from '../middleware/franchise-auth.js';
import {
  LocalCampaignScope,
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
import { isSendableTime, getNextSendableTime } from '../utils/send-window.js';
import { customAlphabet } from 'nanoid';

const router = Router();

// 신규 유치 쿠폰 알림톡 비용 (건당)
const ACQUISITION_COUPON_COST = 100;
const ACQUISITION_INSERT_CHUNK_SIZE = 500;
const generateAcqCouponCode = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 10);

// 프랜차이즈 스코프 (FranchiseWallet / franchiseId 캠페인 귀속)
function franchiseScope(req: FranchiseAuthRequest): LocalCampaignScope {
  return { kind: 'franchise', franchiseId: req.franchiseUser!.franchiseId };
}

// GET /api/local-customers/regions - 지역 목록 조회 (ExternalCustomer 기반)
router.get('/regions', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res) => {
  try {
    const result = await getRegions(req.query);
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Regions fetch error:', error);
    res.status(500).json({ error: '지역 목록 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/local-customers/total-count - 전체 고객 수 조회 (ExternalCustomer + 전체 CRM 고객)
router.get('/total-count', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res) => {
  try {
    const result = await getTotalCustomerCount();
    res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Total count fetch error:', error);
    res.status(500).json({ error: '전체 고객 수 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/franchise/local-customers/region-counts - 지역별 고객 수 조회
router.get('/region-counts', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res) => {
  try {
    const result = await getRegionCounts(franchiseScope(req));
    res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Region counts fetch error:', error);
    res.status(500).json({ error: '지역별 고객 수 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/local-customers/count - 조건에 맞는 고객 수 조회 (ExternalCustomer + Customer 통합)
router.get('/count', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res) => {
  try {
    const result = await getFilteredCount(franchiseScope(req), req.query);
    res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Count fetch error:', error);
    res.status(500).json({ error: '고객 수 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/local-customers/estimate - 비용 예상
router.get('/estimate', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res) => {
  try {
    const result = await getSmsEstimate(franchiseScope(req), req.query);
    res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Estimate error:', error);
    res.status(500).json({ error: '비용 예상 중 오류가 발생했습니다.' });
  }
});

// POST /api/local-customers/send - 메시지 발송 (다중 지역 지원)
router.post('/send', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res) => {
  try {
    const result = await sendCampaignSms(franchiseScope(req), req.body);
    res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Send error:', error);
    res.status(500).json({ error: '메시지 발송 중 오류가 발생했습니다.' });
  }
});

// POST /api/local-customers/test - 테스트 발송
router.post('/test', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res) => {
  try {
    const result = await sendTestSms(req.body);
    res.status(result.status).json(result.body);
  } catch (error: any) {
    console.error('Test send error:', error);
    res.status(500).json({ error: error.message || '테스트 발송 중 오류가 발생했습니다.' });
  }
});

// GET /api/local-customers/kakao/send-available - 카카오톡 발송 가능 시간 확인
router.get('/kakao/send-available', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res) => {
  try {
    const result = getKakaoSendAvailable();
    res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Send available check error:', error);
    res.status(500).json({ error: '발송 가능 시간 확인 중 오류가 발생했습니다.' });
  }
});

// GET /api/local-customers/kakao/estimate - 카카오톡 비용 예상
router.get('/kakao/estimate', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res) => {
  try {
    const result = await getKakaoEstimate(franchiseScope(req), req.query);
    res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Kakao estimate error:', error);
    res.status(500).json({ error: '비용 예상 중 오류가 발생했습니다.' });
  }
});

// POST /api/local-customers/kakao/send - 카카오톡 브랜드 메시지 발송 (외부 고객)
router.post('/kakao/send', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res) => {
  try {
    const result = await sendKakaoBrandMessage(franchiseScope(req), req.body);
    res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Kakao send error:', error);
    res.status(500).json({ error: '카카오톡 발송 중 오류가 발생했습니다.' });
  }
});

// POST /api/local-customers/kakao/coupon-send - 신규 유치 쿠폰 알림톡 발송 (외부 고객)
// messages 페이지와 동일한 쿠폰 알림톡 템플릿. 대표매장 정보로 쿠폰을 생성한다.
router.post('/kakao/coupon-send', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const {
      couponContent,
      expiryDate,
      representativeStoreId,
      ageGroups,
      gender,
      regions,
      regionSidos,
      sendCount,
      categories,
    } = req.body;

    if (!couponContent || !couponContent.trim()) {
      return res.status(400).json({ error: '쿠폰 내용을 입력해주세요.' });
    }
    if (!expiryDate || !expiryDate.trim()) {
      return res.status(400).json({ error: '유효기간을 입력해주세요.' });
    }
    if (!representativeStoreId) {
      return res.status(400).json({ error: '대표 매장을 선택해주세요.' });
    }
    if (!sendCount || sendCount <= 0) {
      return res.status(400).json({ error: '발송 수량은 1 이상이어야 합니다.' });
    }

    // 대표 매장 검증 (해당 프랜차이즈 소속인지)
    const repStore = await prisma.store.findFirst({
      where: { id: representativeStoreId, franchiseId },
      select: { id: true, name: true, naverPlaceUrl: true },
    });
    if (!repStore) {
      return res.status(400).json({ error: '유효한 대표 매장이 아닙니다.' });
    }

    // 지역 필터 (regions 신형 / regionSidos 구형)
    let regionFilters: Array<{ sido: string; sigungu?: string }> = [];
    if (regions && Array.isArray(regions) && regions.length > 0) {
      regionFilters = regions;
    } else if (regionSidos && Array.isArray(regionSidos) && regionSidos.length > 0) {
      regionFilters = regionSidos.map((sido: string) => ({ sido }));
    }
    if (regionFilters.length === 0) {
      return res.status(400).json({ error: '지역을 선택해주세요.' });
    }

    // SOLAPI 설정
    const templateId = process.env.SOLAPI_TEMPLATE_ID_RETARGET_COUPON;
    if (!templateId) {
      return res.status(500).json({ error: '알림톡 템플릿이 설정되지 않았습니다.' });
    }
    const pfId = process.env.SOLAPI_PF_ID;
    if (!pfId) {
      return res.status(400).json({ error: '카카오 비즈니스 채널 설정이 필요합니다.' });
    }

    // 발송 가능 시간 (야간이면 다음날 08:00 예약)
    const sendableNow = isSendableTime();
    const scheduledAt = sendableNow ? undefined : getNextSendableTime();

    // 비용/지갑
    const totalCost = sendCount * ACQUISITION_COUPON_COST;
    const wallet = await prisma.franchiseWallet.findUnique({ where: { franchiseId } });
    if (!wallet || wallet.balance < totalCost) {
      return res.status(400).json({
        error: '잔액이 부족합니다.',
        walletBalance: wallet?.balance || 0,
        requiredAmount: totalCost,
      });
    }

    // 대상 외부 고객 조회 (브랜드 메시지 발송과 동일 필터)
    const regionOrConditions = regionFilters.map((r) =>
      r.sigungu ? { regionSido: r.sido, regionSigungu: r.sigungu } : { regionSido: r.sido }
    );
    const where: any = { OR: regionOrConditions, consentMarketing: true };
    if (ageGroups && ageGroups.length > 0) where.ageGroup = { in: ageGroups };
    if (gender && gender !== 'all') where.gender = gender;
    if (categories && categories.length > 0) {
      where.OR = categories.map((cat: string) => ({ preferredCategories: { contains: cat } }));
    }

    const availableCount = await prisma.externalCustomer.count({ where });
    if (sendCount > availableCount) {
      return res.status(400).json({ error: `발송 가능한 고객이 ${availableCount}명입니다.`, availableCount });
    }

    const customers = await prisma.externalCustomer.findMany({
      where,
      take: sendCount,
      orderBy: { id: 'asc' },
      select: { id: true, phone: true },
    });

    const appUrl = process.env.PUBLIC_APP_URL || 'http://localhost:3999';
    const domain = appUrl.replace(/^https?:\/\//, '');
    const naverForTemplate = (repStore.naverPlaceUrl || '').replace(/^https?:\/\//, '');

    // 이력용 캠페인 레코드
    const regionSidoList = [...new Set(regionFilters.map((r) => r.sido))];
    const regionSigunguList = regionFilters.filter((r) => r.sigungu).map((r) => r.sigungu);
    const campaign = await prisma.externalSmsCampaign.create({
      data: {
        franchiseId,
        title: `신규 고객 유치 (쿠폰 알림톡) - ${new Date().toLocaleDateString('ko-KR')}`,
        content: couponContent.trim(),
        filterAgeGroups: JSON.stringify(ageGroups || []),
        filterGender: gender || null,
        filterRegionSido: regionSidoList.join(','),
        filterRegionSigungu: regionSigunguList.join(','),
        filterCategories: categories && categories.length > 0 ? JSON.stringify(categories) : null,
        targetCount: sendCount,
        costPerMessage: ACQUISITION_COUPON_COST,
        status: 'SENDING',
      },
    });

    // 청크 단위로 RetargetCoupon + AlimTalkOutbox 생성 + 지갑 차감
    const codePoolDedup = new Set<string>();
    let queued = 0;
    let dropped = 0;

    for (let i = 0; i < customers.length; i += ACQUISITION_INSERT_CHUNK_SIZE) {
      const slice = customers.slice(i, i + ACQUISITION_INSERT_CHUNK_SIZE);

      const rows = slice.map((c) => {
        let code = generateAcqCouponCode();
        let guard = 0;
        while (codePoolDedup.has(code) && guard < 5) {
          code = generateAcqCouponCode();
          guard++;
        }
        codePoolDedup.add(code);
        return { code, phone: c.phone };
      });

      const retargetRows = rows.map((r) => ({
        code: r.code,
        storeId: repStore.id,
        customerId: null,
        phone: r.phone,
        couponContent: couponContent.trim(),
        expiryDate: expiryDate.trim(),
        naverPlaceUrl: repStore.naverPlaceUrl || null,
      }));

      const outboxRows = rows.map((r) => ({
        storeId: repStore.id,
        customerId: null,
        phone: r.phone,
        messageType: 'RETARGET_COUPON' as const,
        templateId,
        variables: {
          '#{상호}': repStore.name,
          '#{쿠폰내용}': couponContent.trim(),
          '#{유효기간}': expiryDate.trim(),
          '#{네이버플레이스}': naverForTemplate,
          '#{직원확인}': `${domain}/coupon/verify/${r.code}`,
        } as any,
        idempotencyKey: `retarget-coupon-${r.code}`,
        status: 'PENDING' as const,
        scheduledAt,
      }));

      const chunkCost = slice.length * ACQUISITION_COUPON_COST;

      try {
        await prisma.$transaction(async (tx) => {
          const couponInsert = await (tx as any).retargetCoupon.createMany({
            data: retargetRows,
            skipDuplicates: true,
          });
          const outboxInsert = await tx.alimTalkOutbox.createMany({
            data: outboxRows,
            skipDuplicates: true,
          });
          const ok = Math.min(couponInsert.count, outboxInsert.count);
          queued += ok;
          dropped += slice.length - ok;
          const effectiveCost = ok * ACQUISITION_COUPON_COST;
          if (effectiveCost > 0) {
            await tx.franchiseWallet.update({
              where: { franchiseId },
              data: { balance: { decrement: effectiveCost } },
            });
          }
        });
      } catch (chunkErr) {
        console.error(`[AcquisitionCoupon] chunk ${i} failed:`, chunkErr);
        dropped += slice.length;
      }
    }

    await prisma.externalSmsCampaign.update({
      where: { id: campaign.id },
      data: { status: queued > 0 ? 'SENDING' : 'COMPLETED', failedCount: dropped },
    });

    const responseMessage = scheduledAt
      ? `${queued.toLocaleString()}명 예약 완료 — 다음날 08:00에 발송됩니다.`
      : `${queued.toLocaleString()}명에게 쿠폰 알림톡 발송이 예약되었습니다.`;

    res.json({
      success: true,
      campaignId: campaign.id,
      count: queued,
      queued,
      dropped,
      pendingCount: queued,
      totalCost: queued * ACQUISITION_COUPON_COST,
      message: responseMessage,
      scheduledAt: scheduledAt?.toISOString(),
    });
  } catch (error) {
    console.error('Acquisition coupon send error:', error);
    res.status(500).json({ error: '쿠폰 알림톡 발송 중 오류가 발생했습니다.' });
  }
});

// GET /api/local-customers/campaigns - 캠페인 목록 조회
router.get('/campaigns', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res) => {
  try {
    const result = await getCampaigns(franchiseScope(req), req.query);
    res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Campaigns fetch error:', error);
    res.status(500).json({ error: '캠페인 목록 조회 중 오류가 발생했습니다.' });
  }
});

export default router;
