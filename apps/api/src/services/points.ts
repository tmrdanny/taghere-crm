/**
 * 포인트 적립/사용/주문취소 차감 - 도메인 서비스
 *
 * routes/points.ts, routes/customers.ts 가 사용한다.
 * 응답 매핑은 라우트에 남기고, 여기서는 도메인 로직만 수행한다.
 * (place-booster-service.ts 의 BoosterError 패턴을 따른다)
 */

import type { Customer } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { toPhoneLastDigits } from '../utils/phone.js';
import { sidoToShort } from '../utils/address-parser.js';
import { syncToMetacity } from './metacity.js';
import { notifyYahwaPointsChange } from './yahwa-webhook.js';
import {
  enqueuePointsEarnedAlimTalk,
  enqueueNaverReviewAlimTalk,
  enqueuePointsUsedAlimTalk,
} from './solapi.js';
import {
  DEFERRED_ACCRUAL_REASON_PREFIX,
  hasTodayEarnLedger,
  hasTodayPendingAccrual,
} from './pending-point-accrual.js';

export class PointsError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * 매직포스 단독 회원(STANDALONE) 매장은 메타씨티 POS 가 포인트의 진실원천이므로
 * CRM 어드민/사장님 화면에서의 수동 포인트 조정은 허용하지 않는다.
 */
export async function isStandaloneMagicposStore(storeId: string): Promise<boolean> {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { metacityEnabled: true, metacityMembershipType: true },
  });
  return !!(store?.metacityEnabled && store.metacityMembershipType === 'STANDALONE');
}

export const STANDALONE_BLOCK_MESSAGE =
  '매직포스 단독 회원 매장은 메타씨티 POS 가 포인트의 진실원천이라 어드민에서 수동 조정할 수 없습니다.';

// ── 포인트 적립 (POST /api/points/earn) ──────────────────────────────

export interface EarnPointsInput {
  phone?: string;
  customerId?: string;
  points: number;
  orderId?: string;
  storeId: string;
  staffUserId: string;
}

export interface EarnPointsResult {
  customer: Customer;
  newBalance: number;
}

export async function earnPoints(input: EarnPointsInput): Promise<EarnPointsResult> {
  const { phone, customerId, points, orderId, storeId, staffUserId } = input;

  if (!points || points <= 0) {
    throw new PointsError('적립할 포인트를 입력해주세요.');
  }

  if (await isStandaloneMagicposStore(storeId)) {
    throw new PointsError(STANDALONE_BLOCK_MESSAGE);
  }

  let customer;

  // Find or create customer
  if (customerId) {
    customer = await prisma.customer.findFirst({
      where: { id: customerId, storeId },
    });
  } else if (phone) {
    // Normalize phone to last 8 digits
    const phoneLastDigits = toPhoneLastDigits(phone);

    customer = await prisma.customer.findFirst({
      where: { storeId, phoneLastDigits },
    });

    // Create new customer if not found
    if (!customer) {
      // 매장 정보 조회 (지역 정보)
      const store = await prisma.store.findUnique({
        where: { id: storeId },
        select: { addressSido: true, addressSigungu: true },
      });

      customer = await prisma.customer.create({
        data: {
          storeId,
          phoneLastDigits,
          phone: `010-${phoneLastDigits.slice(0, 4)}-${phoneLastDigits.slice(4)}`,
          totalPoints: 0,
          visitCount: 0,
          regionSido: sidoToShort(store?.addressSido ?? null),
          regionSigungu: store?.addressSigungu || null,
          consentMarketing: true,
          consentAt: new Date(),
        },
      });
    }
  } else {
    throw new PointsError('전화번호 또는 고객 ID가 필요합니다.');
  }

  if (!customer) {
    throw new PointsError('고객을 찾을 수 없습니다.', 404);
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
  notifyYahwaPointsChange(updatedCustomer.id).catch(() => {});

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
        savePoint: points,
      }).catch(err => console.error('[Metacity] POINT_SAVE sync failed:', err.message));
    }
  }

  // 알림톡 발송 (비동기 - 실패해도 응답에 영향 없음)
  if (updatedCustomer.phone) {
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true, pointsAlimtalkFrequency: true },
    });

    const phoneNumber = updatedCustomer.phone.replace(/[^0-9]/g, '');

    // 발송 빈도 확인: EVERY_ORDER(매 주문) 또는 FIRST_ONLY(오늘 첫 주문만)
    const frequency = store?.pointsAlimtalkFrequency || 'EVERY_ORDER';
    const shouldSendAlimtalk = frequency === 'EVERY_ORDER' || (frequency === 'FIRST_ONLY' && isFirstEarnToday);

    // 1. 포인트 적립 알림톡
    if (shouldSendAlimtalk) {
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
    }

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

  return { customer: updatedCustomer, newBalance };
}

