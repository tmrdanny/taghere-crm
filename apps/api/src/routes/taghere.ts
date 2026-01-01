import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

const TAGHERE_API_URL = process.env.TAGHERE_API_URL || 'https://api.tag-here.com';
const TAGHERE_API_TOKEN = process.env.TAGHERE_API_TOKEN_FOR_CRM || '';
const TAGHERE_WEBHOOK_TOKEN = process.env.TAGHERE_WEBHOOK_TOKEN || '';

// Dev API 설정
const TAGHERE_DEV_API_URL = process.env.TAGHERE_DEV_API_URL || 'https://api.d.tag-here.com';
const TAGHERE_DEV_API_TOKEN = process.env.TAGHERE_DEV_API_TOKEN || '';

// Dev API를 사용할 매장 slug 목록
const DEV_API_STORE_SLUGS = ['zeroclasslab', 'taghere-test'];

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

  if (!TAGHERE_WEBHOOK_TOKEN) {
    console.error('[Webhook] TAGHERE_WEBHOOK_TOKEN is not configured');
    return res.status(500).json({
      success: false,
      error: 'Webhook not configured',
      message: '웹훅 토큰이 서버에 설정되지 않았습니다.'
    });
  }

  if (token !== TAGHERE_WEBHOOK_TOKEN) {
    return res.status(403).json({
      success: false,
      error: 'Invalid token',
      message: '유효하지 않은 토큰입니다.'
    });
  }

  req.webhookVerified = true;
  next();
};

interface TaghereOrderData {
  resultPrice?: number | string;
  totalPrice?: number | string;
  orderItems?: any[];
  items?: any[];
  content?: {
    resultPrice?: number | string;
    totalPrice?: number | string;
    items?: any[];
  };
}

// TagHere API에서 주문 정보 조회 (slug 기반으로 Dev/Prod API 선택)
async function fetchOrdersheet(ordersheetId: string, slug?: string): Promise<TaghereOrderData> {
  // Dev API를 사용할 매장인지 확인
  const useDevApi = slug && DEV_API_STORE_SLUGS.includes(slug) && TAGHERE_DEV_API_TOKEN;
  const apiUrl = useDevApi ? TAGHERE_DEV_API_URL : TAGHERE_API_URL;
  const apiToken = useDevApi ? TAGHERE_DEV_API_TOKEN : TAGHERE_API_TOKEN;

  console.log(`[TagHere] Fetching ordersheet - slug: ${slug}, useDevApi: ${useDevApi}, apiUrl: ${apiUrl}`);

  const response = await fetch(
    `${apiUrl}/webhook/crm/ordersheet?ordersheetId=${ordersheetId}`,
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[TagHere] API error:', response.status, errorText);
    throw new Error(`TagHere API error: ${response.status}`);
  }

  return response.json() as Promise<TaghereOrderData>;
}

