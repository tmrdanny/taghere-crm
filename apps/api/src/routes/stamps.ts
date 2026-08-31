import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { buildRewardsFromLegacy, buildStampUsageRule, checkMilestoneAndDraw, RewardEntry } from '../utils/random-reward.js';
import { enqueueStampEarnedAlimTalk } from '../services/solapi.js';
import { sidoToShort } from '../utils/address-parser.js';
import {
  DEFERRED_STAMP_REASON_PREFIX,
  hasTodayPendingStampAccrual,
} from '../services/pending-stamp-accrual.js';

const router = Router();

// 인증 미들웨어 적용
router.use(authMiddleware);

// POST /api/stamps/tablet-earn - 태블릿에서 전화번호 기반 스탬프 적립
router.post('/tablet-earn', async (req: AuthRequest, res) => {
  try {
    const { phone, marketingConsent, gender, ageGroup, count } = req.body;
    const storeId = req.user!.storeId;

    if (marketingConsent !== true) {
      return res.status(400).json({ error: '마케팅 정보 수신 동의가 필요합니다.' });
    }

    if (!phone) {
      return res.status(400).json({ error: '전화번호를 입력해주세요.' });
    }

    const phoneDigits = phone.replace(/[^0-9]/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 11) {
      return res.status(400).json({ error: '올바른 전화번호 형식이 아닙니다.' });
    }

    const phoneLastDigits = phoneDigits.slice(-8);
    const formattedPhone = phoneDigits.length === 11
      ? `${phoneDigits.slice(0, 3)}-${phoneDigits.slice(3, 7)}-${phoneDigits.slice(7)}`
      : `${phoneDigits.slice(0, 3)}-${phoneDigits.slice(3, 6)}-${phoneDigits.slice(6)}`;

    // 매장 + 스탬프 설정 확인
    const [store, stampSetting] = await Promise.all([
      prisma.store.findUnique({
        where: { id: storeId },
        select: {
          name: true,
          addressSido: true,
          addressSigungu: true,
        },
      }),
      prisma.stampSetting.findUnique({
        where: { storeId },
      }),
    ]);

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    if (!stampSetting?.enabled) {
      return res.status(400).json({ error: '스탬프 기능이 비활성화되어 있습니다.' });
    }

    // 매번 적립 개수 직접 입력 모드: count(양의 정수) 필수, 하루 1회 제한 해제, 첫 보너스 무시
    const manualMode = !!stampSetting.manualStampCountEnabled;
    let earnCount = 1;
    if (manualMode) {
      earnCount = Number(count);
      if (!Number.isInteger(earnCount) || earnCount < 1) {
        return res.status(400).json({ error: '적립할 스탬프 개수를 올바르게 입력해주세요.' });
      }
    }

    // 고객 조회 또는 생성
    let customer = await prisma.customer.findFirst({
      where: { storeId, phoneLastDigits },
    });

    let isNewCustomer = false;

    if (!customer) {
      isNewCustomer = true;
      customer = await prisma.customer.create({
        data: {
          storeId,
          phone: formattedPhone,
          phoneLastDigits,
          gender: gender || null,
          ageGroup: ageGroup || null,
          consentMarketing: true,
          consentAt: new Date(),
          totalStamps: 0,
          totalPoints: 0,
          visitCount: 0,
          regionSido: sidoToShort(store.addressSido) ?? null,
          regionSigungu: store.addressSigungu || null,
        },
      });
    } else {
      await prisma.customer.update({
        where: { id: customer.id },
        data: {
          consentMarketing: true,
          consentAt: customer.consentAt || new Date(),
          ...(gender && !customer.gender && { gender }),
          ...(ageGroup && !customer.ageGroup && { ageGroup }),
        },
      });
    }

    // 오늘 이미 적립했는지 확인 (1일 1회 제한)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // 수동 개수 모드가 아닐 때만 하루 1회 제한 적용
    if (!manualMode) {
      const todayEarn = await prisma.stampLedger.findFirst({
        where: {
          storeId,
          customerId: customer.id,
          type: 'EARN',
          createdAt: { gte: todayStart },
          // 지연 전환분은 createdAt 이 결제완료 시각이라 "오늘 적립" 판정 근거가 될 수 없다.
          // reason 은 nullable 이라 NOT startsWith 만 쓰면 NULL 행이 통째로 빠진다(NULL LIKE → NULL).
          OR: [{ reason: null }, { reason: { not: { startsWith: DEFERRED_STAMP_REASON_PREFIX } } }],
        },
      });

      // 지연 적립은 EARN 원장을 만들지 않으므로 예약도 함께 봐야 같은 날 재적립을 막을 수 있다.
      if (todayEarn || (await hasTodayPendingStampAccrual(storeId, customer.id))) {
        return res.status(400).json({
          error: '오늘 이미 스탬프를 적립했습니다.',
          alreadyEarned: true,
          currentStamps: customer.totalStamps,
        });
      }
    }

    // 방문 판단
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const todayVisit = await prisma.visitOrOrder.findFirst({
      where: {
        customerId: customer.id,
        storeId,
        visitedAt: { gte: todayStart, lte: todayEnd },
      },
    });
    const isFirstVisitToday = !todayVisit;

    // 스탬프 적립 (트랜잭션)
    const result = await prisma.$transaction(async (tx) => {
      const newBalance = customer!.totalStamps + earnCount;

      const updatedCustomer = await tx.customer.update({
        where: { id: customer!.id },
        data: {
          totalStamps: newBalance,
          ...(isFirstVisitToday && { visitCount: { increment: 1 } }),
          lastVisitAt: new Date(),
        },
      });

      const ledger = await tx.stampLedger.create({
        data: {
          storeId,
          customerId: customer!.id,
          type: 'EARN',
          delta: earnCount,
          balance: newBalance,
          earnMethod: 'MANUAL',
          reason: '태블릿 적립',
        },
      });

      return { customer: updatedCustomer, ledger };
    });

    // 알림톡 발송 (매장 설정에 따라)
    const phoneNumber = formattedPhone.replace(/[^0-9]/g, '');
    const rewards = (stampSetting.rewards as unknown as RewardEntry[] | null)
      ?? buildRewardsFromLegacy(stampSetting);
    const stampUsageRule = rewards && rewards.length > 0
      ? rewards.map((r) => `${r.tier}개: ${r.description}`).join(', ')
      : '';

    enqueueStampEarnedAlimTalk({
      storeId,
      customerId: customer.id,
      stampLedgerId: result.ledger.id,
      phone: phoneNumber,
      variables: {
        storeName: store.name || '매장',
        earnedStamps: earnCount,
        totalStamps: result.customer.totalStamps,
        stampUsageRule,
        reviewGuide: '',
      },
    }).catch((err) => {
      console.error('[StampTabletEarn] AlimTalk enqueue failed:', err);
    });

    res.json({
      success: true,
      customer: {
        id: result.customer.id,
        name: result.customer.name,
        totalStamps: result.customer.totalStamps,
        visitCount: result.customer.visitCount,
      },
      earnedStamps: earnCount,
      newBalance: result.customer.totalStamps,
      isNewCustomer,
    });
  } catch (error) {
    console.error('Stamp tablet earn error:', error);
    res.status(500).json({ error: '스탬프 적립 중 오류가 발생했습니다.' });
  }
});

