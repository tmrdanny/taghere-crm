import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { webhookAuthMiddleware, WebhookRequest } from '../middleware/webhook-auth.js';
import { maskPhone } from '../utils/masking.js';
import { syncToMetacity } from '../services/metacity.js';
import { sidoToShort } from '../utils/address-parser.js';

const router = Router();

/**
 * POST /api/taghere/webhook/point/customer-search
 *
 * MagicPos 포인트 연동: 고객 검색 + 포인트 조회
 * - 전화번호로 고객 검색
 * - MetaCity 연동 매장이면 MetaCity에서 조회/생성 후 로컬 고객 생성
 */
router.post('/customer-search', webhookAuthMiddleware, async (req: WebhookRequest, res) => {
  try {
    const { storeSlug, phone } = req.body;

    // 1. 파라미터 검증
    if (!storeSlug || !phone) {
      return res.status(400).json({
        success: false,
        error: 'missing_params',
        message: 'storeSlug, phone은 필수입니다.',
      });
    }

    // 2. 매장 조회
    const store = await prisma.store.findFirst({
      where: { slug: storeSlug },
      select: {
        id: true,
        name: true,
        pointRatePercent: true,
        metacityEnabled: true,
        metacityStoreIdx: true,
        addressSido: true,
        addressSigungu: true,
      },
    });

    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'store_not_found',
        message: '매장을 찾을 수 없습니다.',
      });
    }

    // 3. 전화번호 정규화
    const phoneDigits = phone.replace(/[^0-9]/g, '');
    // +82 국제번호 처리
    let normalizedDigits = phoneDigits;
    if (normalizedDigits.startsWith('82') && normalizedDigits.length >= 11) {
      normalizedDigits = '0' + normalizedDigits.slice(2);
    }
    const phoneLastDigits = normalizedDigits.slice(-8);

    // 4. 고객 검색
    let isNewCustomer = false;
    let customer = await prisma.customer.findFirst({
      where: {
        storeId: store.id,
        phoneLastDigits,
      },
    });

    // 5. 고객이 없는 경우: 로컬 고객 생성 (MetaCity 동기화는 포인트 트랜잭션 시 syncToMetacity가 처리)
    if (!customer) {
      isNewCustomer = true;
      const formattedPhone = normalizedDigits.length === 11
        ? `${normalizedDigits.slice(0, 3)}-${normalizedDigits.slice(3, 7)}-${normalizedDigits.slice(7)}`
        : normalizedDigits;

      customer = await prisma.customer.create({
        data: {
          storeId: store.id,
          phone: formattedPhone,
          phoneLastDigits,
          totalPoints: 0,
          visitCount: 0,
          regionSido: sidoToShort(store.addressSido ?? null),
          regionSigungu: store.addressSigungu || null,
          consentMarketing: true,
          consentAt: new Date(),
        },
      });

      console.log(`[Point Webhook] Customer created locally - customerId: ${customer.id}, storeId: ${store.id}`);
    }

    // 6. 총 누적 포인트 계산 (EARN 타입 합산)
    const totalAccumulated = await prisma.pointLedger.aggregate({
      where: {
        customerId: customer.id,
        storeId: store.id,
        type: 'EARN',
      },
      _sum: { delta: true },
    });
    const totalPoint = totalAccumulated._sum.delta || 0;

    // 7. 응답
    res.json({
      success: true,
      data: {
        crmCustomerId: customer.id,
        custName: customer.name || '고객',
        phone: maskPhone(customer.phone),
        ablePoint: customer.totalPoints,
        totalPoint,
        saveRatePercent: store.pointRatePercent,
        grade: null,
        isNewCustomer,
      },
    });
  } catch (error: any) {
    console.error('[Point Webhook] Customer search error:', error);
    res.status(500).json({
      success: false,
      error: 'server_error',
      message: '고객 검색 중 오류가 발생했습니다.',
    });
  }
});

/**
 * POST /api/taghere/webhook/point/transaction
 *
 * MagicPos 포인트 연동: 포인트 적립/사용 트랜잭션
 * - 주문 완료 시 포인트 사용 + 적립 처리
 * - MetaCity 연동 매장이면 동기화
 */