// GET /api/taghere/ordersheet - 주문 정보 조회 및 적립 예정 포인트 계산 (공개 API)
router.get('/ordersheet', async (req, res) => {
  try {
    const { ordersheetId, slug } = req.query;

    if (!ordersheetId) {
      return res.status(400).json({ error: 'ordersheetId is required' });
    }

    if (!slug) {
      return res.status(400).json({ error: 'slug is required' });
    }

    // 매장 정보 조회
    const store = await prisma.store.findFirst({
      where: { slug: slug as string },
      select: {
        id: true,
        name: true,
        pointRatePercent: true,
        pointRateEnabled: true,
      },
    });

    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }

    // TagHere API 호출 (slug 기반으로 Dev/Prod API 선택)
    const orderData = await fetchOrdersheet(ordersheetId as string, slug as string);

    console.log('[TagHere] Ordersheet data:', JSON.stringify(orderData, null, 2));

    // resultPrice 추출 (content.resultPrice에 있음, 문자열일 수 있음)
    const rawPrice = orderData.content?.resultPrice || orderData.resultPrice || orderData.content?.totalPrice || orderData.totalPrice || 0;
    const resultPrice = typeof rawPrice === 'string' ? parseInt(rawPrice, 10) : rawPrice;

    // 적립률 계산 (기본 5%)
    const ratePercent = store.pointRatePercent || 5;
    const earnPoints = Math.floor(resultPrice * ratePercent / 100);

    // 이미 적립된 ordersheetId인지 확인
    const existingEarn = await prisma.pointLedger.findFirst({
      where: {
        storeId: store.id,
        type: 'EARN',
        reason: { contains: ordersheetId as string },
      },
    });

    res.json({
      storeId: store.id,
      storeName: store.name,
      ordersheetId,
      resultPrice,
      ratePercent,
      earnPoints,
      alreadyEarned: !!existingEarn,
      orderItems: orderData.content?.items || orderData.orderItems || orderData.items || [],
    });
  } catch (error: any) {
    console.error('[TagHere] Ordersheet error:', error);
    res.status(500).json({ error: error.message || '주문 정보 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/taghere/order-event - 주문 이벤트 (리뷰 자동요청 트리거)
router.post('/order-event', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { storeId, orderId, customerKakaoId, phone, items } = req.body;

    const targetStoreId = storeId || req.user!.storeId;

    if (!orderId) {
      return res.status(400).json({ error: 'orderId가 필요합니다.' });
    }

    if (!customerKakaoId && !phone) {
      return res.status(400).json({ error: 'customerKakaoId 또는 phone이 필요합니다.' });
    }

    // Get review automation settings
    const settings = await prisma.reviewAutomationSetting.findUnique({
      where: { storeId: targetStoreId },
    });

    if (!settings || !settings.enabled) {
      return res.json({
        success: false,
        reason: 'review_automation_disabled',
        message: '리뷰 자동요청이 비활성화되어 있습니다.',
      });
    }

    // Find customer
    let customer = null;
    if (customerKakaoId) {
      customer = await prisma.customer.findFirst({
        where: { storeId: targetStoreId, kakaoId: customerKakaoId }
      });
    } else if (phone) {
      const phoneLastDigits = phone.replace(/[^0-9]/g, '').slice(-8);
      customer = await prisma.customer.findFirst({
        where: { storeId: targetStoreId, phoneLastDigits },
      });
    }

    // Get wallet
    const wallet = await prisma.wallet.findUnique({
      where: { storeId: targetStoreId },
    });

    if (!wallet) {
      await prisma.reviewRequestLog.create({
        data: {
          storeId: targetStoreId,
          customerId: customer?.id,
          orderId,
          phone,
          status: 'FAILED',
          cost: 0,
          failReason: '지갑이 존재하지 않습니다',
        },
      });
      return res.json({
        success: false,
        reason: 'no_wallet',
        message: '지갑이 존재하지 않습니다.',
      });
    }

    const costPerSend = settings.costPerSend || 50;

    // Check balance and auto-topup
    if (wallet.balance < costPerSend) {
      // Try auto-topup
      if (settings.autoTopupEnabled) {
        const card = await prisma.card.findFirst({
          where: { storeId: targetStoreId, enabled: true, isDefault: true },
        });

        if (card) {
          // Simulate auto-topup (in production, call payment gateway)
          const topupAmount = settings.autoTopupAmount || 100000;

          await prisma.$transaction([
            prisma.wallet.update({
              where: { storeId: targetStoreId },
              data: { balance: { increment: topupAmount } },
            }),
            prisma.paymentTransaction.create({
              data: {
                storeId: targetStoreId,
                amount: topupAmount,
                type: 'TOPUP',
                status: 'SUCCESS',
                cardId: card.id,
                meta: { source: 'auto_topup', trigger: 'review_request' },
              },
            }),
          ]);

          console.log(`Auto-topup: ${topupAmount}원 충전 완료`);
        } else {
          // No card, fail
          await prisma.reviewRequestLog.create({
            data: {
              storeId: targetStoreId,
              customerId: customer?.id,
              orderId,
              phone,
              status: 'FAILED',
              cost: 0,
              failReason: '잔액 부족 및 등록된 카드 없음',
            },
          });

          return res.json({
            success: false,
            reason: 'insufficient_balance_no_card',
            message: '잔액이 부족하고 등록된 카드가 없습니다.',
          });
        }
      } else {
        // Auto-topup disabled
        await prisma.reviewRequestLog.create({
          data: {
            storeId: targetStoreId,
            customerId: customer?.id,
            orderId,
            phone,
            status: 'FAILED',
            cost: 0,
            failReason: '잔액 부족 (자동충전 비활성화)',
          },
        });

        return res.json({
          success: false,
          reason: 'insufficient_balance',
          message: '잔액이 부족합니다.',
        });
      }
    }

    // Deduct cost and create log
    const [updatedWallet, log] = await prisma.$transaction([
      prisma.wallet.update({
        where: { storeId: targetStoreId },
        data: { balance: { decrement: costPerSend } },
      }),
      prisma.reviewRequestLog.create({
        data: {
          storeId: targetStoreId,
          customerId: customer?.id,
          orderId,
          phone,
          status: 'SENT',
          cost: costPerSend,
          sentAt: new Date(),
        },
      }),
    ]);

    // In production, send actual KakaoTalk notification here
    console.log(`리뷰 요청 발송: orderId=${orderId}, cost=${costPerSend}원`);

    res.json({
      success: true,
      message: '리뷰 요청이 발송되었습니다.',
      logId: log.id,
      cost: costPerSend,
      newBalance: updatedWallet.balance,
    });
  } catch (error) {
    console.error('Order event error:', error);
    res.status(500).json({ error: '주문 이벤트 처리 중 오류가 발생했습니다.' });
  }
});

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
 *   "ordersheetId": "6666",           // 필수: 취소된 주문 ID
 *   "reason": "고객 요청 환불",        // 선택: 취소/환불 사유
 *   "cancelType": "CANCEL" | "REFUND" // 선택: 취소 유형 (기본값: CANCEL)
 * }
 */
router.post('/webhook/order-cancel', webhookAuthMiddleware, async (req: WebhookRequest, res) => {
  const startTime = Date.now();

  try {
    const { ordersheetId, reason, cancelType = 'CANCEL' } = req.body;

    // 1. 필수 파라미터 검증
    if (!ordersheetId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field',
        message: 'ordersheetId는 필수입니다.'
      });
    }

    console.log(`[Webhook] Order cancel request - ordersheetId: ${ordersheetId}, type: ${cancelType}, reason: ${reason || 'N/A'}`);

    // 2. 해당 ordersheetId로 적립된 포인트 내역 조회
    const earnRecord = await prisma.pointLedger.findFirst({
      where: {
        type: 'EARN',
        OR: [
          { orderId: ordersheetId },
          { reason: { contains: ordersheetId } }
        ]
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

    // 3. 적립 내역이 없는 경우
    if (!earnRecord) {
      console.log(`[Webhook] No earn record found for ordersheetId: ${ordersheetId}`);
      return res.status(404).json({
        success: false,
        error: 'Earn record not found',
        message: `ordersheetId(${ordersheetId})에 해당하는 포인트 적립 내역을 찾을 수 없습니다.`,
        ordersheetId
      });
    }

    const { customer, store } = earnRecord;
    const pointsToDeduct = earnRecord.delta; // 적립된 포인트 금액

    // 4. 이미 차감되었는지 확인 (중복 처리 방지)
    const existingDeduction = await prisma.pointLedger.findFirst({
      where: {
        customerId: customer.id,
        storeId: store.id,
        type: 'ADJUST',
        reason: { contains: `주문취소: ${ordersheetId}` }
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

    // 5. 트랜잭션으로 포인트 차감 + 고객 포인트 업데이트 + 주문 내역 삭제
    const deductionReason = reason
      ? `주문취소: ${ordersheetId} (${cancelType === 'REFUND' ? '환불' : '취소'} - ${reason})`
      : `주문취소: ${ordersheetId} (${cancelType === 'REFUND' ? '환불' : '취소'})`;

    const newBalance = Math.max(0, customer.totalPoints - pointsToDeduct);

    const result = await prisma.$transaction(async (tx) => {
      // 5-1. 포인트 차감 내역 생성
      const deductionRecord = await tx.pointLedger.create({
        data: {
          storeId: store.id,
          customerId: customer.id,
          delta: -pointsToDeduct, // 음수로 차감
          balance: newBalance,
          type: 'ADJUST',
          reason: deductionReason,
          orderId: ordersheetId
        }
      });

      // 5-2. 고객 총 포인트 업데이트
      const updatedCustomer = await tx.customer.update({
        where: { id: customer.id },
        data: { totalPoints: newBalance }
      });

      // 5-3. 관련 주문 내역 삭제 (있는 경우)
      const deletedVisit = await tx.visitOrOrder.deleteMany({
        where: {
          storeId: store.id,
          customerId: customer.id,
          orderId: ordersheetId
        }
      });

      return { deductionRecord, updatedCustomer, deletedVisitCount: deletedVisit.count };
    });

    const processingTime = Date.now() - startTime;

    console.log(`[Webhook] Order cancel completed - ordersheetId: ${ordersheetId}, deducted: ${pointsToDeduct}P, newBalance: ${newBalance}P, time: ${processingTime}ms`);

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
          deducted: pointsToDeduct,
          previousBalance: customer.totalPoints,
          newBalance: result.updatedCustomer.totalPoints
        },
        deductionId: result.deductionRecord.id,
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

// GET /api/taghere/order-details - 주문 상세 정보 조회 (태그히어 모바일오더 API 호출)
// taghere-test 매장의 새로운 성공 페이지에서 사용
router.get('/order-details', async (req, res) => {
  try {
    const { storeId, ordersheetId } = req.query;

    if (!storeId || !ordersheetId) {
      return res.status(400).json({ error: 'storeId와 ordersheetId가 필요합니다.' });
    }

    // Dev API 사용 (taghere-test 매장)
    const apiUrl = TAGHERE_DEV_API_URL;
    const apiToken = TAGHERE_DEV_API_TOKEN;

    if (!apiToken) {
      return res.status(500).json({ error: 'API 토큰이 설정되지 않았습니다.' });
    }

    console.log(`[TagHere] Fetching order details - storeId: ${storeId}, ordersheetId: ${ordersheetId}`);

    // 태그히어 모바일오더 API 호출
    const response = await fetch(
      `${apiUrl}/webhook/crm/order-details?storeId=${storeId}&ordersheetId=${ordersheetId}`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[TagHere] Order details API error:', response.status, errorText);
      return res.status(response.status).json({ error: '주문 정보를 불러오는데 실패했습니다.' });
    }

    const data = await response.json() as {
      storeName?: string;
      store?: { name?: string; logoUrl?: string };
      storeLogoUrl?: string;
      orderNumber?: string;
      tableNumber?: string;
      items?: any[];
      orderItems?: any[];
      totalPrice?: string | number;
      resultPrice?: string | number;
    };
    console.log('[TagHere] Order details data:', JSON.stringify(data, null, 2));

    // 응답 데이터 가공
    const orderDetails = {
      storeName: data.storeName || data.store?.name || '태그히어',
      storeLogoUrl: data.storeLogoUrl || data.store?.logoUrl || null,
      orderNumber: data.orderNumber || data.tableNumber || `T-${ordersheetId}`,
      items: (data.items || data.orderItems || []).map((item: any) => ({
        name: item.name || item.menuName || item.label || '상품',
        quantity: item.quantity || item.count || 1,
      })),
      totalPrice: typeof data.totalPrice === 'string' ? parseInt(data.totalPrice, 10) : (data.totalPrice || data.resultPrice || 0),
    };

    res.json(orderDetails);
  } catch (error: any) {
    console.error('[TagHere] Order details error:', error);
    res.status(500).json({ error: error.message || '주문 정보 조회 중 오류가 발생했습니다.' });
  }
});

export default router;