// POST /api/stamps/earn - 스탬프 적립 (CRM에서 수동 적립)
router.post('/earn', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { customerId, reason } = req.body;

    if (!customerId) {
      return res.status(400).json({ error: '고객 ID가 필요합니다.' });
    }

    // 매장 스탬프 설정 확인
    const setting = await prisma.stampSetting.findUnique({
      where: { storeId },
    });

    if (!setting?.enabled) {
      return res.status(400).json({ error: '스탬프 기능이 비활성화되어 있습니다.' });
    }

    // 고객 확인
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, storeId },
    });

    if (!customer) {
      return res.status(404).json({ error: '고객을 찾을 수 없습니다.' });
    }

    // 오늘 이미 적립했는지 확인 (1일 1회 제한)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEarn = await prisma.stampLedger.findFirst({
      where: {
        storeId,
        customerId,
        type: 'EARN',
        createdAt: { gte: todayStart },
        // 지연 전환분은 createdAt 이 결제완료 시각이라 "오늘 적립" 판정 근거가 될 수 없다.
        // reason 은 nullable 이라 NOT startsWith 만 쓰면 NULL 행이 통째로 빠진다(NULL LIKE → NULL).
        OR: [{ reason: null }, { reason: { not: { startsWith: DEFERRED_STAMP_REASON_PREFIX } } }],
      },
    });

    // 지연 적립은 EARN 원장을 만들지 않으므로 예약도 함께 봐야 같은 날 재적립을 막을 수 있다.
    if (todayEarn || (await hasTodayPendingStampAccrual(storeId, customerId))) {
      return res.status(400).json({
        error: '오늘 이미 스탬프를 적립했습니다.',
        alreadyEarned: true,
        currentStamps: customer.totalStamps,
      });
    }

    // 스탬프 적립 (트랜잭션)
    const result = await prisma.$transaction(async (tx) => {
      const newBalance = customer.totalStamps + 1;

      // 고객 스탬프 업데이트
      const updatedCustomer = await tx.customer.update({
        where: { id: customerId },
        data: { totalStamps: newBalance },
      });

      // 거래 내역 기록
      const ledger = await tx.stampLedger.create({
        data: {
          storeId,
          customerId,
          type: 'EARN',
          delta: 1,
          balance: newBalance,
          earnMethod: 'MANUAL',
          reason: reason || '수동 적립',
        },
      });

      return { customer: updatedCustomer, ledger };
    });

    res.json({
      success: true,
      currentStamps: result.customer.totalStamps,
      customerId,
    });
  } catch (error) {
    console.error('Stamp earn error:', error);
    res.status(500).json({ error: '스탬프 적립 중 오류가 발생했습니다.' });
  }
});