// ── 포인트 사용 (POST /api/points/use) ───────────────────────────────

export interface UsePointsInput {
  customerId?: string;
  points: number;
  reason?: string;
  storeId: string;
  staffUserId: string;
}

export interface UsePointsResult {
  customer: Customer;
  newBalance: number;
}

export async function usePoints(input: UsePointsInput): Promise<UsePointsResult> {
  const { customerId, points, reason, storeId, staffUserId } = input;

  if (!customerId) {
    throw new PointsError('고객 ID가 필요합니다.');
  }

  if (!points || points <= 0) {
    throw new PointsError('사용할 포인트를 입력해주세요.');
  }

  if (await isStandaloneMagicposStore(storeId)) {
    throw new PointsError(STANDALONE_BLOCK_MESSAGE);
  }

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, storeId },
  });

  if (!customer) {
    throw new PointsError('고객을 찾을 수 없습니다.', 404);
  }

  if (customer.totalPoints < points) {
    throw new PointsError('보유 포인트가 부족합니다.');
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
  notifyYahwaPointsChange(updatedCustomer.id).catch(() => {});

  // 메타씨티 포인트 사용 동기화 (비동기)
  {
    const storeForMetacity = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, metacityEnabled: true, metacityStoreIdx: true },
    });
    if (storeForMetacity?.metacityEnabled) {
      syncToMetacity({
        store: storeForMetacity,
        customer: updatedCustomer,
        operationType: 'POINT_USE',
        orderNo: ledger.id,
        usedPoint: points,
      }).catch(err => console.error('[Metacity] POINT_USE sync failed:', err.message));
    }
  }

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

  return { customer: updatedCustomer, newBalance };
}

// ── 주문 아이템 취소 시 적립 역처리 (POST /api/customers/:id/cancel-order-item) ──

export interface ReverseOrderItemAccrualInput {
  customerId: string;
  storeId: string;
  visitOrOrderId?: string;
  itemIndex?: number;
  cancelQuantity?: number;
}

export type ReverseOrderItemAccrualResult =
  | {
      kind: 'PENDING_ACCRUAL_REDUCED';
      cancelledQuantity: number;
      isFullyCancelled: boolean;
      pendingAccrualReduced: number;
    }
  | {
      kind: 'CANCELLED';
      menuName: string;
      pointsDeducted: number;
      cancelledPrice: number;
      cancelQty: number;
      itemTotalQty: number;
      newCancelledQty: number;
      isFullyCancelled: boolean;
    };

