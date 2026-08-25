import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { enqueuePointsEarnedAlimTalk } from '../services/solapi.js';
import { sidoToShort } from '../utils/address-parser.js';
import { syncToMetacity } from '../services/metacity.js';
import { notifyYahwaPointsChange } from '../services/yahwa-webhook.js';
import {
  DEFERRED_ACCRUAL_REASON_PREFIX,
  hasTodayEarnLedger,
  hasTodayPendingAccrual,
} from '../services/pending-point-accrual.js';
import {
  PointsError,
  earnPoints,
  usePoints,
  isStandaloneMagicposStore,
  STANDALONE_BLOCK_MESSAGE,
} from '../services/points.js';

// 기존 import 경로 유지용 재수출 (admin-store-ledger.ts 등이 사용)
export { isStandaloneMagicposStore, STANDALONE_BLOCK_MESSAGE };

const router = Router();

// POST /api/points/earn - 포인트 적립
router.post('/earn', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { phone, customerId, points, orderId } = req.body;
    const storeId = req.user!.storeId;
    const staffUserId = req.user!.id;

    const { customer: updatedCustomer, newBalance } = await earnPoints({
      phone,
      customerId,
      points,
      orderId,
      storeId,
      staffUserId,
    });

    res.json({
      success: true,
      customer: {
        id: updatedCustomer.id,
        name: updatedCustomer.name,
        totalPoints: updatedCustomer.totalPoints,
        visitCount: updatedCustomer.visitCount,
      },
      earnedPoints: points,
      newBalance,
    });
  } catch (error) {
    if (error instanceof PointsError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Points earn error:', error);
    res.status(500).json({ error: '포인트 적립 중 오류가 발생했습니다.' });
  }
});

// POST /api/points/use - 포인트 사용
router.post('/use', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { customerId, points, reason } = req.body;
    const storeId = req.user!.storeId;
    const staffUserId = req.user!.id;

    const { customer: updatedCustomer, newBalance } = await usePoints({
      customerId,
      points,
      reason,
      storeId,
      staffUserId,
    });

    res.json({
      success: true,
      customer: {
        id: updatedCustomer.id,
        name: updatedCustomer.name,
        totalPoints: updatedCustomer.totalPoints,
      },
      usedPoints: points,
      newBalance,
    });
  } catch (error) {
    if (error instanceof PointsError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Points use error:', error);
    res.status(500).json({ error: '포인트 사용 중 오류가 발생했습니다.' });
  }
});

