import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { enqueuePointsEarnedAlimTalk, enqueueNaverReviewAlimTalk, enqueuePointsUsedAlimTalk } from '../services/solapi.js';

const router = Router();

// POST /api/points/earn - 포인트 적립
router.post('/earn', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { phone, customerId, points, orderId } = req.body;
    const storeId = req.user!.storeId;
    const staffUserId = req.user!.id;

    if (!points || points <= 0) {
      return res.status(400).json({ error: '적립할 포인트를 입력해주세요.' });
    }

    let customer;

    // Find or create customer
    if (customerId) {
      customer = await prisma.customer.findFirst({
        where: { id: customerId, storeId },
      });
    } else if (phone) {
      // Normalize phone to last 8 digits
      const phoneLastDigits = phone.replace(/[^0-9]/g, '').slice(-8);

      customer = await prisma.customer.findFirst({
        where: { storeId, phoneLastDigits },
      });

      // Create new customer if not found
      if (!customer) {
        customer = await prisma.customer.create({
          data: {
            storeId,
            phoneLastDigits,
            phone: `010-${phoneLastDigits.slice(0, 4)}-${phoneLastDigits.slice(4)}`,
            totalPoints: 0,
            visitCount: 0,
          },
        });
      }
    } else {
      return res.status(400).json({ error: '전화번호 또는 고객 ID가 필요합니다.' });
    }

    if (!customer) {
      return res.status(404).json({ error: '고객을 찾을 수 없습니다.' });
    }

    // Update customer points and visit count
    const newBalance = customer.totalPoints + points;

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
        createdAt: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
    });

    const isFirstVisitToday = !todayVisit;

    const [updatedCustomer, ledger] = await prisma.$transaction([
      prisma.customer.update({
        where: { id: customer.id },
        data: {
          totalPoints: newBalance,
          // 오늘 첫 방문인 경우에만 visitCount 증가
          ...(isFirstVisitToday && { visitCount: { increment: 1 } }),
          lastVisitAt: new Date(),
        },
      }),
      prisma.pointLedger.create({
        data: {
          storeId,
          customerId: customer.id,
          staffUserId,
          delta: points,
          balance: newBalance,
          type: 'EARN',
          reason: '방문 적립',
          orderId,
        },
      }),
    ]);

    // Create visit record if orderId provided
    if (orderId) {
      await prisma.visitOrOrder.upsert({
        where: {
          storeId_orderId: { storeId, orderId },
        },
        create: {
          storeId,
          customerId: customer.id,
          orderId,
          visitedAt: new Date(),
        },
        update: {},
      });
    }

    // 알림톡 발송 (비동기 - 실패해도 응답에 영향 없음)
    if (updatedCustomer.phone) {
      const store = await prisma.store.findUnique({
        where: { id: storeId },
        select: { name: true },
      });

      const phoneNumber = updatedCustomer.phone.replace(/[^0-9]/g, '');

      // 1. 포인트 적립 알림톡
      enqueuePointsEarnedAlimTalk({
        storeId,
        customerId: customer.id,
        pointLedgerId: ledger.id,
        phone: phoneNumber,
        variables: {
          storeName: store?.name || '매장',
          points,
          totalPoints: newBalance,
        },
      }).catch((err) => {
        console.error('[Points] AlimTalk enqueue failed:', err);
      });

      // 2. 네이버 리뷰 요청 알림톡 (자동 발송 설정이 활성화된 경우)
      // 포인트 적립 알림톡 이후에 발송되도록 5초 지연
      const reviewSetting = await prisma.reviewAutomationSetting.findUnique({
        where: { storeId },
      });

      console.log('[Points] Review setting:', {
        enabled: reviewSetting?.enabled,
        naverReviewUrl: reviewSetting?.naverReviewUrl,
        benefitText: reviewSetting?.benefitText,
      });

      if (reviewSetting?.enabled && reviewSetting?.naverReviewUrl) {
        console.log('[Points] Sending Naver review alimtalk with 5s delay...');
        const delayedScheduleAt = new Date(Date.now() + 5000); // 5초 후 발송
        enqueueNaverReviewAlimTalk({
          storeId,
          customerId: customer.id,
          phone: phoneNumber,
          variables: {
            storeName: store?.name || '매장',
            benefitText: reviewSetting.benefitText || '',
          },
          scheduledAt: delayedScheduleAt,
        }).catch((err) => {
          console.error('[Points] Review AlimTalk enqueue failed:', err);
        });
      } else {
        console.log('[Points] Skipping Naver review alimtalk - not enabled or no URL');
      }
    }

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

    if (!customerId) {
      return res.status(400).json({ error: '고객 ID가 필요합니다.' });
    }

    if (!points || points <= 0) {
      return res.status(400).json({ error: '사용할 포인트를 입력해주세요.' });
    }

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, storeId },
    });

    if (!customer) {
      return res.status(404).json({ error: '고객을 찾을 수 없습니다.' });
    }

    if (customer.totalPoints < points) {
      return res.status(400).json({ error: '보유 포인트가 부족합니다.' });
    }

    const newBalance = customer.totalPoints - points;

    const [updatedCustomer, ledger] = await prisma.$transaction([
      prisma.customer.update({
        where: { id: customer.id },
        data: {
          totalPoints: newBalance,
        },
      }),
      prisma.pointLedger.create({
        data: {
          storeId,
          customerId: customer.id,
          staffUserId,
          delta: -points,
          balance: newBalance,
          type: 'USE',
          reason: reason || '포인트 사용',
        },
      }),
    ]);

    // 포인트 사용 알림톡 발송 (비동기 - 실패해도 응답에 영향 없음)
    if (updatedCustomer.phone) {
      const store = await prisma.store.findUnique({
        where: { id: storeId },
        select: { name: true },
      });

      const phoneNumber = updatedCustomer.phone.replace(/[^0-9]/g, '');

      enqueuePointsUsedAlimTalk({
        storeId,
        customerId: customer.id,
        pointLedgerId: ledger.id,
        phone: phoneNumber,
        variables: {
          storeName: store?.name || '매장',
          usedPoints: points,
          remainingPoints: newBalance,
        },
      }).catch((err) => {
        console.error('[Points] Points used AlimTalk enqueue failed:', err);
      });
    }

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

    // 전화번호 정규화 (숫자만 추출)
    const phoneDigits = phone.replace(/[^0-9]/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 11) {
      return res.status(400).json({ error: '올바른 전화번호 형식이 아닙니다.' });
    }

    const phoneLastDigits = phoneDigits.slice(-8);
    const formattedPhone = phoneDigits.length === 11
      ? `${phoneDigits.slice(0, 3)}-${phoneDigits.slice(3, 7)}-${phoneDigits.slice(7)}`
      : `${phoneDigits.slice(0, 3)}-${phoneDigits.slice(3, 6)}-${phoneDigits.slice(6)}`;

    // 매장 정보 조회 (적립률, 이름)
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true, pointRatePercent: true, pointsAlimtalkEnabled: true },
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
      },
    });

    const isFirstVisitToday = !todayVisit;
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

    // 알림톡 발송 (포인트 적립)
    if (store.pointsAlimtalkEnabled) {
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
      earnedPoints,
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

export default router;
