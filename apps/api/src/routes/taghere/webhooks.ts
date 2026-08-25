import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma.js';
import { isValidWebhookToken } from '../../services/taghere-api.js';
import { syncToMetacity } from '../../services/metacity.js';
import {
  cancelPendingAccrualByOrderId,
  finalizePendingAccrual,
} from '../../services/pending-point-accrual.js';
import {
  cancelPendingStampAccrualByOrderId,
  finalizePendingStampAccrual,
} from '../../services/pending-stamp-accrual.js';

const router = Router();

// 웹훅 인증 미들웨어
interface WebhookRequest extends Request {
  webhookVerified?: boolean;
}

const webhookAuthMiddleware = (req: WebhookRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Authorization header required',
      message: 'Bearer 토큰이 필요합니다.'
    });
  }

  const token = authHeader.split(' ')[1];

  if (!isValidWebhookToken(token)) {
    return res.status(403).json({
      success: false,
      error: 'Invalid token',
      message: '유효하지 않은 토큰입니다.'
    });
  }

  req.webhookVerified = true;
  next();
};

// ============================================================
// 웹훅 API: 주문 취소/환불 시 포인트 차감
// ============================================================

/**
 * POST /api/taghere/webhook/order-cancel
 *
 * 태그히어 모바일오더에서 주문이 취소/환불되었을 때 호출하는 웹훅
 * - 해당 ordersheetId로 적립된 포인트를 찾아서 차감
 * - 관련 주문 내역도 삭제
 *
 * Request Body:
 * {
 *   "ordersheetId": "6666",           // V1: 취소된 주문 ID
 *   "orderId": "6666",               // V2: 취소된 주문 ID (ordersheetId와 택 1)
 *   "reason": "고객 요청 환불",        // 선택: 취소/환불 사유
 *   "cancelType": "CANCEL" | "REFUND" // 선택: 취소 유형 (기본값: CANCEL)
 * }
 */