// POST /api/stamps/use - 스탬프 사용 (5개 또는 10개)
router.post('/use', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { customerId, amount } = req.body;

    if (!customerId) {
      return res.status(400).json({ error: '고객 ID가 필요합니다.' });
    }

    if (typeof amount !== 'number' || amount < 1 || amount > 50) {
      return res.status(400).json({ error: '사용 가능한 스탬프 수는 1~50입니다.' });
    }

    // 매장의 보상 설정에서 유효한 티어 확인
    const setting = await prisma.stampSetting.findUnique({ where: { storeId } });
    const rewards: RewardEntry[] = setting?.rewards
      ? (setting.rewards as unknown as RewardEntry[])
      : setting ? buildRewardsFromLegacy(setting as any) : [];
    const validTiers = rewards.map(r => r.tier);

    // 레거시 폴백: 보상 설정이 없으면 기존 고정 티어 허용
    const LEGACY_AMOUNTS = [5, 10, 15, 20, 25, 30];
    const allowedAmounts = validTiers.length > 0 ? validTiers : LEGACY_AMOUNTS;

    if (!allowedAmounts.includes(amount)) {
      return res.status(400).json({ error: `${allowedAmounts.join(', ')}개 단위로만 사용 가능합니다.` });
    }

    // 고객 확인
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, storeId },
    });

    if (!customer) {
      return res.status(404).json({ error: '고객을 찾을 수 없습니다.' });
    }

    // 잔액 확인
    if (customer.totalStamps < amount) {
      return res.status(400).json({
        error: `스탬프가 부족합니다. (현재: ${customer.totalStamps}개)`,
      });
    }

    // 스탬프 사용 (트랜잭션)
    const result = await prisma.$transaction(async (tx) => {
      const newBalance = customer.totalStamps - amount;
      // 레거시 티어(5,10,15,20,25,30)는 기존 USE_N 타입, 그 외는 USE
      const legacyAmounts = [5, 10, 15, 20, 25, 30];
      const ledgerType = legacyAmounts.includes(amount) ? `USE_${amount}` as any : 'USE' as any;

      // 고객 스탬프 업데이트
      const updatedCustomer = await tx.customer.update({
        where: { id: customerId },
        data: { totalStamps: newBalance },
      });

      // 거래 내역 기록
      const ledger = await tx.stampLedger.create({
        data: {
          storeId,
          customerId,
          type: ledgerType,
          delta: -amount,
          balance: newBalance,
          drawnRewardTier: amount,
          reason: `${amount}개 보상 사용`,
        },
      });

      return { customer: updatedCustomer, ledger };
    });

    res.json({
      success: true,
      usedAmount: amount,
      remainingStamps: result.customer.totalStamps,
    });
  } catch (error) {
    console.error('Stamp use error:', error);
    res.status(500).json({ error: '스탬프 사용 중 오류가 발생했습니다.' });
  }
});