export async function reverseOrderItemAccrual(
  input: ReverseOrderItemAccrualInput
): Promise<ReverseOrderItemAccrualResult> {
  const { customerId: id, storeId, visitOrOrderId, itemIndex, cancelQuantity } = input;

  if (!visitOrOrderId || itemIndex === undefined) {
    throw new PointsError('주문 ID와 아이템 인덱스가 필요합니다.');
  }

  // Verify customer exists and belongs to the store (with store name and point rate for AlimTalk)
  const customer = await prisma.customer.findFirst({
    where: { id, storeId },
    include: {
      store: {
        select: { name: true, pointRatePercent: true },
      },
    },
  });

  if (!customer) {
    throw new PointsError('고객을 찾을 수 없습니다.', 404);
  }

  // Find the visit/order
  const visitOrOrder = await prisma.visitOrOrder.findFirst({
    where: { id: visitOrOrderId, storeId, customerId: id },
  });

  if (!visitOrOrder) {
    throw new PointsError('주문을 찾을 수 없습니다.', 404);
  }

  // Parse items
  let items: any[] = [];
  const itemsData = visitOrOrder.items as any;
  if (itemsData) {
    if (Array.isArray(itemsData)) {
      items = itemsData;
    } else if (typeof itemsData === 'object' && itemsData.items) {
      items = itemsData.items;
    }
  }

  if (itemIndex < 0 || itemIndex >= items.length) {
    throw new PointsError('유효하지 않은 아이템 인덱스입니다.');
  }

  const targetItem = items[itemIndex];

  // Get item quantity
  const itemTotalQty = targetItem.count || targetItem.quantity || targetItem.qty || 1;
  const alreadyCancelledQty = targetItem.cancelledQuantity || 0;
  const remainingQty = itemTotalQty - alreadyCancelledQty;

  // Check if already fully cancelled
  if (targetItem.cancelled || remainingQty <= 0) {
    throw new PointsError('이미 취소된 아이템입니다.');
  }

  // Determine cancel quantity (default: cancel all remaining)
  const cancelQty = cancelQuantity !== undefined ? Math.min(cancelQuantity, remainingQty) : remainingQty;

  if (cancelQty <= 0) {
    throw new PointsError('취소할 수량은 1 이상이어야 합니다.');
  }

  // Calculate points to deduct using store's pointRatePercent (same as earn logic)
  const pointRatePercent = customer.store.pointRatePercent ?? 5; // 기본값 5%

  // Debug: log the target item structure
  console.log('[Cancel Order Item] targetItem:', JSON.stringify(targetItem, null, 2));

  const itemPrice = typeof targetItem.price === 'string'
    ? parseInt(targetItem.price, 10)
    : (targetItem.price || 0);

  // Calculate price for cancelled quantity only (not total)
  const cancelledPrice = itemPrice * cancelQty;

  // Debug: log calculated values
  console.log('[Cancel Order Item] itemPrice:', itemPrice, 'cancelQty:', cancelQty, 'cancelledPrice:', cancelledPrice);
  console.log('[Cancel Order Item] pointRatePercent:', pointRatePercent);

  // 적립과 동일한 방식으로 포인트 계산 (취소된 수량 기준)
  const pointsToDeduct = Math.round(cancelledPrice * (pointRatePercent / 100));
  console.log('[Cancel Order Item] pointsToDeduct:', cancelledPrice, '*', pointRatePercent / 100, '=', pointsToDeduct);

  // Update cancelled quantity
  const newCancelledQty = alreadyCancelledQty + cancelQty;
  const isFullyCancelled = newCancelledQty >= itemTotalQty;

  // Mark item as cancelled (partial or full)
  items[itemIndex] = {
    ...targetItem,
    cancelledQuantity: newCancelledQty,
    cancelled: isFullyCancelled,
    cancelledAt: new Date().toISOString(),
  };

  // Update the visit/order with cancelled item
  const updatedItemsData = Array.isArray(itemsData)
    ? items
    : { ...itemsData, items };

  await prisma.visitOrOrder.update({
    where: { id: visitOrOrderId },
    data: { items: updatedItemsData },
  });

  // 지연 적립 예약만 있고 아직 적립되지 않은 주문이면, 고객의 다른 잔액에서 빼면 안 된다.
  // 대신 아직 지급 전인 예약 금액을 줄여 결제완료 시 감액된 금액만 적립되게 한다.
  const pendingAccrual = visitOrOrder.orderId
    ? await prisma.pendingPointAccrual.findUnique({
        where: { storeId_orderId: { storeId, orderId: visitOrOrder.orderId } },
        select: { id: true, status: true, earnPoints: true },
      })
    : null;

  if (pendingAccrual?.status === 'PENDING' && pointsToDeduct > 0) {
    const reducedEarnPoints = Math.max(0, pendingAccrual.earnPoints - pointsToDeduct);
    await prisma.pendingPointAccrual.update({
      where: { id: pendingAccrual.id },
      data: { earnPoints: reducedEarnPoints },
    });
    console.log(
      `[Cancel Order Item] 적립 예약 감액 - orderId: ${visitOrOrder.orderId}, ${pendingAccrual.earnPoints} → ${reducedEarnPoints}`,
    );

    return {
      kind: 'PENDING_ACCRUAL_REDUCED',
      cancelledQuantity: newCancelledQty,
      isFullyCancelled,
      pendingAccrualReduced: pendingAccrual.earnPoints - reducedEarnPoints,
    };
  }

  // Deduct points if applicable
  if (pointsToDeduct > 0) {
    // Get current customer points
    const currentCustomer = await prisma.customer.findUnique({
      where: { id },
      select: { totalPoints: true },
    });

    const currentPoints = currentCustomer?.totalPoints || 0;
    const newBalance = Math.max(0, currentPoints - pointsToDeduct);
    const actualDeduction = currentPoints - newBalance;

    if (actualDeduction > 0) {
      // Create point ledger entry for deduction
      const itemName = targetItem.label || targetItem.name || targetItem.menuName || '메뉴';
      const cancelReason = isFullyCancelled
        ? `주문 취소 차감 (${itemName})`
        : `주문 취소 차감 (${itemName} ${cancelQty}개)`;

      await prisma.pointLedger.create({
        data: {
          storeId,
          customerId: id,
          delta: -actualDeduction,
          balance: newBalance,
          type: 'ADJUST',
          reason: cancelReason,
          orderId: visitOrOrder.orderId,
        },
      });

      // Update customer's total points
      const updatedCustomerForCancel = await prisma.customer.update({
        where: { id },
        data: { totalPoints: newBalance },
      });

      // 메타씨티 포인트 취소 동기화 (비동기)
      {
        const storeForMetacity = await prisma.store.findUnique({
          where: { id: storeId },
          select: { id: true, metacityEnabled: true, metacityStoreIdx: true },
        });
        if (storeForMetacity?.metacityEnabled) {
          // 원래 적립 ledger를 찾아서 동일한 ORDER_NO로 취소 요청
          const originalEarnLedger = await prisma.pointLedger.findFirst({
            where: { storeId, customerId: id, orderId: visitOrOrder.orderId, type: 'EARN' },
            select: { id: true },
          });
          const cancelOrderNo = originalEarnLedger?.id || visitOrOrder.orderId || visitOrOrderId;
          syncToMetacity({
            store: storeForMetacity,
            customer: updatedCustomerForCancel,
            operationType: 'POINT_SAVE_CANCEL',
            orderNo: cancelOrderNo,
            purAmt: cancelledPrice,
            savePoint: actualDeduction,
          }).catch(err => console.error('[Metacity] POINT_SAVE_CANCEL sync failed:', err.message));
        }
      }

      // Send AlimTalk notification for point deduction (with negative points)
      const phoneNumber = customer.phone?.replace(/[^0-9]/g, '');
      if (phoneNumber) {
        // Get the newly created point ledger entry
        const pointLedger = await prisma.pointLedger.findFirst({
          where: { customerId: id, type: 'ADJUST' },
          orderBy: { createdAt: 'desc' },
        });

        if (pointLedger) {
          enqueuePointsEarnedAlimTalk({
            storeId,
            customerId: id,
            pointLedgerId: pointLedger.id,
            phone: phoneNumber,
            variables: {
              storeName: customer.store.name,
              points: -actualDeduction, // 음수로 전달 (예: -550)
              totalPoints: newBalance,
            },
          }).catch((err) => {
            console.error('[Cancel Order Item] AlimTalk enqueue failed:', err);
          });
        }
      }
    }
  }

  // Get menu name for response
  const menuName = targetItem.label || targetItem.name || targetItem.menuName || targetItem.productName || '메뉴';

  return {
    kind: 'CANCELLED',
    menuName,
    pointsDeducted: pointsToDeduct,
    cancelledPrice,
    cancelQty,
    itemTotalQty,
    newCancelledQty,
    isFullyCancelled,
  };
}