router.post('/webhook/order-cancel', webhookAuthMiddleware, async (req: WebhookRequest, res) => {
  const startTime = Date.now();

  try {
    const ordersheetId = req.body.ordersheetId || req.body.orderId;
    const { reason, cancelType = 'CANCEL' } = req.body;

    // 1. 필수 파라미터 검증
    if (!ordersheetId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field',
        message: 'ordersheetId 또는 orderId는 필수입니다.'
      });
    }

    console.log(`[Webhook] Order cancel request - ordersheetId: ${ordersheetId}, type: ${cancelType}, reason: ${reason || 'N/A'}`);

    // 1-5. 적립 예약 파기 (아직 적립 전이라 회수할 원장이 없다 → ADJUST 불필요)
    //      원장 조회보다 먼저 해야 한다. 뒤에 두면 그 사이 결제완료 통보/타임아웃 워커가 전환을 커밋했을 때
    //      원장 스냅샷에는 EARN 이 없고 파기도 0건이라 404 로 빠져 방금 적립된 포인트를 회수하지 못한다.
    //      전환이 먼저 커밋된 경우 여기서는 no-op 이 되고, 아래 원장 조회가 새 EARN 을 잡아 정상 회수된다.
    //      파기했더라도 지연 적립의 포인트 "사용"은 즉시 처리됐을 수 있으므로 여기서 return 하지 않고
    //      아래 기존 흐름을 계속 타서 USE 복원까지 처리하게 둔다.
    const canceledPending = await cancelPendingAccrualByOrderId(ordersheetId);
    // 스탬프 예약도 같은 이유로 파기한다. 스탬프는 취소 회수(ADJUST) 경로가 없어
    // 아래 원장 흐름을 타지 않으므로, 방문 기록 정리를 위해 대상만 합쳐서 쓴다.
    const canceledStampPending = await cancelPendingStampAccrualByOrderId(ordersheetId);
    const canceledAnyPending = [...canceledPending, ...canceledStampPending];

    // 2. 해당 ordersheetId로 포인트 내역 조회 (EARN + USE 모두)
    const ledgerRecords = await prisma.pointLedger.findMany({
      where: {
        OR: [
          { orderId: ordersheetId },
          { reason: { contains: ordersheetId } }
        ],
        type: { in: ['EARN', 'USE'] },
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            totalPoints: true
          }
        },
        store: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    const earnRecord = ledgerRecords.find(r => r.type === 'EARN');
    const useRecord = ledgerRecords.find(r => r.type === 'USE');

    // 3. 관련 내역이 없는 경우
    if (!earnRecord && !useRecord) {
      // 재취소 멱등: 이미 파기된 예약만 있는 주문은 이번 호출에서 파기 0건이라 아래 분기를 못 탄다.
      // 404 로 응답하면 주문 서비스가 취소 통보 실패로 로깅하므로 성공으로 응답한다.
      if (canceledAnyPending.length === 0) {
        const [alreadyCanceled, alreadyCanceledStamp] = await Promise.all([
          prisma.pendingPointAccrual.findFirst({
            where: { orderId: ordersheetId, status: 'CANCELED' },
            select: { id: true },
          }),
          prisma.pendingStampAccrual.findFirst({
            where: { orderId: ordersheetId, status: 'CANCELED' },
            select: { id: true },
          }),
        ]);
        if (alreadyCanceled || alreadyCanceledStamp) {
          return res.json({
            success: true,
            canceledPending: true,
            ordersheetId,
            message: '이미 취소된 적립 예약입니다.',
          });
        }
      }

      // 예약만 있고 원장이 없던 주문 → 정상적으로 파기 완료. 404 로 응답하면 주문 서비스가 실패로 로깅한다.
      if (canceledAnyPending.length > 0) {
        // 방문 기록은 예약 시점에 이미 만들어졌다. 아래 기존 취소 흐름(5-4)을 타지 못하고
        // 여기서 반환하므로, 동일한 시맨틱으로 직접 지운다.
        // 예약은 이미 CANCELED 라 재시도해도 파기 0건 → 404 로 빠진다. 삭제 실패로 500 을 내면
        // 그 재시도 함정에 걸리므로, 실패는 로깅만 하고 취소 자체는 성공으로 응답한다.
        try {
          for (const { storeId, customerId } of canceledAnyPending) {
            await prisma.visitOrOrder.deleteMany({
              where: { storeId, customerId, orderId: ordersheetId },
            });
          }
        } catch (err) {
          console.error(
            `[Webhook] Canceled pending accrual - visitOrOrder 삭제 실패 ordersheetId: ${ordersheetId}`,
            err,
          );
        }

        console.log(`[Webhook] Canceled pending accrual (no ledger) - ordersheetId: ${ordersheetId}`);
        return res.json({
          success: true,
          canceledPending: true,
          ordersheetId,
          message: '적립 예약이 취소되었습니다.',
        });
      }

      console.log(`[Webhook] No point record found for ordersheetId: ${ordersheetId}`);
      return res.status(404).json({
        success: false,
        error: 'Point record not found',
        message: `ordersheetId(${ordersheetId})에 해당하는 포인트 내역을 찾을 수 없습니다.`,
        ordersheetId
      });
    }

    const referenceRecord = earnRecord || useRecord!;
    const { customer, store } = referenceRecord;
    const earnedPoints = earnRecord?.delta ?? 0; // 양수 (적립된 금액)
    const usedPoints = useRecord ? Math.abs(useRecord.delta) : 0; // 양수 (사용한 금액)

    // 4. 이미 차감되었는지 확인 (중복 처리 방지)
    //
    // NOTE reason 문자열만 보면 안 된다. 사용환원 원장의 reason 은 `주문취소(사용환원): {id}` 라
    //      `주문취소: {id}` 를 포함하지 않고, 적립 원장이 없는 주문(지연 적립 예약만 있고 포인트는
    //      사용한 경우)은 적립취소 ADJUST 자체가 안 만들어져 가드 레코드가 영영 생기지 않는다.
    //      그 상태로 취소 웹훅이 재전송되면 사용분이 호출 횟수만큼 반복 환급된다.
    //      두 ADJUST 모두 orderId 를 채우므로 그것을 1차 기준으로 삼고,
    //      orderId 가 비어 있을 수 있는 과거 데이터는 기존 reason 매칭으로 함께 커버한다.
    const existingDeduction = await prisma.pointLedger.findFirst({
      where: {
        customerId: customer.id,
        storeId: store.id,
        type: 'ADJUST',
        OR: [
          { orderId: ordersheetId },
          { reason: { contains: `주문취소: ${ordersheetId}` } },
          { reason: { contains: `주문취소(사용환원): ${ordersheetId}` } },
        ],
      }
    });

    if (existingDeduction) {
      console.log(`[Webhook] Already processed - ordersheetId: ${ordersheetId}`);
      return res.status(409).json({
        success: false,
        error: 'Already processed',
        message: `ordersheetId(${ordersheetId})는 이미 취소 처리되었습니다.`,
        ordersheetId,
        previousDeductionId: existingDeduction.id,
        deductedAt: existingDeduction.createdAt
      });
    }

    // 5. 트랜잭션으로 포인트 차감/환원 + 고객 포인트 업데이트 + 주문 내역 삭제
    const cancelTypeLabel = cancelType === 'REFUND' ? '환불' : '취소';
    const newBalance = Math.max(0, customer.totalPoints - earnedPoints + usedPoints);

    const result = await prisma.$transaction(async (tx) => {
      let currentBalance = customer.totalPoints;

      // 5-1. 적립 취소 (EARN → ADJUST -N)
      if (earnedPoints > 0) {
        currentBalance -= earnedPoints;
        await tx.pointLedger.create({
          data: {
            storeId: store.id,
            customerId: customer.id,
            delta: -earnedPoints,
            balance: Math.max(0, currentBalance),
            type: 'ADJUST',
            reason: reason
              ? `주문취소: ${ordersheetId} (${cancelTypeLabel} - ${reason})`
              : `주문취소: ${ordersheetId} (${cancelTypeLabel})`,
            orderId: ordersheetId,
          }
        });
      }

      // 5-2. 사용 환원 (USE → ADJUST +N)
      if (usedPoints > 0) {
        currentBalance += usedPoints;
        await tx.pointLedger.create({
          data: {
            storeId: store.id,
            customerId: customer.id,
            delta: usedPoints,
            balance: Math.max(0, currentBalance),
            type: 'ADJUST',
            reason: `주문취소(사용환원): ${ordersheetId} (${cancelTypeLabel})`,
            orderId: ordersheetId,
          }
        });
      }

      // 5-3. 고객 총 포인트 업데이트
      const updatedCustomer = await tx.customer.update({
        where: { id: customer.id },
        data: { totalPoints: newBalance }
      });

      // 5-4. 관련 주문 내역 삭제 (있는 경우)
      const deletedVisit = await tx.visitOrOrder.deleteMany({
        where: {
          storeId: store.id,
          customerId: customer.id,
          orderId: ordersheetId
        }
      });

      return { updatedCustomer, deletedVisitCount: deletedVisit.count };
    });

    const processingTime = Date.now() - startTime;

    console.log(`[Webhook] Order cancel completed - ordersheetId: ${ordersheetId}, earnReversed: ${earnedPoints}P, useReturned: ${usedPoints}P, newBalance: ${newBalance}P, time: ${processingTime}ms`);

    // 메타씨티 포인트 취소 동기화 (비동기)
    {
      const storeForMetacity = await prisma.store.findUnique({
        where: { id: store.id },
        select: { id: true, metacityEnabled: true, metacityStoreIdx: true },
      });
      if (storeForMetacity?.metacityEnabled && (earnedPoints > 0 || usedPoints > 0)) {
        const cancelOrderNo = earnRecord?.id || useRecord?.id || ordersheetId;
        const metacityOperationType = (earnedPoints > 0 && usedPoints > 0)
          ? 'POINT_COMBINE_CANCEL'
          : 'POINT_SAVE_CANCEL';
        syncToMetacity({
          store: storeForMetacity,
          customer: result.updatedCustomer,
          operationType: metacityOperationType,
          orderNo: cancelOrderNo,
          purAmt: 0,
          savePoint: earnedPoints,
          usedPoint: usedPoints,
        }).catch(err => console.error(`[Metacity] ${metacityOperationType} (webhook) sync failed:`, err.message));
      }
    }

    // 6. 성공 응답
    res.json({
      success: true,
      message: '주문 취소 처리가 완료되었습니다.',
      data: {
        ordersheetId,
        cancelType,
        store: {
          id: store.id,
          name: store.name
        },
        customer: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone ? `${customer.phone.slice(0, 3)}****${customer.phone.slice(-4)}` : null
        },
        points: {
          earnReversed: earnedPoints,
          useReturned: usedPoints,
          previousBalance: customer.totalPoints,
          newBalance: result.updatedCustomer.totalPoints
        },
        deletedOrderCount: result.deletedVisitCount,
        processedAt: new Date().toISOString(),
        processingTimeMs: processingTime
      }
    });

  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    console.error(`[Webhook] Order cancel error - time: ${processingTime}ms`, error);

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: '주문 취소 처리 중 오류가 발생했습니다.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/** order-paid 웹훅 1회 처리 상한. 한 결제 신호가 잡는 후불 주문은 많아야 수십 건이다. */
const ORDER_PAID_MAX_BATCH = 200;

/**
 * POST /api/taghere/webhook/order-paid
 *
 * 후불 주문 POS 결제완료 통보 → 적립 예약을 실제 적립으로 전환한다.
 * 주문 서비스(V1/V2)가 결제완료를 감지한 모든 주문에 대해 호출하므로,
 * 예약이 없는 주문(대다수)은 정상적인 no-op 이다 — 주문별 에러 로그를 남기지 않는다.
 *
 * Body:
 * {
 *   "storeSlug": "my-store",
 *   "orderIds": ["665...", "666..."],   // 또는 "orderId": "665..."
 *   "paidAt": "2026-08-12T10:00:00.000Z" // 선택(로깅용)
 * }
 */
router.post('/webhook/order-paid', webhookAuthMiddleware, async (req: WebhookRequest, res) => {
  try {
    const { storeSlug, paidAt } = req.body;
    const rawOrderIds: unknown[] = Array.isArray(req.body.orderIds)
      ? req.body.orderIds
      : req.body.orderId
        ? [req.body.orderId]
        : [];
    // 문자열이 아닌 값이 섞이면 Prisma `in` 에서 던지고, 중복은 집계만 부풀린다.
    const orderIds = [...new Set(rawOrderIds.filter((v): v is string => typeof v === 'string' && v.length > 0))];

    if (typeof storeSlug !== 'string' || !storeSlug || orderIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'missing_params',
        message: 'storeSlug 와 orderIds(또는 orderId)는 필수입니다.',
      });
    }

    // 한 결제 신호가 잡는 주문은 많아야 수십 건이다. 비정상적으로 큰 배열은 거절한다.
    if (orderIds.length > ORDER_PAID_MAX_BATCH) {
      return res.status(400).json({
        success: false,
        error: 'too_many_orders',
        message: `orderIds 는 최대 ${ORDER_PAID_MAX_BATCH}건까지 처리합니다.`,
      });
    }

    const store = await prisma.store.findFirst({
      where: { slug: storeSlug },
      select: { id: true },
    });

    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'store_not_found',
        message: '매장을 찾을 수 없습니다.',
      });
    }

    // 예약 없는 주문이 대다수이므로 주문별 왕복 대신 한 번에 조회한다.
    const pendings = await prisma.pendingPointAccrual.findMany({
      where: { storeId: store.id, orderId: { in: orderIds } },
      select: { id: true, orderId: true, status: true },
    });
    // 스탬프 예약도 같은 결제 신호로 전환된다(포인트와 독립적으로 존재할 수 있다).
    const stampPendings = await prisma.pendingStampAccrual.findMany({
      where: { storeId: store.id, orderId: { in: orderIds } },
      select: { id: true, orderId: true, status: true },
    });

    // 응답 크기를 억제하기 위해 예약이 있던 주문만 결과에 담는다(나머지는 skipped 수에만 반영).
    const results: Array<{ kind: 'POINT' | 'STAMP'; orderId: string; status: string; savedPoint?: number; earnedStamps?: number }> = [];

    for (const pending of pendings) {
      if (pending.status !== 'PENDING') {
        results.push({
          kind: 'POINT',
          orderId: pending.orderId,
          status: pending.status === 'ACCRUED' ? 'ALREADY_ACCRUED' : 'CANCELED',
        });
        continue;
      }

      try {
        const finalized = await finalizePendingAccrual(pending.id, 'PAYMENT');
        results.push({
          kind: 'POINT',
          orderId: pending.orderId,
          status: finalized.status,
          savedPoint: finalized.savedPoint,
        });
      } catch (error) {
        console.error(`[Webhook] order-paid 전환 실패 - orderId: ${pending.orderId}`, error);
        results.push({ kind: 'POINT', orderId: pending.orderId, status: 'ERROR' });
      }
    }

    for (const pending of stampPendings) {
      if (pending.status !== 'PENDING') {
        results.push({
          kind: 'STAMP',
          orderId: pending.orderId,
          status: pending.status === 'ACCRUED' ? 'ALREADY_ACCRUED' : 'CANCELED',
        });
        continue;
      }

      try {
        const finalized = await finalizePendingStampAccrual(pending.id, 'PAYMENT');
        results.push({
          kind: 'STAMP',
          orderId: pending.orderId,
          status: finalized.status,
          earnedStamps: finalized.earnedStamps,
        });
      } catch (error) {
        console.error(`[Webhook] order-paid 스탬프 전환 실패 - orderId: ${pending.orderId}`, error);
        results.push({ kind: 'STAMP', orderId: pending.orderId, status: 'ERROR' });
      }
    }

    // 포인트·스탬프가 한 주문에 섞여 들어오므로 총계만으로는 어느 쪽이 전환됐는지 알 수 없다(로그 전용 분리).
    const finalizedPoints = results.filter(r => r.kind === 'POINT' && r.status === 'ACCRUED').length;
    const finalizedStamps = results.filter(r => r.kind === 'STAMP' && r.status === 'ACCRUED').length;
    const finalizedCount = finalizedPoints + finalizedStamps;
    if (finalizedCount > 0) {
      console.log(
        `[Webhook] order-paid - storeSlug: ${storeSlug}, requested: ${orderIds.length}, finalized: ${finalizedCount}, finalizedPoints: ${finalizedPoints}, finalizedStamps: ${finalizedStamps}, paidAt: ${paidAt ?? '-'}`,
      );
    }

    res.json({
      success: true,
      data: {
        requested: orderIds.length,
        finalized: finalizedCount,
        // 한 주문이 포인트·스탬프 예약을 동시에 가질 수 있어 finalized 가 requested 를 넘길 수 있다.
        skipped: Math.max(0, orderIds.length - finalizedCount),
        results,
      },
    });
  } catch (error: any) {
    console.error('[Webhook] order-paid error:', error);
    res.status(500).json({
      success: false,
      error: 'server_error',
      message: '결제완료 처리 중 오류가 발생했습니다.',
    });
  }
});

/**
 * GET /api/taghere/webhook/health
 * 웹훅 서버 상태 확인 (인증 불필요)
 */
router.get('/webhook/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    service: 'TagHere CRM Webhook',
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /api/taghere/webhook/verify
 * 웹훅 토큰 검증 테스트
 */
router.post('/webhook/verify', webhookAuthMiddleware, (req: WebhookRequest, res) => {
  res.json({
    success: true,
    message: '토큰이 유효합니다.',
    verified: true,
    timestamp: new Date().toISOString()
  });
});

export default router;