// POST /api/stamps/adjust - 스탬프 조정 (관리자)
router.post('/adjust', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { customerId, delta, reason } = req.body;

    if (!customerId) {
      return res.status(400).json({ error: '고객 ID가 필요합니다.' });
    }

    if (typeof delta !== 'number' || delta === 0) {
      return res.status(400).json({ error: '조정할 스탬프 수를 입력해주세요.' });
    }

    // 고객 확인
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, storeId },
    });

    if (!customer) {
      return res.status(404).json({ error: '고객을 찾을 수 없습니다.' });
    }

    // 차감 시 잔액 확인
    const newBalance = customer.totalStamps + delta;
    if (newBalance < 0) {
      return res.status(400).json({
        error: `스탬프가 부족합니다. (현재: ${customer.totalStamps}개)`,
      });
    }

    // 스탬프 조정 (트랜잭션)
    const result = await prisma.$transaction(async (tx) => {
      // 고객 스탬프 업데이트
      const updatedCustomer = await tx.customer.update({
        where: { id: customerId },
        data: { totalStamps: newBalance },
      });

      // 거래 내역 기록
      const ledger = await tx.stampLedger.create({
        data: {
          storeId,
          customerId,
          type: delta > 0 ? 'ADMIN_ADD' : 'ADMIN_REMOVE',
          delta,
          balance: newBalance,
          reason: reason || (delta > 0 ? '관리자 추가' : '관리자 차감'),
        },
      });

      return { customer: updatedCustomer, ledger };
    });

    // 매번 적립 개수 직접 입력 모드 매장은 CRM 수동 적립(delta>0) 시에도 고객에게 적립 알림톡 발송
    if (delta > 0) {
      const [setting, store] = await Promise.all([
        prisma.stampSetting.findUnique({ where: { storeId } }),
        prisma.store.findUnique({ where: { id: storeId }, select: { name: true } }),
      ]);
      if (setting?.manualStampCountEnabled) {
        const phoneNumber = (customer.phone || '').replace(/[^0-9]/g, '');
        const rewards = (setting.rewards as unknown as RewardEntry[] | null)
          ?? buildRewardsFromLegacy(setting as any);
        const stampUsageRule = rewards && rewards.length > 0
          ? rewards.map((r) => `${r.tier}개: ${r.description}`).join(', ')
          : '';
        if (phoneNumber) {
          enqueueStampEarnedAlimTalk({
            storeId,
            customerId,
            stampLedgerId: result.ledger.id,
            phone: phoneNumber,
            variables: {
              storeName: store?.name || '매장',
              earnedStamps: delta,
              totalStamps: result.customer.totalStamps,
              stampUsageRule,
              reviewGuide: '',
            },
          }).catch((err) => {
            console.error('[StampAdjust] AlimTalk enqueue failed:', err);
          });
        }
      }
    }

    res.json({
      success: true,
      adjustedAmount: delta,
      currentStamps: result.customer.totalStamps,
    });
  } catch (error) {
    console.error('Stamp adjust error:', error);
    res.status(500).json({ error: '스탬프 조정 중 오류가 발생했습니다.' });
  }
});

