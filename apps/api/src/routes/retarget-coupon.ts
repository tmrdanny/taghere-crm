import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { calculateCostWithCredits, useCredits } from '../services/credit-service.js';
import { resolveTargetCustomerIds } from '../lib/customer-filters.js';
import { loadStoreSegment, resolveSegmentCustomers } from '../services/segment-engine.js';
import { sendRetargetCouponGroup } from '../services/retarget-coupon-group.js';
import { recordMarketingCampaign, updateMarketingCampaign } from '../services/marketing/tracker.js';
import { targetLabelOf } from '../services/marketing/labels.js';
import { resolveSendTime, formatKst } from '../utils/send-window.js';

const router = Router();

const COUPON_COST_PER_MESSAGE = 50; // 건당 50원

// 1회 발송 최대 인원 — 그룹 발송(10,000건/요청)이라 속도 제한은 없고, 실수 방지용 상한만 둔다
const MAX_RECIPIENTS_PER_SEND = 50000;

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

    const {
      customerIds,
      couponContent,
      expiryDate,
      naverPlaceUrl,
      // 신규: 서버에서 대상 고객을 직접 해소 (프론트가 페이지네이션 미지정으로 /api/customers를 호출해
      //       발송 대상이 50명으로 잘리던 버그 회피)
      targetType,
      segmentId,
      genderFilter,
      ageGroups,
      regionSidos,
      regionSigungus,
    } = req.body;

    if (!couponContent || !couponContent.trim()) {
      return res.status(400).json({ error: '쿠폰 내용을 입력해주세요.' });
    }

    if (!expiryDate || !expiryDate.trim()) {
      return res.status(400).json({ error: '유효기간을 입력해주세요.' });
    }

    // 발송 대상 결정 분기:
    //   - targetType이 ALL/REVISIT/NEW이면 서버에서 필터 기반 전체 매칭 고객 조회 (페이지네이션 없음)
    //   - targetType이 CUSTOM 또는 미지정이면 customerIds 사용 (기존 호환)
    const serverResolved = targetType && ['ALL', 'REVISIT', 'NEW', 'SEGMENT'].includes(targetType);
    if (!serverResolved && (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0)) {
      return res.status(400).json({ error: '발송할 고객을 선택해주세요.' });
    }

    // 매장 정보 조회
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true, naverPlaceUrl: true },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    // 발송 대상 고객 조회 (id + phone, 페이지네이션 없음)
    // SEGMENT: 저장된 세그먼트 조건을 발송 시점에 다시 평가 (수신 동의 고객만)
    let resolved: { id: string; phone: string | null }[];
    if (targetType === 'SEGMENT') {
      const segment = segmentId ? await loadStoreSegment(storeId, String(segmentId)) : null;
      if (!segment) return res.status(400).json({ error: '고객 그룹을 찾을 수 없습니다.' });
      resolved = await resolveSegmentCustomers(storeId, segment.conditions);
    } else {
      resolved = await resolveTargetCustomerIds(prisma, storeId, {
        targetType,
        customerIds,
        genderFilter,
        ageGroups,
        regionSidos,
        regionSigungus,
      });
    }

    const requested = serverResolved ? resolved.length : (Array.isArray(customerIds) ? customerIds.length : 0);

    if (resolved.length === 0) {
      return res.status(400).json({ error: '발송 가능한 고객이 없습니다.' });
    }

    // 1회 최대 발송 인원 초과 시 명시적 에러 (사용자가 캡을 인지하도록)
    if (resolved.length > MAX_RECIPIENTS_PER_SEND) {
      return res.status(400).json({
        error: `1회 발송 최대 인원(${MAX_RECIPIENTS_PER_SEND.toLocaleString()}명)을 초과했습니다. 현재 ${resolved.length.toLocaleString()}명. 필터를 좁히거나 나눠 발송해 주세요.`,
        requested,
        maxRecipients: MAX_RECIPIENTS_PER_SEND,
      });
    }

    // 무료 크레딧 적용 비용 계산 (실제 대상 수 기준)
    const creditResult = await calculateCostWithCredits(
      storeId,
      resolved.length,
      COUPON_COST_PER_MESSAGE,
      true,
    );

    // 지갑 잔액 확인 (유료분만 확인)
    const wallet = await prisma.wallet.findUnique({
      where: { storeId },
    });

    if (creditResult.paidCount > 0 && (!wallet || wallet.balance < creditResult.totalCost)) {
      return res.status(400).json({
        error: `충전금이 부족합니다. 필요: ${creditResult.totalCost.toLocaleString()}원, 잔액: ${(wallet?.balance || 0).toLocaleString()}원`,
        requested,
        resolved: resolved.length,
        requiredCost: creditResult.totalCost,
        walletBalance: wallet?.balance || 0,
      });
    }

    // 발송 시각 — 예약 요청이 있으면 그 시각, 발송 불가 시간이면 다음 오전 8시
    const sendTime = resolveSendTime(req.body.scheduledAt, { adWindow: true });
    if (sendTime.error) return res.status(400).json({ error: sendTime.error });
    const scheduledAt = sendTime.at;

    // 마케팅 성과 추적 캠페인 (쿠폰 사용·재방문을 캠페인별로 집계)
    const campaignId = await recordMarketingCampaign({
      storeId,
      channel: 'KAKAO_COUPON',
      title: couponContent.trim(),
      content: `${couponContent.trim()} · ${expiryDate.trim()}까지`,
      targetLabel: targetLabelOf(targetType, segmentId),
      couponContent: couponContent.trim(),
      sentAt: scheduledAt,
      recipients: resolved.map((c) => ({ customerId: c.id, storeId })),
    });

    // 솔라피 그룹 발송 (10,000건/1회) — 접수된 건만 무료 크레딧 → 매장 지갑 순으로 과금
    const result = await sendRetargetCouponGroup({
      campaignId,
      scheduledAt,
      recipients: resolved
        .filter((c) => c.phone)
        .map((c) => ({
          customerId: c.id,
          phone: c.phone!,
          storeId,
          storeName: store.name,
          naverPlaceUrl: naverPlaceUrl || store.naverPlaceUrl || null,
        })),
      couponContent: couponContent.trim(),
      expiryDate: expiryDate.trim(),
      billing: { kind: 'STORE', storeId, unitCost: COUPON_COST_PER_MESSAGE },
      logTag: '[RetargetCoupon]',
    });
    const { queued, dropped } = result;
    await updateMarketingCampaign(campaignId, { cost: result.totalCost });

    console.log(`[RetargetCoupon] storeId=${storeId} requested=${requested} resolved=${resolved.length} queued=${queued} dropped=${dropped}`);

    res.json({
      success: true,
      scheduledAt: scheduledAt?.toISOString() ?? null,
      message: `${queued.toLocaleString()}명에게 쿠폰 알림톡을 ${scheduledAt ? `${formatKst(scheduledAt)}에 보내도록 예약했어요` : '보냈습니다'}.${dropped > 0 ? ` (${dropped.toLocaleString()}명은 접수 실패로 제외, 비용 미청구)` : ''}`,
      count: queued,
      requested,
      resolved: resolved.length,
      queued,
      dropped,
      totalCost: result.totalCost,
      maxRecipients: MAX_RECIPIENTS_PER_SEND,
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
