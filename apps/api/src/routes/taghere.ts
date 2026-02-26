import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { enqueuePointsEarnedAlimTalk, enqueueStampEarnedAlimTalk, enqueueHitejinroStampEarnedAlimTalk } from '../services/solapi.js';
import { checkMilestoneAndDraw, buildRewardsFromLegacy, RewardEntry } from '../utils/random-reward.js';
import { isValidWebhookToken, fetchOrder, TaghereOrderData } from '../services/taghere-api.js';

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

// GET /api/taghere/ordersheet - 주문 정보 조회 및 적립 예정 포인트 계산 (공개 API)
router.get('/ordersheet', async (req, res) => {
  try {
    const ordersheetId = (req.query.ordersheetId || req.query.orderId) as string | undefined;
    const slug = req.query.slug as string | undefined;

    if (!ordersheetId) {
      return res.status(400).json({ error: 'ordersheetId or orderId is required' });
    }

    if (!slug) {
      return res.status(400).json({ error: 'slug is required' });
    }

    // 매장 정보 조회
    const store = await prisma.store.findFirst({
      where: { slug },
      select: {
        id: true,
        name: true,
        pointRatePercent: true,
        taghereVersion: true,
      },
    });

    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }

    // TagHere API 호출 (V1/V2 자동 분기)
    const orderData = await fetchOrder(ordersheetId, store.taghereVersion);

    // 주문서를 찾을 수 없는 경우
    if (!orderData) {
      return res.status(404).json({ error: '주문 정보를 찾을 수 없습니다.' });
    }

    console.log('[TagHere] Ordersheet data:', JSON.stringify(orderData, null, 2));

    // resultPrice 추출 (content.resultPrice에 있음, 문자열일 수 있음)
    const rawPrice = orderData.content?.resultPrice || orderData.resultPrice || orderData.content?.totalPrice || orderData.totalPrice || 0;
    const resultPrice = typeof rawPrice === 'string' ? parseInt(rawPrice, 10) : rawPrice;

    // 적립률 계산 (기본 5%)
    const ratePercent = store.pointRatePercent || 5;
    const earnPoints = Math.round(resultPrice * ratePercent / 100);

    // 이미 적립된 ordersheetId인지 확인
    const existingEarn = await prisma.pointLedger.findFirst({
      where: {
        storeId: store.id,
        type: 'EARN',
        reason: { contains: ordersheetId as string },
      },
    });

    // tableLabel 추출
    let tableLabel = orderData.content?.tableLabel || orderData.tableLabel || (orderData as any).tableLabel || null;

    // tableLabel이 없으면 tableID 확인 (짧은 숫자면 테이블 번호로 사용)
    if (!tableLabel) {
      const tableID = (orderData as any).tableID || (orderData as any).content?.tableID;
      // tableID가 짧은 문자열이면 테이블 번호로 사용 (MongoDB ObjectId는 24자)
      if (tableID && typeof tableID === 'string' && tableID.length < 10) {
        tableLabel = tableID;
      }
    }

    res.json({
      storeId: store.id,
      storeName: (orderData as any).storeName || store.name,
      ordersheetId,
      resultPrice,
      ratePercent,
      earnPoints,
      alreadyEarned: !!existingEarn,
      orderItems: orderData.content?.items || orderData.orderItems || orderData.items || [],
      orderNumber: (orderData as any).displayOrderNumber || (orderData as any).orderNumber || null,
      menuLink: (orderData as any).menuLink || null,
      tableLabel,
    });
  } catch (error: any) {
    console.error('[TagHere] Ordersheet error:', error);
    res.status(500).json({ error: error.message || '주문 정보 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/taghere/auto-earn - 기존 고객 자동 포인트 적립 (카카오 로그인 없이)
router.post('/auto-earn', async (req, res) => {
  try {
    const { kakaoId, slug, mode } = req.body;
    const ordersheetId = req.body.ordersheetId || req.body.orderId;
    const isMembership = mode === 'membership';

    // 1. 파라미터 검증
    if (!kakaoId || !ordersheetId || !slug) {
      return res.status(400).json({
        success: false,
        error: 'missing_params',
        message: 'kakaoId, ordersheetId(또는 orderId), slug가 필요합니다.',
      });
    }

    // kakaoId 형식 검증 (숫자 문자열)
    if (!/^\d+$/.test(kakaoId)) {
      return res.status(400).json({
        success: false,
        error: 'invalid_kakao_id',
        message: '유효하지 않은 kakaoId입니다.',
      });
    }

    console.log(`[TagHere Auto-Earn] Request - kakaoId: ${kakaoId}, ordersheetId: ${ordersheetId}, slug: ${slug}, mode: ${mode || 'points'}`);

    // 2. 매장 조회
    const store = await prisma.store.findFirst({
      where: { slug },
      select: {
        id: true,
        name: true,
        pointRatePercent: true,
        taghereVersion: true,
      },
    });

    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'store_not_found',
        message: '매장을 찾을 수 없습니다.',
      });
    }

    // 3. 중복 체크 (멤버십: VisitOrOrder, 포인트: PointLedger)
    if (isMembership) {
      const existingVisit = await prisma.visitOrOrder.findFirst({
        where: { storeId: store.id, orderId: ordersheetId },
      });
      if (existingVisit) {
        return res.status(409).json({
          success: false,
          error: 'already_earned',
          message: '이미 등록된 주문입니다.',
        });
      }
    } else {
      const existingEarn = await prisma.pointLedger.findFirst({
        where: {
          storeId: store.id,
          type: 'EARN',
          reason: { contains: ordersheetId },
        },
      });
      if (existingEarn) {
        return res.status(409).json({
          success: false,
          error: 'already_earned',
          message: '이미 포인트가 적립된 주문입니다.',
        });
      }
    }

    // 4. kakaoId로 해당 매장의 고객 조회
    let customer = await prisma.customer.findFirst({
      where: {
        storeId: store.id,
        kakaoId,
      },
    });

    let isNewCustomer = false;

    // 5. 고객 없으면 다른 매장에서 같은 kakaoId 고객 정보 찾아서 복사
    if (!customer) {
      isNewCustomer = true;

      // 다른 매장에서 같은 kakaoId를 가진 고객 조회
      const existingCustomer = await prisma.customer.findFirst({
        where: {
          kakaoId,
          storeId: { not: store.id },
        },
        select: {
          name: true,
          phone: true,
          phoneLastDigits: true,
          gender: true,
          birthday: true,
          birthYear: true,
        },
      });

      // phoneLastDigits 중복 체크 (이미 해당 매장에 같은 전화번호 고객이 있으면 전화번호는 복사하지 않음)
      let phoneToUse = existingCustomer?.phone ?? null;
      let phoneLastDigitsToUse = existingCustomer?.phoneLastDigits ?? null;

      if (phoneLastDigitsToUse) {
        const existingPhone = await prisma.customer.findFirst({
          where: {
            storeId: store.id,
            phoneLastDigits: phoneLastDigitsToUse,
          },
        });
        if (existingPhone) {
          phoneToUse = null;
          phoneLastDigitsToUse = null;
          console.log(`[TagHere Auto-Earn] Phone already exists in store, skipping phone copy - storeId: ${store.id}`);
        }
      }

      customer = await prisma.customer.create({
        data: {
          storeId: store.id,
          kakaoId,
          // 다른 매장 고객 정보 복사 (있으면)
          name: existingCustomer?.name ?? null,
          phone: phoneToUse,
          phoneLastDigits: phoneLastDigitsToUse,
          gender: existingCustomer?.gender ?? null,
          birthday: existingCustomer?.birthday ?? null,
          birthYear: existingCustomer?.birthYear ?? null,
          // 매장별 독립 데이터는 초기값
          totalPoints: 0,
          visitCount: 0,
          consentMarketing: true,
          consentKakao: true,
          consentAt: new Date(),
        },
      });

      if (existingCustomer) {
        console.log(`[TagHere Auto-Earn] New customer created with copied data - customerId: ${customer.id}, storeId: ${store.id}, copiedFrom: other store`);
      } else {
        console.log(`[TagHere Auto-Earn] New customer created - customerId: ${customer.id}, storeId: ${store.id}`);
      }
    }

    // 6. TagHere API에서 주문 금액 조회 (V1/V2 자동 분기)
    const orderData = await fetchOrder(ordersheetId, store.taghereVersion);

    // 주문서를 찾을 수 없는 경우 기본값 사용 (적립은 진행)
    if (!orderData) {
      console.log(`[TagHere Auto-Earn] Ordersheet not found, using default points - ordersheetId: ${ordersheetId}`);
    }

    const rawPrice = orderData?.content?.resultPrice || orderData?.resultPrice || orderData?.content?.totalPrice || orderData?.totalPrice || 0;
    const resultPrice = typeof rawPrice === 'string' ? parseInt(rawPrice, 10) : rawPrice;

    // 주문 아이템 정보 추출
    const rawItems = orderData?.content?.items || orderData?.orderItems || orderData?.items || [];
    const orderItems = rawItems.map((item: any) => ({
      name: item.label || item.name || item.menuName || item.productName || item.title || item.itemName || item.menuTitle || null,
      quantity: item.count || item.quantity || item.qty || item.amount || 1,
      price: typeof item.price === 'string' ? parseInt(item.price, 10) : (item.price || item.unitPrice || item.itemPrice || item.totalPrice || 0),
      option: item.option || null,
    }));
    // tableLabel 추출 (tableLabel 또는 tableNumber)
    let tableLabel = orderData?.content?.tableLabel || orderData?.tableLabel || (orderData as any)?.content?.tableNumber || (orderData as any)?.tableNumber || null;

    // tableLabel이 없으면 tableID 확인 (짧은 숫자면 테이블 번호로 사용)
    if (!tableLabel) {
      const tableID = (orderData as any)?.tableID || (orderData as any)?.content?.tableID;
      // tableID가 짧은 문자열이면 테이블 번호로 사용 (MongoDB ObjectId는 24자)
      if (tableID && typeof tableID === 'string' && tableID.length < 10) {
        tableLabel = tableID;
      }
    }

    // 7. 오늘 첫 방문인지 확인
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    if (isMembership) {
      // ===== 멤버십 모드: VisitOrOrder만 기록 (포인트 적립 없음) =====
      const todayVisit = await prisma.visitOrOrder.findFirst({
        where: {
          customerId: customer.id,
          storeId: store.id,
          visitedAt: { gte: todayStart, lte: todayEnd },
        },
      });
      const isFirstVisitToday = !todayVisit;

      await prisma.$transaction([
        prisma.customer.update({
          where: { id: customer.id },
          data: {
            ...(isFirstVisitToday && { visitCount: { increment: 1 } }),
            lastVisitAt: new Date(),
          },
        }),
        prisma.visitOrOrder.create({
          data: {
            storeId: store.id,
            customerId: customer.id,
            orderId: ordersheetId,
            visitedAt: new Date(),
            totalAmount: resultPrice > 0 ? resultPrice : null,
            items: orderItems.length > 0 || tableLabel ? {
              items: orderItems,
              tableNumber: tableLabel,
            } : undefined,
          },
        }),
      ]);

      console.log(`[TagHere Auto-Earn] Membership registered - customerId: ${customer.id}, storeId: ${store.id}`);

      // 멤버십 성공 응답
      res.json({
        success: true,
        mode: 'membership',
        storeName: store.name,
        customerId: customer.id,
        resultPrice,
        isNewCustomer,
        hasExistingPreferences: !!(customer as any).preferredCategories,
      });
    } else {
      // ===== 포인트 모드: 기존 로직 =====
      const ratePercent = store.pointRatePercent || 5;
      const earnPoints = resultPrice > 0 ? Math.round(resultPrice * ratePercent / 100) : 100;
      const newBalance = customer.totalPoints + earnPoints;

      const todayVisit = await prisma.pointLedger.findFirst({
        where: {
          customerId: customer.id,
          storeId: store.id,
          type: 'EARN',
          createdAt: { gte: todayStart, lte: todayEnd },
        },
      });
      const isFirstVisitToday = !todayVisit;

      await prisma.$transaction([
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
            storeId: store.id,
            customerId: customer.id,
            delta: earnPoints,
            balance: newBalance,
            type: 'EARN',
            reason: `TagHere 자동 적립 (ordersheetId: ${ordersheetId})`,
            orderId: ordersheetId,
            tableLabel: tableLabel,
          },
        }),
        prisma.visitOrOrder.create({
          data: {
            storeId: store.id,
            customerId: customer.id,
            orderId: ordersheetId,
            visitedAt: new Date(),
            totalAmount: resultPrice > 0 ? resultPrice : null,
            items: orderItems.length > 0 || tableLabel ? {
              items: orderItems,
              tableNumber: tableLabel,
            } : undefined,
          },
        }),
      ]);

      console.log(`[TagHere Auto-Earn] Points earned - customerId: ${customer.id}, earnPoints: ${earnPoints}, newBalance: ${newBalance}, orderItemsCount: ${orderItems.length}, tableLabel: ${tableLabel}`);

      // 알림톡 발송 (전화번호가 있는 경우만, 비동기)
      const phoneNumber = customer.phone?.replace(/[^0-9]/g, '');
      if (phoneNumber) {
        const pointLedger = await prisma.pointLedger.findFirst({
          where: { customerId: customer.id },
          orderBy: { createdAt: 'desc' },
        });

        if (pointLedger) {
          enqueuePointsEarnedAlimTalk({
            storeId: store.id,
            customerId: customer.id,
            pointLedgerId: pointLedger.id,
            phone: phoneNumber,
            variables: {
              storeName: store.name,
              points: earnPoints,
              totalPoints: newBalance,
            },
          }).catch((err) => {
            console.error('[TagHere Auto-Earn] Points AlimTalk enqueue failed:', err);
          });
        }
      }

      // 포인트 성공 응답
      res.json({
        success: true,
        points: earnPoints,
        totalPoints: newBalance,
        storeName: store.name,
        customerId: customer.id,
        resultPrice,
        isNewCustomer,
      });
    }
  } catch (error: any) {
    console.error('[TagHere Auto-Earn] Error:', error);
    res.status(500).json({
      success: false,
      error: 'server_error',
      message: '포인트 적립 중 오류가 발생했습니다.',
    });
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

// ============================================================
// 스탬프 API
// ============================================================

// GET /api/taghere/stamp-info/:slug - 매장 스탬프 정보 조회 (공개 API)
router.get('/stamp-info/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    // 매장 조회
    const store = await prisma.store.findFirst({
      where: { slug },
      select: {
        id: true,
        name: true,
        stampSetting: true,
        franchiseStampEnabled: true,
        franchiseId: true,
        franchise: {
          select: {
            id: true,
            name: true,
            franchiseStampSetting: true,
          },
        },
      },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    // 프랜차이즈 통합 스탬프 모드
    const isFranchiseStampMode = !!(
      store.franchiseStampEnabled &&
      store.franchiseId &&
      store.franchise?.franchiseStampSetting
    );

    if (isFranchiseStampMode) {
      const franchiseStampSetting = store.franchise!.franchiseStampSetting!;
      const rewards: RewardEntry[] = franchiseStampSetting.rewards
        ? (franchiseStampSetting.rewards as unknown as RewardEntry[])
        : buildRewardsFromLegacy(franchiseStampSetting as any);

      const legacyFields: Record<string, any> = {};
      for (const r of rewards) {
        legacyFields[`reward${r.tier}Description`] = r.description;
        legacyFields[`reward${r.tier}IsRandom`] = r.options && Array.isArray(r.options) && r.options.length > 1;
      }

      return res.json({
        storeId: store.id,
        storeName: store.name,
        franchiseName: store.franchise!.name,
        franchiseStampEnabled: true,
        enabled: true,
        rewards,
        ...legacyFields,
      });
    }

    // 스탬프 설정이 없거나 비활성화된 경우
    if (!store.stampSetting?.enabled) {
      return res.status(400).json({
        error: '스탬프 기능이 비활성화되어 있습니다.',
        enabled: false,
      });
    }

    // rewards JSON 기반으로 보상 정보 반환
    const rewards: RewardEntry[] = store.stampSetting.rewards
      ? (store.stampSetting.rewards as unknown as RewardEntry[])
      : buildRewardsFromLegacy(store.stampSetting as any);

    // 레거시 호환 필드도 함께 반환
    const legacyFields: Record<string, any> = {};
    for (const r of rewards) {
      legacyFields[`reward${r.tier}Description`] = r.description;
      legacyFields[`reward${r.tier}IsRandom`] = r.options && Array.isArray(r.options) && r.options.length > 1;
    }

    res.json({
      storeId: store.id,
      storeName: store.name,
      enabled: true,
      rewards,
      ...legacyFields,
    });
  } catch (error: any) {
    console.error('[TagHere] Stamp info error:', error);
    res.status(500).json({ error: '스탬프 정보 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/taghere/stamp-earn - 스탬프 자동 적립 (카카오 로그인 후)
router.post('/stamp-earn', async (req, res) => {
  try {
    const { kakaoId, slug, earnMethod = 'NFC_TAG', isHitejinro } = req.body;
    const ordersheetId = req.body.ordersheetId || req.body.orderId;

    // 1. 파라미터 검증
    if (!kakaoId || !slug) {
      return res.status(400).json({
        success: false,
        error: 'missing_params',
        message: 'kakaoId와 slug가 필요합니다.',
      });
    }

    // kakaoId 형식 검증 (숫자 문자열)
    if (!/^\d+$/.test(kakaoId)) {
      return res.status(400).json({
        success: false,
        error: 'invalid_kakao_id',
        message: '유효하지 않은 kakaoId입니다.',
      });
    }

    console.log(`[TagHere Stamp-Earn] Request - kakaoId: ${kakaoId}, slug: ${slug}, earnMethod: ${earnMethod}`);

    // 2. 매장 조회
    const store = await prisma.store.findFirst({
      where: { slug },
      select: {
        id: true,
        name: true,
        stampSetting: true,
        franchiseStampEnabled: true,
        franchiseId: true,
        taghereVersion: true,
        franchise: {
          select: {
            id: true,
            name: true,
            franchiseStampSetting: true,
          },
        },
        reviewAutomationSetting: {
          select: { benefitText: true },
        },
      },
    });

    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'store_not_found',
        message: '매장을 찾을 수 없습니다.',
      });
    }

    // 프랜차이즈 통합 스탬프 모드 판별
    const isFranchiseStampMode = !!(
      store.franchiseStampEnabled &&
      store.franchiseId &&
      store.franchise?.franchiseStampSetting
    );

    // 3. 스탬프 기능 활성화 확인
    // 하이트진로 전용 링크는 매장 스탬프 설정과 무관하게 적립 허용
    if (!isHitejinro && !isFranchiseStampMode && !store.stampSetting?.enabled) {
      return res.status(400).json({
        success: false,
        error: 'stamp_disabled',
        message: '스탬프 기능이 비활성화되어 있습니다.',
      });
    }

    // 4. kakaoId로 해당 매장의 고객 조회
    let customer = await prisma.customer.findFirst({
      where: {
        storeId: store.id,
        kakaoId,
      },
    });

    let isNewCustomer = false;

    // 5. 고객 없으면 다른 매장에서 같은 kakaoId 고객 정보 찾아서 복사
    if (!customer) {
      isNewCustomer = true;

      // 다른 매장에서 같은 kakaoId를 가진 고객 조회
      const existingCustomer = await prisma.customer.findFirst({
        where: {
          kakaoId,
          storeId: { not: store.id },
        },
        select: {
          name: true,
          phone: true,
          phoneLastDigits: true,
          gender: true,
          birthday: true,
          birthYear: true,
        },
      });

      // phoneLastDigits 중복 체크
      let phoneToUse = existingCustomer?.phone ?? null;
      let phoneLastDigitsToUse = existingCustomer?.phoneLastDigits ?? null;

      if (phoneLastDigitsToUse) {
        const existingPhone = await prisma.customer.findFirst({
          where: {
            storeId: store.id,
            phoneLastDigits: phoneLastDigitsToUse,
          },
        });
        if (existingPhone) {
          phoneToUse = null;
          phoneLastDigitsToUse = null;
          console.log(`[TagHere Stamp-Earn] Phone already exists in store, skipping phone copy - storeId: ${store.id}`);
        }
      }

      customer = await prisma.customer.create({
        data: {
          storeId: store.id,
          kakaoId,
          name: existingCustomer?.name ?? null,
          phone: phoneToUse,
          phoneLastDigits: phoneLastDigitsToUse,
          gender: existingCustomer?.gender ?? null,
          birthday: existingCustomer?.birthday ?? null,
          birthYear: existingCustomer?.birthYear ?? null,
          totalPoints: 0,
          totalStamps: 0,
          visitCount: 0,
          consentMarketing: true,
          consentKakao: true,
          consentAt: new Date(),
        },
      });

      console.log(`[TagHere Stamp-Earn] New customer created - customerId: ${customer.id}, storeId: ${store.id}`);
    }

    // 6. 일일 적립 제한 확인 (1일 1회) - 프랜차이즈 모드는 위에서 처리
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    if (!isFranchiseStampMode) {
      const todayEarn = await prisma.stampLedger.findFirst({
        where: {
          storeId: store.id,
          customerId: customer.id,
          type: 'EARN',
          createdAt: { gte: todayStart },
        },
      });

      if (todayEarn) {
        // rewards JSON 기반 보상 정보
        const alreadyRewards: RewardEntry[] = store.stampSetting!.rewards
          ? (store.stampSetting!.rewards as unknown as RewardEntry[])
          : buildRewardsFromLegacy(store.stampSetting as any);
        const alreadyLegacy: Record<string, any> = {};
        for (const r of alreadyRewards) {
          alreadyLegacy[`reward${r.tier}Description`] = r.description;
        }

        return res.status(400).json({
          success: false,
          error: 'already_earned_today',
          message: '오늘 이미 스탬프를 적립했습니다.',
          alreadyEarned: true,
          currentStamps: customer.totalStamps,
          rewards: alreadyRewards,
          ...alreadyLegacy,
        });
      }
    }

    // 7. 태그히어 연동 시 중복 체크
    if (ordersheetId) {
      const existingEarn = await prisma.stampLedger.findFirst({
        where: { ordersheetId },
      });
      if (existingEarn) {
        return res.status(400).json({
          success: false,
          error: 'already_earned_order',
          message: '이미 적립된 주문입니다.',
        });
      }
    }

    // 7-1. ordersheetId가 있으면 TagHere API에서 주문 데이터 조회 (V1/V2 자동 분기)
    let orderData: TaghereOrderData | null = null;
    let tableLabel: string | null = null;
    let orderItems: any[] = [];
    let totalAmount: number | null = null;

    if (ordersheetId) {
      try {
        orderData = await fetchOrder(ordersheetId, store.taghereVersion);
        if (orderData) {
          const rawPrice = orderData.content?.resultPrice || orderData.resultPrice ||
                           orderData.content?.totalPrice || orderData.totalPrice || 0;
          const parsedAmount = typeof rawPrice === 'string' ? parseInt(rawPrice, 10) : Number(rawPrice) || 0;
          totalAmount = parsedAmount > 0 ? parsedAmount : null;

          const rawItems = orderData.content?.items || orderData.orderItems || orderData.items || [];
          orderItems = rawItems.map((item: any) => ({
            name: item.label || item.name || item.menuName || item.productName ||
                  item.title || item.itemName || item.menuTitle || null,
            quantity: item.count || item.quantity || item.qty || item.amount || 1,
            price: typeof item.price === 'string' ? parseInt(item.price, 10) :
                   (item.price || item.unitPrice || item.itemPrice || item.totalPrice || 0),
            option: item.option || null,
          }));

          // tableLabel 추출 (여러 필드 확인)
          tableLabel = orderData.content?.tableLabel || orderData.tableLabel ||
                       (orderData as any).content?.tableNumber || (orderData as any).tableNumber || null;

          // tableLabel이 없으면 tableID 확인 (짧은 숫자면 테이블 번호로 사용)
          if (!tableLabel) {
            const tableID = (orderData as any).tableID || (orderData as any).content?.tableID;
            // tableID가 짧은 문자열이면 테이블 번호로 사용 (MongoDB ObjectId는 24자)
            if (tableID && typeof tableID === 'string' && tableID.length < 10) {
              tableLabel = tableID;
            }
          }

          console.log(`[TagHere Stamp-Earn] Order data fetched - ordersheetId: ${ordersheetId}, tableLabel: ${tableLabel}, tableID: ${(orderData as any).tableID}, itemsCount: ${orderItems.length}`);
        }
      } catch (e) {
        console.error('[TagHere Stamp-Earn] Failed to fetch ordersheet:', e);
        // 조회 실패해도 스탬프 적립은 계속 진행
      }
    }

    // ============================================
    // 프랜차이즈 통합 스탬프 모드
    // ============================================
    if (isFranchiseStampMode) {
      const franchiseId = store.franchiseId!;
      const franchiseStampSetting = store.franchise!.franchiseStampSetting!;
      const franchiseName = store.franchise!.name;

      // FranchiseCustomer upsert
      let franchiseCustomer = await prisma.franchiseCustomer.findUnique({
        where: { franchiseId_kakaoId: { franchiseId, kakaoId } },
      });

      // 1일 1회 제한 체크 (프랜차이즈 통합)
      if (franchiseCustomer) {
        const todayFranchiseEarn = await prisma.franchiseStampLedger.findFirst({
          where: {
            franchiseCustomerId: franchiseCustomer.id,
            storeId: store.id,
            type: 'EARN',
            createdAt: { gte: todayStart },
          },
        });

        if (todayFranchiseEarn) {
          const alreadyRewards: RewardEntry[] = franchiseStampSetting.rewards
            ? (franchiseStampSetting.rewards as unknown as RewardEntry[])
            : buildRewardsFromLegacy(franchiseStampSetting as any);
          return res.status(400).json({
            success: false,
            error: 'already_earned_today',
            message: '오늘 이미 스탬프를 적립했습니다.',
            alreadyEarned: true,
            currentStamps: franchiseCustomer.totalStamps,
            storeName: store.name,
            franchiseName,
            rewards: alreadyRewards,
          });
        }
      }

      if (!franchiseCustomer) {
        franchiseCustomer = await prisma.franchiseCustomer.create({
          data: {
            franchiseId,
            kakaoId,
            phone: customer!.phone || null,
            name: customer!.name || null,
          },
        });
      }

      // 매장 Customer 방문수만 업데이트
      await prisma.customer.update({
        where: { id: customer!.id },
        data: {
          lastVisitAt: new Date(),
          visitCount: { increment: 1 },
        },
      });

      // 주문 내역 (매장 레벨)
      await prisma.visitOrOrder.create({
        data: {
          storeId: store.id,
          customerId: customer!.id,
          orderId: ordersheetId || null,
          visitedAt: new Date(),
          totalAmount: totalAmount,
          items: orderItems.length > 0 || tableLabel ? {
            items: orderItems,
            tableNumber: tableLabel,
          } : undefined,
        },
      });

      // 프랜차이즈 통합 스탬프 적립
      const previousFranchiseStamps = franchiseCustomer.totalStamps;
      const newFranchiseBalance = previousFranchiseStamps + 1;

      const franchiseResult = await prisma.$transaction(async (tx) => {
        const updated = await tx.franchiseCustomer.update({
          where: { id: franchiseCustomer!.id },
          data: {
            totalStamps: newFranchiseBalance,
            visitCount: { increment: 1 },
            lastVisitAt: new Date(),
            phone: customer!.phone || franchiseCustomer!.phone || undefined,
            name: customer!.name || franchiseCustomer!.name || undefined,
          },
        });

        const ledger = await tx.franchiseStampLedger.create({
          data: {
            franchiseId,
            franchiseCustomerId: franchiseCustomer!.id,
            storeId: store.id,
            type: 'EARN',
            delta: 1,
            balance: newFranchiseBalance,
            ordersheetId: ordersheetId || null,
            earnMethod: earnMethod as any,
            reason: ordersheetId ? `태그히어 주문 적립 (${ordersheetId})` : '스탬프 적립 (통합)',
          },
        });

        const milestoneResult = checkMilestoneAndDraw(
          previousFranchiseStamps,
          newFranchiseBalance,
          franchiseStampSetting as any,
        );
        if (milestoneResult) {
          await tx.franchiseStampLedger.update({
            where: { id: ledger.id },
            data: {
              drawnReward: milestoneResult.reward,
              drawnRewardTier: milestoneResult.tier,
            },
          });
        }

        return { customer: updated, ledger, milestoneResult };
      });

      console.log(`[TagHere Stamp-Earn] Franchise stamp earned - franchiseCustomerId: ${franchiseCustomer.id}, newBalance: ${franchiseResult.customer.totalStamps}${franchiseResult.milestoneResult ? `, milestone: ${franchiseResult.milestoneResult.tier}개` : ''}`);

      // 알림톡
      // 하이트진로 전용 링크: alimtalkEnabled 설정과 무관하게 발송
      const phoneNumber = customer!.phone?.replace(/[^0-9]/g, '');
      if ((isHitejinro || franchiseStampSetting.alimtalkEnabled) && phoneNumber) {
        const rewardsForAlimtalk: RewardEntry[] = franchiseStampSetting.rewards
          ? (franchiseStampSetting.rewards as unknown as RewardEntry[])
          : buildRewardsFromLegacy(franchiseStampSetting as any);
        const rules = rewardsForAlimtalk
          .sort((a, b) => a.tier - b.tier)
          .map(r => {
            const isRandom = r.options && Array.isArray(r.options) && r.options.length > 1;
            return `- ${r.tier}개 모을 시: ${isRandom ? '랜덤 박스!' : r.description}`;
          });
        const stampUsageRule = rules.length > 0
          ? '\n' + rules.join('\n')
          : '\n- 10개 모을시 매장 선물 증정!';

        if (isHitejinro) {
          // 하이트진로 전용 템플릿
          enqueueHitejinroStampEarnedAlimTalk({
            storeId: store.id,
            customerId: customer!.id,
            stampLedgerId: franchiseResult.ledger.id,
            phone: phoneNumber,
            variables: {
              storeName: `${franchiseName} ${store.name}`,
              earnedStamps: 1,
              totalStamps: franchiseResult.customer.totalStamps,
              stampRewards: stampUsageRule,
            },
          }).catch((err) => {
            console.error('[TagHere Stamp-Earn] HiteJinro Franchise Stamp AlimTalk enqueue failed:', err);
          });
        } else {
          const reviewGuide = store.reviewAutomationSetting?.benefitText || '진심을 담은 리뷰는 매장에 큰 도움이 됩니다 :)';
          enqueueStampEarnedAlimTalk({
            storeId: store.id,
            customerId: customer!.id,
            stampLedgerId: franchiseResult.ledger.id,
            phone: phoneNumber,
            variables: {
              storeName: `${franchiseName} ${store.name}`,
              earnedStamps: 1,
              totalStamps: franchiseResult.customer.totalStamps,
              stampUsageRule,
              reviewGuide,
            },
            skipAlimtalkCheck: true,
          }).catch((err) => {
            console.error('[TagHere Stamp-Earn] Franchise Stamp AlimTalk enqueue failed:', err);
          });
        }
      }

      // 성공 응답
      const successRewards: RewardEntry[] = franchiseStampSetting.rewards
        ? (franchiseStampSetting.rewards as unknown as RewardEntry[])
        : buildRewardsFromLegacy(franchiseStampSetting as any);

      return res.json({
        success: true,
        currentStamps: franchiseResult.customer.totalStamps,
        customerId: customer!.id,
        storeName: store.name,
        franchiseName,
        isNewCustomer,
        hasVisitSource: !!customer!.visitSource,
        rewards: successRewards,
        drawnReward: franchiseResult.milestoneResult?.reward || null,
        drawnRewardTier: franchiseResult.milestoneResult?.tier || null,
      });
    }

    // ============================================
    // 기존 매장 개별 스탬프 적립
    // ============================================

    // 8. 스탬프 적립 (트랜잭션) - 스탬프 적립 시 무조건 방문횟수 +1
    const previousStamps = customer!.totalStamps ?? 0;
    const isFirstEarn = (customer!.visitCount ?? 0) === 0;
    const firstStampCount = store.stampSetting?.firstStampBonus ?? 1;
    const stampDelta = isFirstEarn && firstStampCount > 1 ? firstStampCount : 1;
    console.log(`[TagHere Stamp-Earn] Before transaction - customerId: ${customer!.id}, previousStamps: ${previousStamps}${stampDelta > 1 ? `, firstStampCount: ${stampDelta}` : ''}`);

    const result = await prisma.$transaction(async (tx) => {
      const newBalance = previousStamps + stampDelta;

      // 고객 스탬프 업데이트
      const updatedCustomer = await tx.customer.update({
        where: { id: customer!.id },
        data: {
          totalStamps: newBalance,
          lastVisitAt: new Date(),
          visitCount: { increment: 1 },
        },
      });

      // 거래 내역 기록
      const ledger = await tx.stampLedger.create({
        data: {
          storeId: store.id,
          customerId: customer!.id,
          type: 'EARN',
          delta: stampDelta,
          balance: newBalance,
          ordersheetId: ordersheetId || null,
          earnMethod: earnMethod as any,
          tableLabel: tableLabel,
          reason: stampDelta > 1
            ? `첫 방문 스탬프 적립 (${stampDelta}개)`
            : (ordersheetId ? `태그히어 주문 적립 (${ordersheetId})` : '스탬프 적립'),
        },
      });

      // 방문/주문 내역 생성 (ordersheetId 유무와 관계없이 항상 생성)
      await tx.visitOrOrder.create({
        data: {
          storeId: store.id,
          customerId: customer!.id,
          orderId: ordersheetId || null,
          visitedAt: new Date(),
          totalAmount: totalAmount,
          items: orderItems.length > 0 || tableLabel ? {
            items: orderItems,
            tableNumber: tableLabel,
          } : undefined,
        },
      });

      // 마일스톤 도달 시 보상 추첨
      const milestoneResult = checkMilestoneAndDraw(previousStamps, newBalance, store.stampSetting!);
      if (milestoneResult) {
        await tx.stampLedger.update({
          where: { id: ledger.id },
          data: {
            drawnReward: milestoneResult.reward,
            drawnRewardTier: milestoneResult.tier,
          },
        });
      }

      return { customer: updatedCustomer, ledger, milestoneResult };
    });

    console.log(`[TagHere Stamp-Earn] Stamp earned - customerId: ${customer.id}, newBalance: ${result.customer.totalStamps}, orderItemsCount: ${orderItems.length}, tableLabel: ${tableLabel}${result.milestoneResult ? `, milestone: ${result.milestoneResult.tier}개 - ${result.milestoneResult.reward}` : ''}`);

    // 9. 알림톡 발송 (비동기)
    // 하이트진로 전용 링크: alimtalkEnabled 설정과 무관하게 발송
    const phoneNumber = customer.phone?.replace(/[^0-9]/g, '');
    const shouldSendAlimtalk = isHitejinro
      ? !!phoneNumber
      : !!(store.stampSetting?.alimtalkEnabled && phoneNumber);

    if (shouldSendAlimtalk) {
      // 하이트진로: 프랜차이즈 통합 스탬프 보상 설정에서 가져옴
      let rewardsForAlimtalk: RewardEntry[];
      if (isHitejinro && store.franchise?.franchiseStampSetting) {
        const fss = store.franchise.franchiseStampSetting;
        rewardsForAlimtalk = fss.rewards
          ? (fss.rewards as unknown as RewardEntry[])
          : buildRewardsFromLegacy(fss as any);
      } else {
        rewardsForAlimtalk = store.stampSetting?.rewards
          ? (store.stampSetting.rewards as unknown as RewardEntry[])
          : store.stampSetting ? buildRewardsFromLegacy(store.stampSetting as any) : [];
      }
      const rules = rewardsForAlimtalk
        .sort((a, b) => a.tier - b.tier)
        .map(r => {
          const isRandom = r.options && Array.isArray(r.options) && r.options.length > 1;
          return `- ${r.tier}개 모을 시: ${isRandom ? '랜덤 박스!' : r.description}`;
        });
      const stampUsageRule = rules.length > 0
        ? '\n' + rules.join('\n')
        : '\n- 10개 모을시 매장 선물 증정!';

      if (isHitejinro) {
        // 하이트진로 전용 템플릿
        enqueueHitejinroStampEarnedAlimTalk({
          storeId: store.id,
          customerId: customer.id,
          stampLedgerId: result.ledger.id,
          phone: phoneNumber!,
          variables: {
            storeName: store.name,
            earnedStamps: stampDelta,
            totalStamps: result.customer.totalStamps,
            stampRewards: stampUsageRule,
          },
        }).catch((err) => {
          console.error('[TagHere Stamp-Earn] HiteJinro Stamp AlimTalk enqueue failed:', err);
        });
      } else {
        const reviewGuide = store.reviewAutomationSetting?.benefitText || '진심을 담은 리뷰는 매장에 큰 도움이 됩니다 :)';
        enqueueStampEarnedAlimTalk({
          storeId: store.id,
          customerId: customer.id,
          stampLedgerId: result.ledger.id,
          phone: phoneNumber!,
          variables: {
            storeName: store.name,
            earnedStamps: stampDelta,
            totalStamps: result.customer.totalStamps,
            stampUsageRule,
            reviewGuide,
          },
        }).catch((err) => {
          console.error('[TagHere Stamp-Earn] Stamp AlimTalk enqueue failed:', err);
        });
      }
    }

    // 10. 성공 응답
    const successRewards: RewardEntry[] = store.stampSetting!.rewards
      ? (store.stampSetting!.rewards as unknown as RewardEntry[])
      : buildRewardsFromLegacy(store.stampSetting as any);
    const successLegacy: Record<string, any> = {};
    for (const entry of successRewards) {
      successLegacy[`reward${entry.tier}Description`] = entry.description;
      successLegacy[`reward${entry.tier}IsRandom`] = entry.options && Array.isArray(entry.options) && entry.options.length > 1;
    }

    res.json({
      success: true,
      currentStamps: result.customer.totalStamps,
      customerId: customer.id,
      storeName: store.name,
      isNewCustomer,
      hasVisitSource: !!customer.visitSource,
      rewards: successRewards,
      ...successLegacy,
      drawnReward: result.milestoneResult?.reward || null,
      drawnRewardTier: result.milestoneResult?.tier || null,
    });
  } catch (error: any) {
    console.error('[TagHere Stamp-Earn] Error:', error);
    res.status(500).json({
      success: false,
      error: 'server_error',
      message: '스탬프 적립 중 오류가 발생했습니다.',
    });
  }
});

// GET /api/taghere/visit-source-options/:slug - 매장의 활성화된 방문 경로 옵션 조회 (공개 API)
router.get('/visit-source-options/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    // 매장 조회
    const store = await prisma.store.findFirst({
      where: { slug },
      select: {
        id: true,
        visitSourceSetting: true,
      },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    // 설정이 없거나 비활성화된 경우
    if (!store.visitSourceSetting?.enabled) {
      return res.json({
        enabled: false,
        options: [],
      });
    }

    // 활성화된 옵션만 필터링하여 반환
    const allOptions = store.visitSourceSetting.options as Array<{
      id: string;
      label: string;
      order: number;
      enabled: boolean;
    }>;

    const enabledOptions = allOptions
      .filter(o => o.enabled)
      .sort((a, b) => a.order - b.order)
      .map(o => ({ id: o.id, label: o.label }));

    res.json({
      enabled: true,
      options: enabledOptions,
    });
  } catch (error: any) {
    console.error('[TagHere] Visit source options error:', error);
    res.status(500).json({ error: '방문 경로 옵션 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/taghere/survey-questions/:slug - 매장의 활성 설문 질문 목록 (공개)
router.get('/survey-questions/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    const store = await prisma.store.findFirst({
      where: { slug },
      select: { id: true },
    });

    if (!store) {
      return res.json({ questions: [] });
    }

    const questions = await prisma.surveyQuestion.findMany({
      where: { storeId: store.id, enabled: true },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        type: true,
        label: true,
        description: true,
        required: true,
        choiceOptions: true,
      },
    });

    res.json({ questions });
  } catch (error: any) {
    console.error('[TagHere] Survey questions error:', error);
    res.status(500).json({ error: '설문 질문 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/taghere/survey-answers - 설문 답변 저장 (공개)
router.post('/survey-answers', async (req, res) => {
  try {
    const { customerId, answers } = req.body;

    if (!customerId || !Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: '고객 ID와 답변이 필요합니다.' });
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, storeId: true },
    });

    if (!customer) {
      return res.status(404).json({ error: '고객을 찾을 수 없습니다.' });
    }

    for (const answer of answers) {
      if (!answer.questionId) continue;

      await prisma.surveyAnswer.upsert({
        where: {
          questionId_customerId: {
            questionId: answer.questionId,
            customerId,
          },
        },
        create: {
          questionId: answer.questionId,
          customerId,
          storeId: customer.storeId,
          valueDate: answer.valueDate ? new Date(answer.valueDate) : null,
          valueText: answer.valueText || null,
        },
        update: {
          valueDate: answer.valueDate ? new Date(answer.valueDate) : null,
          valueText: answer.valueText || null,
        },
      });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('[TagHere] Survey answers save error:', error);
    res.status(500).json({ error: '설문 답변 저장 중 오류가 발생했습니다.' });
  }
});

// GET /api/taghere/order-details - 주문 상세 정보 조회 (태그히어 모바일오더 API 호출)
// 모든 매장의 성공 페이지에서 사용
router.get('/order-details', async (req, res) => {
  try {
    const storeId = req.query.storeId as string | undefined;
    const ordersheetId = (req.query.ordersheetId || req.query.orderId) as string | undefined;
    const slug = req.query.slug as string | undefined;

    if (!ordersheetId) {
      return res.status(400).json({ error: 'ordersheetId 또는 orderId가 필요합니다.' });
    }

    // slug 또는 storeId로 매장 조회하여 version 판별
    let store = null;
    if (slug) {
      store = await prisma.store.findFirst({
        where: { slug },
        select: { id: true, name: true, taghereVersion: true },
      });
    } else if (storeId) {
      store = await prisma.store.findUnique({
        where: { id: storeId },
        select: { id: true, name: true, taghereVersion: true },
      });
    }

    const version = store?.taghereVersion || 'v1';

    console.log(`[TagHere] Fetching order details - storeId: ${storeId}, ordersheetId: ${ordersheetId}, version: ${version}`);

    // 서비스 레이어를 통한 주문 조회 (V1/V2 자동 분기)
    const orderData = await fetchOrder(ordersheetId, version);

    if (!orderData) {
      return res.status(404).json({ error: '주문 정보를 찾을 수 없습니다.' });
    }

    // 응답 데이터 가공
    const orderDetails = {
      storeName: (orderData as any).storeName || store?.name || '태그히어',
      storeLogoUrl: (orderData as any).storeLogoUrl || null,
      orderNumber: (orderData as any).displayOrderNumber || (orderData as any).orderNumber || `T-${ordersheetId}`,
      tableNumber: orderData.tableLabel || null,
      items: (orderData.items || orderData.orderItems || []).map((item: any) => ({
        name: item.name || item.menuName || item.label || '상품',
        quantity: item.quantity || item.count || 1,
      })),
      totalPrice: (() => {
        const rawPrice = orderData.content?.resultPrice || orderData.resultPrice || orderData.content?.totalPrice || orderData.totalPrice || 0;
        return typeof rawPrice === 'string' ? parseInt(rawPrice, 10) : rawPrice;
      })(),
      menuLink: (orderData as any).menuLink || null,
    };

    res.json(orderDetails);
  } catch (error: any) {
    console.error('[TagHere] Order details error:', error);
    res.status(500).json({ error: error.message || '주문 정보 조회 중 오류가 발생했습니다.' });
  }
});

export default router;