// GET /api/stamps/history/:customerId - 고객 스탬프 내역 조회
router.get('/history/:customerId', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { customerId } = req.params;
    const { limit = '20', offset = '0' } = req.query;

    // 고객 확인
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, storeId },
    });

    if (!customer) {
      return res.status(404).json({ error: '고객을 찾을 수 없습니다.' });
    }

    // 스탬프 내역 조회
    const [history, total] = await Promise.all([
      prisma.stampLedger.findMany({
        where: { customerId, storeId },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit as string),
        skip: parseInt(offset as string),
      }),
      prisma.stampLedger.count({
        where: { customerId, storeId },
      }),
    ]);

    res.json({
      currentStamps: customer.totalStamps,
      history: history.map((h) => ({
        id: h.id,
        type: h.type,
        delta: h.delta,
        balance: h.balance,
        reason: h.reason,
        earnMethod: h.earnMethod,
        createdAt: h.createdAt,
      })),
      total,
    });
  } catch (error) {
    console.error('Get stamp history error:', error);
    res.status(500).json({ error: '스탬프 내역 조회 중 오류가 발생했습니다.' });
  }
});

// ============================================
// 스탬프 적립 승인 요청 (매번 적립 개수 직접 입력 모드)
// 고객이 적립하기를 누르면 PENDING 생성 → 대시보드 팝업에서 직원이 개수 입력 후 승인/취소
// ============================================