router.post('/transaction', webhookAuthMiddleware, async (req: WebhookRequest, res) => {
  try {
    const { storeSlug, crmCustomerId, orderId, purAmt, usedPoint } = req.body;

    // 1. 파라미터 검증
    if (!storeSlug || !crmCustomerId || !orderId || purAmt === undefined) {
      return res.status(400).json({
        success: false,
        error: 'missing_params',
        message: 'storeSlug, crmCustomerId, orderId, purAmt는 필수입니다.',
      });
    }

    // 2. 매장 조회
    const store = await prisma.store.findFirst({
      where: { slug: storeSlug },
      select: {
        id: true,
        name: true,
        pointRatePercent: true,
        metacityEnabled: true,
        metacityStoreIdx: true,
      },
    });

    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'store_not_found',
        message: '매장을 찾을 수 없습니다.',
      });
    }

    // 3. 고객 조회
    const customer = await prisma.customer.findFirst({
      where: {
        id: crmCustomerId,
        storeId: store.id,
      },
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'customer_not_found',
        message: '고객을 찾을 수 없습니다.',
      });
    }

    // 4. 멱등성 체크: 동일 orderId로 이미 처리된 건이 있으면 이전 결과 반환
    const existingLedger = await prisma.pointLedger.findFirst({
      where: {
        customerId: customer.id,
        storeId: store.id,
        orderId,
      },
    });

    if (existingLedger) {
      console.log(`[Point Webhook] 이미 처리된 주문, 기존 결과 반환: orderId=${orderId}`);
      // 해당 orderId의 적립/사용 합산
      const ledgers = await prisma.pointLedger.findMany({
        where: { customerId: customer.id, storeId: store.id, orderId },
      });
      const savedPoint = ledgers.filter(l => l.type === 'EARN').reduce((sum, l) => sum + l.delta, 0);
      const usedPointResult = Math.abs(ledgers.filter(l => l.type === 'USE').reduce((sum, l) => sum + l.delta, 0));
      return res.json({
        success: true,
        data: {
          savedPoint,
          usedPoint: usedPointResult,
          balance: customer.totalPoints,
        },
      });
    }

    // 5. 적립 포인트 계산
    const savePoint = Math.round(purAmt * store.pointRatePercent / 100);
    const effectiveUsedPoint = usedPoint || 0;

    // 6. 포인트 사용 검증
    if (effectiveUsedPoint > 0 && customer.totalPoints < effectiveUsedPoint) {
      return res.status(400).json({
        success: false,
        error: 'insufficient_points',
        message: '보유 포인트가 부족합니다.',
      });
    }

    // 7. 오늘 첫 방문인지 확인
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const todayVisit = await prisma.pointLedger.findFirst({
      where: {
        customerId: customer.id,
        storeId: store.id,
        type: 'EARN',
        createdAt: { gte: todayStart, lte: todayEnd },
      },
    });
    const isFirstVisitToday = !todayVisit;

    // 8. 트랜잭션 처리
    let currentBalance = customer.totalPoints;
    const transactionOps: any[] = [];

    // 8-1. 포인트 사용
    if (effectiveUsedPoint > 0) {
      currentBalance -= effectiveUsedPoint;
      transactionOps.push(
        prisma.pointLedger.create({
          data: {
            storeId: store.id,
            customerId: customer.id,
            delta: -effectiveUsedPoint,
            balance: currentBalance,
            type: 'USE',
            reason: `MagicPos 포인트 사용 (orderId: ${orderId})`,
            orderId,
          },
        }),
      );
    }

    // 8-2. 포인트 적립
    if (savePoint > 0) {
      currentBalance += savePoint;
      transactionOps.push(
        prisma.pointLedger.create({
          data: {
            storeId: store.id,
            customerId: customer.id,
            delta: savePoint,
            balance: currentBalance,
            type: 'EARN',
            reason: `MagicPos 포인트 적립 (orderId: ${orderId})`,
            orderId,
          },
        }),
      );
    }

    // 8-3. 고객 포인트 + 방문횟수 업데이트
    transactionOps.push(
      prisma.customer.update({
        where: { id: customer.id },
        data: {
          totalPoints: currentBalance,
          ...(isFirstVisitToday && { visitCount: { increment: 1 } }),
          lastVisitAt: new Date(),
        },
      }),
    );

    // 8-4. 주문 내역 기록 (upsert: 동일 orderId 재요청 시 중복 방지)
    transactionOps.push(
      prisma.visitOrOrder.upsert({
        where: {
          storeId_orderId: {
            storeId: store.id,
            orderId,
          },
        },
        update: {},
        create: {
          storeId: store.id,
          customerId: customer.id,
          orderId,
          visitedAt: new Date(),
          totalAmount: purAmt > 0 ? purAmt : null,
        },
      }),
    );

    await prisma.$transaction(transactionOps);

    console.log(`[Point Webhook] Transaction completed - customerId: ${customer.id}, storeId: ${store.id}, usedPoint: ${effectiveUsedPoint}, savePoint: ${savePoint}, balance: ${currentBalance}`);

    // 8. MetaCity 동기화 (비동기)
    if (store.metacityEnabled && store.metacityStoreIdx) {
      const latestCustomer = await prisma.customer.findUnique({
        where: { id: customer.id },
      });

      if (latestCustomer) {
        const latestLedger = await prisma.pointLedger.findFirst({
          where: { customerId: customer.id },
          orderBy: { createdAt: 'desc' },
        });

        // POINT_COMBINE: 사용 + 적립 동시 처리
        syncToMetacity({
          store: { id: store.id, metacityEnabled: store.metacityEnabled, metacityStoreIdx: store.metacityStoreIdx },
          customer: latestCustomer,
          operationType: 'POINT_COMBINE',
          orderNo: latestLedger?.id || orderId,
          purAmt: purAmt > 0 ? purAmt : 0,
          usedPoint: effectiveUsedPoint,
          savePoint,
        }).catch(err => console.error('[Metacity] POINT_COMBINE (point-webhook) sync failed:', err.message));
      }
    }

    // 9. 응답
    res.json({
      success: true,
      data: {
        savedPoint: savePoint,
        usedPoint: effectiveUsedPoint,
        balance: currentBalance,
      },
    });
  } catch (error: any) {
    console.error('[Point Webhook] Transaction error:', error);
    res.status(500).json({
      success: false,
      error: 'server_error',
      message: '포인트 트랜잭션 처리 중 오류가 발생했습니다.',
    });
  }
});

export default router;