// POST /api/points/tablet-earn - 태블릿 포인트 적립 (고객이 직접 입력)
router.post('/tablet-earn', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { phone, marketingConsent, gender, ageGroup } = req.body;
    const storeId = req.user!.storeId;

    // 마케팅 동의 필수 체크
    if (marketingConsent !== true) {
      return res.status(400).json({ error: '마케팅 정보 수신 동의가 필요합니다.' });
    }

    if (!phone) {
      return res.status(400).json({ error: '전화번호를 입력해주세요.' });
    }

    if (await isStandaloneMagicposStore(storeId)) {
      return res.status(400).json({ error: STANDALONE_BLOCK_MESSAGE });
    }

    // 전화번호 정규화 (숫자만 추출)
    const phoneDigits = phone.replace(/[^0-9]/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 11) {
      return res.status(400).json({ error: '올바른 전화번호 형식이 아닙니다.' });
    }

    const phoneLastDigits = phoneDigits.slice(-8);
    const formattedPhone = phoneDigits.length === 11
      ? `${phoneDigits.slice(0, 3)}-${phoneDigits.slice(3, 7)}-${phoneDigits.slice(7)}`
      : `${phoneDigits.slice(0, 3)}-${phoneDigits.slice(3, 6)}-${phoneDigits.slice(6)}`;

    // 매장 정보 조회 (적립률, 이름, 알림톡 설정, 지역 정보)
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: {
        name: true,
        pointRatePercent: true,
        pointsAlimtalkEnabled: true,
        pointsAlimtalkFrequency: true,
        addressSido: true,
        addressSigungu: true,
      },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    // 고정 포인트 적립 (태블릿 적립은 100P 고정 또는 매장 설정에 따름)
    const earnPoints = 100;

    // 기존 고객 조회 또는 생성
    let customer = await prisma.customer.findFirst({
      where: { storeId, phoneLastDigits },
    });

    let isNewCustomer = false;

    if (!customer) {
      // 신규 고객 생성
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
          totalPoints: 0,
          visitCount: 0,
          regionSido: sidoToShort(store.addressSido) ?? null,
          regionSigungu: store.addressSigungu || null,
        },
      });
    } else {
      // 기존 고객 - 마케팅 동의 업데이트 (true로만)
      await prisma.customer.update({
        where: { id: customer.id },
        data: {
          consentMarketing: true,
          consentAt: customer.consentAt || new Date(),
          // 기존 값이 없는 경우에만 성별/연령대 업데이트
          ...(gender && !customer.gender && { gender }),
          ...(ageGroup && !customer.ageGroup && { ageGroup }),
        },
      });
    }

    // 오늘 날짜의 시작/끝 계산
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // 오늘 이미 방문(포인트 적립)한 적이 있는지 확인
    const todayVisit = await prisma.pointLedger.findFirst({
      where: {
        customerId: customer.id,
        storeId,
        type: 'EARN',
        createdAt: { gte: todayStart, lte: todayEnd },
        // 지연 적립 전환분은 createdAt 이 결제완료 시각이라 방문 판정 근거가 될 수 없다.
        // reason 은 nullable 이라 NOT startsWith 만 쓰면 NULL 행이 통째로 빠진다(NULL LIKE → NULL).
        OR: [{ reason: null }, { reason: { not: { startsWith: DEFERRED_ACCRUAL_REASON_PREFIX } } }],
      },
    });

    // 방문 카운트용: 지연 적립은 EARN 원장을 만들지 않으므로 예약도 함께 봐야 이중 증가하지 않는다.
    const isFirstVisitToday =
      !todayVisit && !(await hasTodayPendingAccrual(storeId, customer.id));
    // 알림톡 FIRST_ONLY 빈도용: "오늘 첫 적립" 기준이므로 EARN 원장만 본다.
    // 알림톡 FIRST_ONLY 는 "오늘 이미 적립 알림톡이 나갔는가" 기준이라 지연 전환분도 포함해서 본다.
    const isFirstEarnToday = !(await hasTodayEarnLedger(storeId, customer.id));
    const newBalance = customer.totalPoints + earnPoints;

    // 포인트 적립 및 고객 정보 업데이트
    const [updatedCustomer, ledger] = await prisma.$transaction([
      prisma.customer.update({
        where: { id: customer.id },
        data: {
          totalPoints: newBalance,
          ...(isFirstVisitToday && { visitCount: { increment: 1 } }),
          lastVisitAt: new Date(),
        },
      }),
      prisma.pointLedger.create({
        data: {
          storeId,
          customerId: customer.id,
          delta: earnPoints,
          balance: newBalance,
          type: 'EARN',
          reason: '태블릿 적립',
        },
      }),
    ]);
    notifyYahwaPointsChange(updatedCustomer.id).catch(() => {});

    // 메타씨티 포인트 동기화 (비동기)
    {
      const storeForMetacity = await prisma.store.findUnique({
        where: { id: storeId },
        select: { id: true, metacityEnabled: true, metacityStoreIdx: true },
      });
      if (storeForMetacity?.metacityEnabled) {
        syncToMetacity({
          store: storeForMetacity,
          customer: updatedCustomer,
          operationType: 'POINT_SAVE',
          orderNo: ledger.id,
          purAmt: 0,
          savePoint: earnPoints,
        }).catch(err => console.error('[Metacity] POINT_SAVE (tablet) sync failed:', err.message));
      }
    }

    // 알림톡 발송 (포인트 적립)
    // 발송 빈도 확인: EVERY_ORDER(매 주문) 또는 FIRST_ONLY(오늘 첫 주문만)
    const frequency = store.pointsAlimtalkFrequency || 'EVERY_ORDER';
    const shouldSendAlimtalk = store.pointsAlimtalkEnabled && (frequency === 'EVERY_ORDER' || (frequency === 'FIRST_ONLY' && isFirstEarnToday));

    if (shouldSendAlimtalk) {
      const phoneNumber = formattedPhone.replace(/[^0-9]/g, '');
      enqueuePointsEarnedAlimTalk({
        storeId,
        customerId: customer.id,
        pointLedgerId: ledger.id,
        phone: phoneNumber,
        variables: {
          storeName: store.name || '매장',
          points: earnPoints,
          totalPoints: newBalance,
        },
      }).catch((err) => {
        console.error('[TabletEarn] AlimTalk enqueue failed:', err);
      });
    }

    res.json({
      success: true,
      customer: {
        id: updatedCustomer.id,
        name: updatedCustomer.name,
        totalPoints: updatedCustomer.totalPoints,
        visitCount: updatedCustomer.visitCount,
      },
      earnedPoints: earnPoints,
      newBalance,
      isNewCustomer,
    });
  } catch (error) {
    console.error('Tablet earn error:', error);
    res.status(500).json({ error: '포인트 적립 중 오류가 발생했습니다.' });
  }
});