// GET /api/stamps/approval-requests/pending - 대기 중인 적립 승인 요청 목록 (대시보드 폴링)
router.get('/approval-requests/pending', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const now = new Date();

    // lazy 만료 처리
    await prisma.stampApprovalRequest.updateMany({
      where: { storeId, status: 'PENDING', expiresAt: { lte: now } },
      data: { status: 'EXPIRED', decidedAt: now },
    });

    const requests = await prisma.stampApprovalRequest.findMany({
      where: { storeId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: {
        customer: { select: { id: true, name: true, phone: true, phoneLastDigits: true, totalStamps: true } },
      },
    });

    res.json({
      requests: requests.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        expiresAt: r.expiresAt,
        customer: {
          id: r.customer.id,
          name: r.customer.name,
          phoneLastDigits: r.customer.phoneLastDigits,
          totalStamps: r.customer.totalStamps,
        },
      })),
    });
  } catch (error) {
    console.error('Stamp approval pending list error:', error);
    res.status(500).json({ error: '승인 요청 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/stamps/approval-requests/:id/approve - 적립 승인 (개수 입력)
router.post('/approval-requests/:id/approve', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { id } = req.params;
    const count = Number(req.body?.count);

    if (!Number.isInteger(count) || count < 1 || count > 100) {
      return res.status(400).json({ error: '적립할 스탬프 개수를 올바르게 입력해주세요. (1~100)' });
    }

    const request = await prisma.stampApprovalRequest.findFirst({
      where: { id, storeId },
      include: { customer: true },
    });
    if (!request) {
      return res.status(404).json({ error: '승인 요청을 찾을 수 없습니다.' });
    }
    if (request.status !== 'PENDING') {
      return res.status(400).json({ error: '이미 처리된 요청입니다.' });
    }
    if (request.expiresAt <= new Date()) {
      await prisma.stampApprovalRequest.update({
        where: { id: request.id },
        data: { status: 'EXPIRED', decidedAt: new Date() },
      });
      return res.status(400).json({ error: '만료된 요청입니다. 고객에게 다시 시도하도록 안내해주세요.' });
    }

    const setting = await prisma.stampSetting.findUnique({ where: { storeId } });

    const result = await prisma.$transaction(async (tx) => {
      // 원자적 상태 전이 (동시 승인 방지)
      const transition = await tx.stampApprovalRequest.updateMany({
        where: { id: request.id, status: 'PENDING' },
        data: { status: 'APPROVED', count, decidedAt: new Date() },
      });
      if (transition.count !== 1) {
        throw new Error('REQUEST_ALREADY_DECIDED');
      }

      const previousStamps = request.customer.totalStamps;
      const newBalance = previousStamps + count;

      const updatedCustomer = await tx.customer.update({
        where: { id: request.customerId },
        data: { totalStamps: newBalance },
      });

      const ledger = await tx.stampLedger.create({
        data: {
          storeId,
          customerId: request.customerId,
          type: 'EARN',
          delta: count,
          balance: newBalance,
          ordersheetId: request.ordersheetId || null,
          reason: `스탬프 적립 (${count}개, 관리자 승인)`,
        },
      });

      // 마일스톤 도달 시 보상 추첨
      const milestoneResult = setting ? checkMilestoneAndDraw(previousStamps, newBalance, setting) : null;
      if (milestoneResult) {
        await tx.stampLedger.update({
          where: { id: ledger.id },
          data: { drawnReward: milestoneResult.reward, drawnRewardTier: milestoneResult.tier },
        });
      }

      await tx.stampApprovalRequest.update({
        where: { id: request.id },
        data: { stampLedgerId: ledger.id },
      });

      return { customer: updatedCustomer, ledger, milestoneResult };
    });

    // 적립 알림톡 (매장 알림톡 설정 활성 시)
    const phoneNumber = (request.customer.phone || '').replace(/[^0-9]/g, '');
    if (setting?.alimtalkEnabled && phoneNumber) {
      const store = await prisma.store.findUnique({ where: { id: storeId }, select: { name: true } });
      const rewards = (setting.rewards as unknown as RewardEntry[] | null) ?? buildRewardsFromLegacy(setting as any);
      const stampUsageRule = buildStampUsageRule(rewards, result.milestoneResult);
      enqueueStampEarnedAlimTalk({
        storeId,
        customerId: request.customerId,
        stampLedgerId: result.ledger.id,
        phone: phoneNumber,
        variables: {
          storeName: store?.name || '매장',
          earnedStamps: count,
          totalStamps: result.customer.totalStamps,
          stampUsageRule,
          reviewGuide: '진심을 담은 리뷰는 매장에 큰 도움이 됩니다 :)',
        },
      }).catch((err) => {
        console.error('[StampApproval] AlimTalk enqueue failed:', err);
      });
    }

    res.json({
      success: true,
      approvedCount: count,
      currentStamps: result.customer.totalStamps,
      drawnReward: result.milestoneResult?.reward || null,
    });
  } catch (error: any) {
    if (error?.message === 'REQUEST_ALREADY_DECIDED') {
      return res.status(400).json({ error: '이미 처리된 요청입니다.' });
    }
    console.error('Stamp approval approve error:', error);
    res.status(500).json({ error: '적립 승인 중 오류가 발생했습니다.' });
  }
});

// POST /api/stamps/approval-requests/:id/reject - 적립 취소
router.post('/approval-requests/:id/reject', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { id } = req.params;

    const updated = await prisma.stampApprovalRequest.updateMany({
      where: { id, storeId, status: 'PENDING' },
      data: { status: 'REJECTED', decidedAt: new Date() },
    });
    if (updated.count !== 1) {
      return res.status(400).json({ error: '이미 처리되었거나 존재하지 않는 요청입니다.' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Stamp approval reject error:', error);
    res.status(500).json({ error: '적립 취소 중 오류가 발생했습니다.' });
  }
});

export default router;
