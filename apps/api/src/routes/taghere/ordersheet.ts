import { Router } from 'express';
import { toPhoneLastDigits } from '../../utils/phone.js';
import { prisma } from '../../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../../middleware/auth.js';
import { enqueuePointsEarnedAlimTalk } from '../../services/solapi.js';
import { fetchOrder } from '../../services/taghere-api.js';
import { sidoToShort } from '../../utils/address-parser.js';
import { syncToMetacity } from '../../services/metacity.js';
import {
  buildPendingAccrualData,
  DEFERRED_ACCRUAL_REASON_PREFIX,
  findPendingAccrual,
  hasTodayEarnLedger,
  hasTodayPendingAccrual,
} from '../../services/pending-point-accrual.js';
import { isVisitSourceRecent } from '../../services/stamps.js';
import { findCustomerProfileByKakaoId } from '../../services/customer-identity.js';

const router = Router();

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
        addressSido: true,
        addressSigungu: true,
        metacityEnabled: true,
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
    const ratePercent = store.pointRatePercent ?? 5;
    const earnPoints = Math.round(resultPrice * ratePercent / 100);
    console.log(`[TagHere Earn] storeId: ${store.id}, resultPrice: ${resultPrice}, ratePercent: ${ratePercent}, earnPoints: ${earnPoints}`);

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

    // 결제완료까지 적립을 미루는 주문인지 (후불 + 결제완료 감지 가능 POS). 메타씨티 매장은 항상 즉시.
    const pointAccrualDeferred = orderData.pointAccrualDeferred === true && !store.metacityEnabled;

    // 이미 적립 "예약"된 주문인지 (원장이 없어 alreadyEarned 로는 잡히지 않는다)
    const pendingAccrual = await findPendingAccrual(store.id, ordersheetId);

    res.json({
      storeId: store.id,
      storeName: (orderData as any).storeName || store.name,
      ordersheetId,
      resultPrice,
      ratePercent,
      earnPoints,
      alreadyEarned: !!existingEarn,
      pointAccrualDeferred,
      accrualPending: pendingAccrual?.status === 'PENDING',
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
        addressSido: true,
        addressSigungu: true,
        pointsAlimtalkEnabled: true,
        pointsAlimtalkFrequency: true,
        metacityEnabled: true,
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

      // 적립 예약된 주문은 원장이 없어 위 체크에 걸리지 않는다 → 별도 코드로 구분해 응답
      const existingPending = await findPendingAccrual(store.id, ordersheetId);
      if (existingPending?.status === 'PENDING') {
        return res.status(409).json({
          success: false,
          error: 'already_reserved',
          message: '이미 적립 예약된 주문입니다. 결제가 완료되면 자동으로 적립돼요.',
          earnPoints: existingPending.earnPoints,
        });
      }
      // 취소된 주문은 적립 대상이 아니다. 그대로 진행하면 재예약이 (storeId, orderId) 유니크를 위반한다.
      if (existingPending?.status === 'CANCELED') {
        return res.status(409).json({
          success: false,
          error: 'accrual_canceled',
          message: '취소된 주문입니다.',
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

      const { existingCustomer, phone: phoneToUse, phoneLastDigits: phoneLastDigitsToUse } =
        await findCustomerProfileByKakaoId({
          storeId: store.id,
          kakaoId,
          onPhoneConflict: () => {
            console.log(`[TagHere Auto-Earn] Phone already exists in store, skipping phone copy - storeId: ${store.id}`);
          },
        });

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
          regionSido: sidoToShort(store.addressSido) ?? null,
          regionSigungu: store.addressSigungu ?? null,
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

      // 알림톡 자동 발송 제거: 사용자가 멤버십 페이지의 쿠폰 시트에서 직접 트리거

      // 멤버십 성공 응답
      res.json({
        success: true,
        mode: 'membership',
        storeName: store.name,
        customerId: customer.id,
        resultPrice,
        isNewCustomer,
        showCouponSheet: true,
        hasExistingPreferences: !!(customer as any).preferredCategories,
        hasVisitSource: isVisitSourceRecent((customer as any).visitSourceUpdatedAt),
      });
    } else {
      // ===== 포인트 모드: 기존 로직 =====
      const ratePercent = store.pointRatePercent ?? 5;
      // 0원 주문은 포인트 적립 불가 (악용 방지)
      const earnPoints = resultPrice > 0 ? Math.round(resultPrice * ratePercent / 100) : 0;
      console.log(`[TagHere Auto-Earn Points] storeId: ${store.id}, resultPrice: ${resultPrice}, ratePercent: ${ratePercent}, earnPoints: ${earnPoints}`);

      // 후불 + 결제완료 감지 가능 POS 주문은 결제완료까지 적립을 미룬다(메타씨티 매장 제외).
      const shouldDefer =
        orderData?.pointAccrualDeferred === true && !store.metacityEnabled && earnPoints > 0;

      const newBalance = shouldDefer ? customer.totalPoints : customer.totalPoints + earnPoints;

      const todayVisit = await prisma.pointLedger.findFirst({
        where: {
          customerId: customer.id,
          storeId: store.id,
          type: 'EARN',
          createdAt: { gte: todayStart, lte: todayEnd },
          // 지연 전환분은 createdAt 이 결제완료 시각이라 방문 판정 근거가 될 수 없다.
          // reason 은 nullable 이라 NOT startsWith 만 쓰면 NULL 행이 통째로 빠진다(NULL LIKE → NULL).
          OR: [{ reason: null }, { reason: { not: { startsWith: DEFERRED_ACCRUAL_REASON_PREFIX } } }],
        },
      });
      // 방문 카운트용: 지연 적립은 EARN 원장을 만들지 않으므로 예약도 함께 봐야
      // 같은 날 추가주문에서 visitCount 가 또 오르지 않는다.
      const isFirstVisitToday =
        !todayVisit && !(await hasTodayPendingAccrual(store.id, customer.id));
      // 알림톡 FIRST_ONLY 빈도용: "오늘 첫 적립" 기준이므로 EARN 원장만 본다.
      // 알림톡 FIRST_ONLY 는 "오늘 이미 적립 알림톡이 나갔는가" 기준이라 지연 전환분도 포함해서 본다.
      const isFirstEarnToday = !(await hasTodayEarnLedger(store.id, customer.id));

      const earnTransactionOps: any[] = [
        prisma.customer.update({
          where: { id: customer.id },
          data: {
            // 지연 적립이면 잔액은 그대로 두고 방문 통계만 갱신한다.
            ...(!shouldDefer && earnPoints > 0 && { totalPoints: newBalance }),
            ...(isFirstVisitToday && { visitCount: { increment: 1 } }),
            lastVisitAt: new Date(),
          },
        }),
      ];

      if (shouldDefer) {
        earnTransactionOps.push(
          prisma.pendingPointAccrual.create({
            data: buildPendingAccrualData({
              storeId: store.id,
              customerId: customer.id,
              orderId: ordersheetId,
              purAmt: resultPrice,
              ratePercent,
              earnPoints,
              tableLabel,
              // 리다이렉트 경로는 원래 항상 적립 알림톡을 보냈다 → 전환 시점에 발송.
              sendAlimtalk: true,
              source: 'AUTO_EARN',
            }),
          }),
        );
      } else if (earnPoints > 0) {
        earnTransactionOps.push(
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
        );
      }

      earnTransactionOps.push(
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
      );

      await prisma.$transaction(earnTransactionOps);

      console.log(`[TagHere Auto-Earn] Points earned - customerId: ${customer.id}, earnPoints: ${earnPoints}, newBalance: ${newBalance}, orderItemsCount: ${orderItems.length}, tableLabel: ${tableLabel}`);

      // 0원 주문은 메타씨티 동기화 / 알림톡 모두 스킵
      // 지연 적립도 여기서는 스킵 — 실제 적립 시점(finalizePendingAccrual)에서 알림톡을 보낸다.
      if (!shouldDefer && earnPoints > 0) {
        // 메타씨티 포인트 동기화 (비동기)
        {
          const storeForMetacity = await prisma.store.findUnique({
            where: { id: store.id },
            select: { id: true, metacityEnabled: true, metacityStoreIdx: true },
          });
          if (storeForMetacity?.metacityEnabled) {
            const latestCustomer = await prisma.customer.findUnique({
              where: { id: customer.id },
            });
            if (latestCustomer) {
              const latestLedger = await prisma.pointLedger.findFirst({
                where: { customerId: customer.id },
                orderBy: { createdAt: 'desc' },
              });
              syncToMetacity({
                store: storeForMetacity,
                customer: latestCustomer,
                operationType: 'POINT_SAVE',
                orderNo: latestLedger?.id || ordersheetId,
                purAmt: resultPrice > 0 ? resultPrice : 0,
                savePoint: earnPoints,
              }).catch(err => console.error('[Metacity] POINT_SAVE (auto-earn) sync failed:', err.message));
            }
          }
        }

        // 알림톡 발송 (전화번호가 있는 경우만, 비동기)
        // 발송 빈도 확인: EVERY_ORDER(매 주문) 또는 FIRST_ONLY(오늘 첫 주문만)
        const frequency = store.pointsAlimtalkFrequency || 'EVERY_ORDER';
        const shouldSendAlimtalk = store.pointsAlimtalkEnabled && (frequency === 'EVERY_ORDER' || (frequency === 'FIRST_ONLY' && isFirstEarnToday));

        const phoneNumber = customer.phone?.replace(/[^0-9]/g, '');
        if (phoneNumber && shouldSendAlimtalk) {
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
      }

      // 포인트 성공 응답 (deferred=true 면 points 는 "결제 완료 시 적립될 예정 포인트")
      res.json({
        success: true,
        points: earnPoints,
        totalPoints: newBalance,
        storeName: store.name,
        customerId: customer.id,
        resultPrice,
        isNewCustomer,
        deferred: shouldDefer,
        hasExistingPreferences: !!(customer as any).preferredCategories,
        hasVisitSource: isVisitSourceRecent((customer as any).visitSourceUpdatedAt),
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
      const phoneLastDigits = toPhoneLastDigits(phone);
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

// /order-details는 원본 파일 최하단(다른 도메인 라우트들 뒤)에 등록돼 있었다.
// 등록 순서를 보존하기 위해 별도 라우터로 분리해 index.ts에서 마지막에 마운트한다.
const orderDetailsRouter = Router();

// GET /api/taghere/order-details - 주문 상세 정보 조회 (태그히어 모바일오더 API 호출)
// 모든 매장의 성공 페이지에서 사용
orderDetailsRouter.get('/order-details', async (req, res) => {
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

export { orderDetailsRouter };

export default router;