// GET /api/points/recent - 최근 적립 내역
router.get('/recent', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { limit = '10' } = req.query;

    const recentLedger = await prisma.pointLedger.findMany({
      where: {
        storeId,
        type: 'EARN',
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string),
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            visitCount: true,
            totalPoints: true,
          },
        },
      },
    });

    const transactions = recentLedger.map((ledger) => ({
      id: ledger.id,
      customerId: ledger.customerId,
      customerName: ledger.customer?.name,
      phone: ledger.customer?.phone,
      points: ledger.delta,
      createdAt: ledger.createdAt,
      isVip:
        ledger.customer &&
        (ledger.customer.visitCount >= 20 || ledger.customer.totalPoints >= 5000),
      isNew: ledger.customer && ledger.customer.visitCount <= 1,
    }));

    res.json({ transactions });
  } catch (error) {
    console.error('Recent points error:', error);
    res.status(500).json({ error: '최근 적립 내역 조회 중 오류가 발생했습니다.' });
  }
});

// ============================================
// 포인트 세션 API (POS-태블릿 연동)
// ============================================

// POST /api/points/session - 포인트 세션 생성 (POS에서 호출)
router.post('/session', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { paymentAmount } = req.body;

    if (!paymentAmount || paymentAmount <= 0) {
      return res.status(400).json({ error: '결제 금액을 입력해주세요.' });
    }

    // 매장 정보 조회 (포인트 적립률)
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { pointRatePercent: true },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    // 포인트 계산
    const earnPoints = Math.round(paymentAmount * store.pointRatePercent / 100);

    if (earnPoints <= 0) {
      return res.status(400).json({ error: '적립 포인트가 0원입니다. 결제금액을 확인해주세요.' });
    }

    // 기존 PENDING 세션 삭제 (1매장 1세션 - 새 세션으로 자동 교체)
    await prisma.pointSession.deleteMany({
      where: {
        storeId,
        status: 'PENDING',
      },
    });

    // 5분 후 만료
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // 새 세션 생성
    const session = await prisma.pointSession.create({
      data: {
        storeId,
        paymentAmount,
        earnPoints,
        expiresAt,
      },
    });

    res.json({
      success: true,
      session: {
        id: session.id,
        paymentAmount: session.paymentAmount,
        earnPoints: session.earnPoints,
        expiresAt: session.expiresAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json({ error: '세션 생성 중 오류가 발생했습니다.' });
  }
});

// GET /api/points/session/current - 현재 활성 세션 조회 (태블릿에서 polling)
router.get('/session/current', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const now = new Date();

    // PENDING 상태이면서 미만료인 세션 조회
    const session = await prisma.pointSession.findFirst({
      where: {
        storeId,
        status: 'PENDING',
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!session) {
      return res.json({ session: null });
    }

    res.json({
      session: {
        id: session.id,
        paymentAmount: session.paymentAmount,
        earnPoints: session.earnPoints,
        remainingSeconds: Math.max(0, Math.floor((session.expiresAt.getTime() - now.getTime()) / 1000)),
      },
    });
  } catch (error) {
    console.error('Get current session error:', error);
    res.status(500).json({ error: '세션 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/points/session/:id/complete - 세션 완료 (태블릿에서 적립 시)
router.post('/session/:id/complete', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { id: sessionId } = req.params;
    const { phone, marketingConsent, gender, ageGroup } = req.body;

    // 마케팅 동의 필수 체크
    if (marketingConsent !== true) {
      return res.status(400).json({ error: '마케팅 정보 수신 동의가 필요합니다.' });
    }

    if (!phone) {
      return res.status(400).json({ error: '전화번호를 입력해주세요.' });
    }

    // 세션 조회 및 유효성 검사
    const session = await prisma.pointSession.findFirst({
      where: {
        id: sessionId,
        storeId,
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
    });

    if (!session) {
      return res.status(404).json({ error: '유효한 세션이 없습니다. 사장님에게 다시 요청해주세요.' });
    }

    // 전화번호 정규화
    const phoneDigits = phone.replace(/[^0-9]/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 11) {
      return res.status(400).json({ error: '올바른 전화번호 형식이 아닙니다.' });
    }

    const phoneLastDigits = phoneDigits.slice(-8);
    const formattedPhone = phoneDigits.length === 11
      ? `${phoneDigits.slice(0, 3)}-${phoneDigits.slice(3, 7)}-${phoneDigits.slice(7)}`
      : `${phoneDigits.slice(0, 3)}-${phoneDigits.slice(3, 6)}-${phoneDigits.slice(6)}`;

    // 매장 정보 조회 (지역 정보 포함)
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: {
        name: true,
        pointsAlimtalkEnabled: true,
        pointsAlimtalkFrequency: true,
        addressSido: true,
        addressSigungu: true,
      },
    });

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
          totalPoints: 0,
          visitCount: 0,
          regionSido: sidoToShort(store?.addressSido ?? null),
          regionSigungu: store?.addressSigungu || null,
        },
      });
    } else {
      // 기존 고객 - 마케팅 동의 업데이트
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

    // 오늘 방문 체크
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const todayVisit = await prisma.pointLedger.findFirst({
      where: {
        customerId: customer.id,
        storeId,
        type: 'EARN',
        createdAt: { gte: todayStart, lte: todayEnd },
        // 지연 적립 전환분은 createdAt 이 결제완료 시각이라 방문 판정 근거가 될 수 없다.
        // reason 은 nullable 이라 NOT startsWith 만 쓰면 NULL 행이 통째로 빠진다(NULL LIKE → NULL).
        OR: [{ reason: null }, { reason: { not: { startsWith: DEFERRED_ACCRUAL_REASON_PREFIX } } }],
      },
    });

    // 방문 카운트용: 지연 적립은 EARN 원장을 만들지 않으므로 예약도 함께 봐야 이중 증가하지 않는다.
    const isFirstVisitToday =
      !todayVisit && !(await hasTodayPendingAccrual(storeId, customer.id));
    // 알림톡 FIRST_ONLY 빈도용: "오늘 첫 적립" 기준이므로 EARN 원장만 본다.
    // 알림톡 FIRST_ONLY 는 "오늘 이미 적립 알림톡이 나갔는가" 기준이라 지연 전환분도 포함해서 본다.
    const isFirstEarnToday = !(await hasTodayEarnLedger(storeId, customer.id));
    const newBalance = customer.totalPoints + session.earnPoints;

    // 트랜잭션: 포인트 적립 + 고객 업데이트 + 세션 완료
    const [updatedCustomer, ledger] = await prisma.$transaction([
      prisma.customer.update({
        where: { id: customer.id },
        data: {
          totalPoints: newBalance,
          ...(isFirstVisitToday && { visitCount: { increment: 1 } }),
          lastVisitAt: new Date(),
        },
      }),
      prisma.pointLedger.create({
        data: {
          storeId,
          customerId: customer.id,
          delta: session.earnPoints,
          balance: newBalance,
          type: 'EARN',
          reason: '태블릿 적립',
        },
      }),
    ]);
    notifyYahwaPointsChange(updatedCustomer.id).catch(() => {});

    // 세션 완료 처리
    await prisma.pointSession.update({
      where: { id: sessionId },
      data: {
        status: 'COMPLETED',
        customerId: customer.id,
        completedAt: new Date(),
      },
    });

    // 메타씨티 포인트 동기화 (비동기)
    {
      const storeForMetacity = await prisma.store.findUnique({
        where: { id: storeId },
        select: { id: true, metacityEnabled: true, metacityStoreIdx: true },
      });
      if (storeForMetacity?.metacityEnabled) {
        syncToMetacity({
          store: storeForMetacity,
          customer: updatedCustomer,
          operationType: 'POINT_SAVE',
          orderNo: ledger.id,
          purAmt: session.paymentAmount,
          savePoint: session.earnPoints,
        }).catch(err => console.error('[Metacity] POINT_SAVE (session) sync failed:', err.message));
      }
    }

    // 알림톡 발송
    // 발송 빈도 확인: EVERY_ORDER(매 주문) 또는 FIRST_ONLY(오늘 첫 주문만)
    const sessionFrequency = store?.pointsAlimtalkFrequency || 'EVERY_ORDER';
    const shouldSendSessionAlimtalk = store?.pointsAlimtalkEnabled && (sessionFrequency === 'EVERY_ORDER' || (sessionFrequency === 'FIRST_ONLY' && isFirstEarnToday));

    if (shouldSendSessionAlimtalk) {
      const phoneNumber = formattedPhone.replace(/[^0-9]/g, '');
      enqueuePointsEarnedAlimTalk({
        storeId,
        customerId: customer.id,
        pointLedgerId: ledger.id,
        phone: phoneNumber,
        variables: {
          storeName: store?.name || '매장',
          points: session.earnPoints,
          totalPoints: newBalance,
        },
      }).catch((err) => {
        console.error('[Session] AlimTalk enqueue failed:', err);
      });
    }

    res.json({
      success: true,
      customer: {
        id: updatedCustomer.id,
        name: updatedCustomer.name,
        totalPoints: updatedCustomer.totalPoints,
        visitCount: updatedCustomer.visitCount,
      },
      earnedPoints: session.earnPoints,
      newBalance,
      isNewCustomer,
    });
  } catch (error) {
    console.error('Complete session error:', error);
    res.status(500).json({ error: '포인트 적립 중 오류가 발생했습니다.' });
  }
});

// DELETE /api/points/session - 세션 취소 (POS에서 호출)
router.delete('/session', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;

    // 현재 PENDING 세션 취소
    const result = await prisma.pointSession.updateMany({
      where: {
        storeId,
        status: 'PENDING',
      },
      data: {
        status: 'CANCELLED',
      },
    });

    res.json({
      success: true,
      cancelledCount: result.count,
    });
  } catch (error) {
    console.error('Cancel session error:', error);
    res.status(500).json({ error: '세션 취소 중 오류가 발생했습니다.' });
  }
});

export default router;
