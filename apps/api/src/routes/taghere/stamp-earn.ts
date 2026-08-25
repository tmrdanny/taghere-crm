import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { buildRewardsFromLegacy, RewardEntry } from '../../utils/random-reward.js';
import { StampEarnError, earnStamp, isVisitSourceRecent } from '../../services/stamps.js';

const router = Router();

// POST /api/taghere/stamp-earn - 스탬프 자동 적립 (카카오 로그인 후)
router.post('/stamp-earn', async (req, res) => {
  try {
    const { kakaoId, slug, earnMethod = 'NFC_TAG', isHitejinro, count } = req.body;
    const ordersheetId = req.body.ordersheetId || req.body.orderId;

    const result = await earnStamp({
      kakaoId,
      slug,
      earnMethod,
      isHitejinro,
      count,
      ordersheetId,
      t: req.body.t,
    });

    if (result.kind === 'MANUAL_PENDING') {
      return res.json({
        success: true,
        pending: true,
        requestId: result.requestId,
        storeName: result.storeName,
      });
    }

    if (result.kind === 'FRANCHISE_EARNED') {
      return res.json({
        success: true,
        currentStamps: result.currentStamps,
        customerId: result.customerId,
        storeName: result.storeName,
        franchiseName: result.franchiseName,
        isNewCustomer: result.isNewCustomer,
        hasVisitSource: result.hasVisitSource,
        rewards: result.rewards,
        drawnReward: result.drawnReward,
        drawnRewardTier: result.drawnRewardTier,
      });
    }

    res.json({
      success: true,
      // 지연 적립이면 잔액이 아직 안 움직였으므로 currentStamps 는 기존 잔액 그대로다.
      ...(result.deferred && { deferred: true }),
      currentStamps: result.currentStamps,
      customerId: result.customerId,
      storeName: result.storeName,
      isNewCustomer: result.isNewCustomer,
      hasVisitSource: result.hasVisitSource,
      rewards: result.rewards,
      ...result.legacy,
      drawnReward: result.drawnReward,
      drawnRewardTier: result.drawnRewardTier,
    });
  } catch (error: any) {
    if (error instanceof StampEarnError) {
      return res.status(error.status).json({
        success: false,
        error: error.code,
        message: error.message,
        ...error.extra,
      });
    }
    console.error('[TagHere Stamp-Earn] Error:', error);
    res.status(500).json({
      success: false,
      error: 'server_error',
      message: '스탬프 적립 중 오류가 발생했습니다.',
    });
  }
});

// GET /api/taghere/stamp-request/:id - 스탬프 적립 승인 요청 상태 조회 (공개 API, 고객 폴링용)
router.get('/stamp-request/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const request = await prisma.stampApprovalRequest.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, totalStamps: true, visitSourceUpdatedAt: true } },
        store: { select: { id: true, name: true, stampSetting: true } },
      },
    });

    if (!request) {
      return res.status(404).json({ success: false, error: 'not_found', message: '요청을 찾을 수 없습니다.' });
    }

    // lazy 만료 처리
    if (request.status === 'PENDING' && request.expiresAt <= new Date()) {
      await prisma.stampApprovalRequest.update({
        where: { id: request.id },
        data: { status: 'EXPIRED', decidedAt: new Date() },
      });
      return res.json({ success: true, status: 'EXPIRED' });
    }

    if (request.status !== 'APPROVED') {
      return res.json({ success: true, status: request.status });
    }

    // APPROVED → stamp-earn 성공 응답과 동일한 형태의 결과 제공
    const setting = request.store.stampSetting;
    const rewards: RewardEntry[] = setting?.rewards
      ? (setting.rewards as unknown as RewardEntry[])
      : setting ? buildRewardsFromLegacy(setting as any) : [];
    const legacy: Record<string, any> = {};
    for (const entry of rewards) {
      legacy[`reward${entry.tier}Description`] = entry.description;
      legacy[`reward${entry.tier}IsRandom`] = entry.options && Array.isArray(entry.options) && entry.options.length > 1;
    }
    const ledger = request.stampLedgerId
      ? await prisma.stampLedger.findUnique({ where: { id: request.stampLedgerId }, select: { drawnReward: true, drawnRewardTier: true } })
      : null;

    return res.json({
      success: true,
      status: 'APPROVED',
      result: {
        success: true,
        currentStamps: request.customer.totalStamps,
        customerId: request.customer.id,
        storeName: request.store.name,
        earnedStamps: request.count,
        hasVisitSource: isVisitSourceRecent(request.customer.visitSourceUpdatedAt),
        rewards,
        ...legacy,
        drawnReward: ledger?.drawnReward || null,
        drawnRewardTier: ledger?.drawnRewardTier || null,
      },
    });
  } catch (error) {
    console.error('[TagHere Stamp-Request] Status error:', error);
    res.status(500).json({ success: false, error: 'server_error', message: '요청 상태 조회 중 오류가 발생했습니다.' });
  }
});

export default router;
