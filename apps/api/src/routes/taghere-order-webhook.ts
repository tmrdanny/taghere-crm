import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { webhookAuthMiddleware, WebhookRequest } from '../middleware/webhook-auth.js';
import { fetchOrder, resolveCrmPageMode, TaghereOrderData } from '../services/taghere-api.js';
import { findStoreByV2Ref } from '../services/store-ref.js';
import { resolveVersionForOrder } from '../services/taghere-version.js';
import { findOrCreateCustomerByPhone, normalizeCustomerProfile } from '../services/customer-identity.js';
import { checkMilestoneAndDraw, buildRewardsFromLegacy, buildStampUsageRule, RewardEntry } from '../utils/random-reward.js';
import { enqueueStampEarnedAlimTalk } from '../services/solapi.js';
import { toPhoneLastDigits } from '../utils/phone.js';
import {
  buildPendingStampAccrualData,
  DEFERRED_STAMP_REASON_PREFIX,
  findPendingStampAccrual,
  hasTodayPendingStampAccrual,
  isPendingStampAccrualConflict,
} from '../services/pending-stamp-accrual.js';

const router = Router();

/**
 * 주문 서비스에서 조회한 주문 데이터를 CRM 기록용(items/tableLabel/totalAmount)으로 정규화한다.
 * 조회 실패/미존재 시 기본값(빈 배열/null)을 반환해 적립 흐름은 계속 진행한다.
 */
async function extractOrderContext(
  orderId: string,
  taghereVersion: string,
): Promise<{ orderItems: any[]; tableLabel: string | null; totalAmount: number | null }> {
  let orderData: TaghereOrderData | null = null;
  try {
    orderData = await fetchOrder(orderId, taghereVersion);
  } catch (e) {
    console.error('[TagHere Order Webhook] Failed to fetch order:', e);
  }

  if (!orderData) {
    return { orderItems: [], tableLabel: null, totalAmount: null };
  }

  const rawPrice = orderData.content?.resultPrice || orderData.resultPrice ||
                   orderData.content?.totalPrice || orderData.totalPrice || 0;
  const parsedAmount = typeof rawPrice === 'string' ? parseInt(rawPrice, 10) : Number(rawPrice) || 0;
  const totalAmount = parsedAmount > 0 ? parsedAmount : null;

  const rawItems = orderData.content?.items || orderData.orderItems || orderData.items || [];
  const orderItems = rawItems.map((item: any) => ({
    name: item.label || item.name || item.menuName || item.productName ||
          item.title || item.itemName || item.menuTitle || null,
    quantity: item.count || item.quantity || item.qty || item.amount || 1,
    price: typeof item.price === 'string' ? parseInt(item.price, 10) :
           (item.price || item.unitPrice || item.itemPrice || item.totalPrice || 0),
    option: item.option || null,
  }));

  let tableLabel: string | null = orderData.content?.tableLabel || orderData.tableLabel ||
                   (orderData as any).content?.tableNumber || (orderData as any).tableNumber || null;
  if (!tableLabel) {
    const tableID = (orderData as any).tableID || (orderData as any).content?.tableID;
    if (tableID && typeof tableID === 'string' && tableID.length < 10) {
      tableLabel = tableID;
    }
  }

  return { orderItems, tableLabel, totalAmount };
}

/**
 * POST /api/taghere/webhook/membership/register
 *
 * 주문 서비스(Bearer)에서 전화번호 기반 멤버십 등록. 단일 매장 전용.
 * VisitOrOrder 기록만 하고 포인트는 적립하지 않는다(멤버십 모드).
 * 동일 orderId 재요청은 409.
 */
router.post('/membership/register', webhookAuthMiddleware, async (req: WebhookRequest, res) => {
  try {
    const { storeId, storeSlug, phone, orderId } = req.body as {
      storeId?: string;
      storeSlug?: string;
      phone?: string;
      orderId?: string;
    };

    if ((!storeId && !storeSlug) || !phone || !orderId) {
      return res.status(400).json({
        success: false,
        error: 'missing_params',
        message: 'storeId 또는 storeSlug, 그리고 phone, orderId는 필수입니다.',
      });
    }

    const store = await findStoreByV2Ref('membership/register', { storeId, storeSlug }, {
        id: true,
        name: true,
        taghereVersion: true,
        v1StoreId: true,
        v2StoreId: true,
        addressSido: true,
        addressSigungu: true,
    });

    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'store_not_found',
        message: '매장을 찾을 수 없습니다.',
      });
    }

    // 중복 방지: 동일 orderId 의 VisitOrOrder 가 이미 있으면 409
    const existingVisit = await prisma.visitOrOrder.findFirst({
      where: { storeId: store.id, orderId },
    });
    if (existingVisit) {
      return res.status(409).json({
        success: false,
        error: 'already_earned',
        message: '이미 등록된 주문입니다.',
      });
    }

    // 전화번호로 고객 find-or-create (kakaoId 식별 블록 대체)
    const { customer, isNewCustomer } = await findOrCreateCustomerByPhone(
      store.id,
      phone,
      store.addressSido ?? null,
      store.addressSigungu ?? null,
      normalizeCustomerProfile(req.body),
    );

    const { orderItems, tableLabel, totalAmount } = await extractOrderContext(orderId, resolveVersionForOrder(store, orderId));

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

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
          orderId,
          visitedAt: new Date(),
          totalAmount: totalAmount && totalAmount > 0 ? totalAmount : null,
          items: orderItems.length > 0 || tableLabel ? {
            items: orderItems,
            tableNumber: tableLabel,
          } : undefined,
        },
      }),
    ]);

    console.log(`[TagHere Order Webhook] Membership registered - customerId: ${customer.id}, storeId: ${store.id}`);

    return res.json({
      success: true,
      customerId: customer.id,
      isNewCustomer,
      storeName: store.name,
    });
  } catch (error: any) {
    console.error('[TagHere Order Webhook] Membership register error:', error);
    return res.status(500).json({
      success: false,
      error: 'server_error',
      message: '멤버십 등록 중 오류가 발생했습니다.',
    });
  }
});

/**
 * POST /api/taghere/webhook/stamp/earn
 *
 * 주문 서비스(Bearer)에서 전화번호 기반 스탬프 적립. 단일 매장 전용.
 * 프랜차이즈 통합 스탬프 매장은 명시적으로 거부(franchise_not_supported) — FranchiseCustomer/프랜차이즈 원장 미접근.
 */
router.post('/stamp/earn', webhookAuthMiddleware, async (req: WebhookRequest, res) => {
  try {
    // deferUntilPaid: 후불 + 결제완료 감지 가능 POS 주문. 실제 적립을 결제완료까지 미룬다.
    const { storeId, storeSlug, phone, earnMethod = 'NFC_TAG', count, deferUntilPaid } = req.body as {
      storeId?: string;
      storeSlug?: string;
      phone?: string;
      earnMethod?: string;
      count?: number;
      deferUntilPaid?: boolean;
    };
    const ordersheetId: string | undefined = req.body.orderId || req.body.ordersheetId;

    if ((!storeId && !storeSlug) || !phone) {
      return res.status(400).json({
        success: false,
        error: 'missing_params',
        message: 'storeId 또는 storeSlug, 그리고 phone은 필수입니다.',
      });
    }

    const store = await findStoreByV2Ref('stamp/earn', { storeId, storeSlug }, {
        id: true,
        name: true,
        stampSetting: true,
        franchiseStampEnabled: true,
        franchiseId: true,
        taghereVersion: true,
        v1StoreId: true,
        v2StoreId: true,
        addressSido: true,
        addressSigungu: true,
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
    });

    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'store_not_found',
        message: '매장을 찾을 수 없습니다.',
      });
    }

    // [하드 가드] 프랜차이즈 통합 스탬프 매장은 이 엔드포인트에서 처리하지 않는다.
    // (프랜차이즈 스탬프는 kakaoId 기반 FranchiseCustomer 를 쓰므로 전화번호 단일매장 경로와 호환되지 않음)
    const isFranchiseStampMode = !!(
      store.franchiseStampEnabled &&
      store.franchiseId &&
      store.franchise?.franchiseStampSetting
    );
    if (isFranchiseStampMode) {
      return res.status(400).json({
        success: false,
        error: 'franchise_not_supported',
        message: '프랜차이즈 통합 스탬프 매장은 지원하지 않습니다.',
      });
    }

    // 스탬프 기능 활성화 확인
    if (!store.stampSetting?.enabled) {
      return res.status(400).json({
        success: false,
        error: 'stamp_disabled',
        message: '스탬프 기능이 비활성화되어 있습니다.',
      });
    }

    // 수동 개수 모드: count 필수, 하루 1회 제한 해제, 첫 방문 보너스 무시
    const manualMode = !!store.stampSetting?.manualStampCountEnabled;
    let manualCount = 1;
    if (manualMode) {
      manualCount = Number(count);
      if (!Number.isInteger(manualCount) || manualCount < 1) {
        return res.status(400).json({
          success: false,
          error: 'invalid_count',
          message: '적립할 스탬프 개수를 올바르게 입력해주세요.',
        });
      }
    }

    // 전화번호로 고객 find-or-create (kakaoId 식별 블록 대체)
    const { customer, isNewCustomer } = await findOrCreateCustomerByPhone(
      store.id,
      phone,
      store.addressSido ?? null,
      store.addressSigungu ?? null,
      normalizeCustomerProfile(req.body),
    );

    // 이 주문에 이미 지연 적립 예약이 있으면 "오늘 이미 적립"이 아니라 "예약됨"으로 안내해야 한다.
    // 일일 제한 판정도 이 예약을 적립으로 세므로 먼저 조회해 둔다.
    const existingStampPending = ordersheetId
      ? await findPendingStampAccrual(store.id, ordersheetId)
      : null;
    if (existingStampPending?.status === 'PENDING') {
      // 예약을 소유한 고객 본인의 재요청만 "예약됨"이다.
      if (existingStampPending.customerId === customer.id) {
        return res.status(400).json({
          success: false,
          error: 'already_reserved',
          message: '결제 완료 후 적립될 예약이 있습니다.',
        });
      }
      // 다른 고객이 이미 예약한 주문 — 이 고객에게는 적립이 가지 않으므로 예약 안내는 오안내다.
      // 통과시키면 재예약이 (storeId, orderId) 유니크로 P2002 를 내고 예약 안내로 오흡수되므로,
      // 즉시 적립 경로의 "이미 적립된 주문"과 같은 확정 응답으로 여기서 명시 반환한다.
      return res.status(400).json({
        success: false,
        error: 'already_earned_order',
        message: '이미 적립된 주문입니다.',
      });
    }

    // 일일 적립 제한 (1일 1회) — 수동 개수 모드 제외
    // 이 판정식은 /stamp/balance 의 alreadyEarnedToday 와 쌍이다. 한쪽만 바꾸면 판정이 어긋난다.
    // (todayStart 가 UTC 기준이라 실제 리셋이 KST 09시인 것도 양쪽 공통 — 교정 시 함께 변경)
    if (!manualMode) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const todayEarn = await prisma.stampLedger.findFirst({
        where: {
          storeId: store.id,
          customerId: customer.id,
          type: 'EARN',
          createdAt: { gte: todayStart },
          // 지연 전환분은 createdAt 이 결제완료 시각이라 "오늘 적립" 판정 근거가 될 수 없다.
          // reason 은 nullable 이라 NOT startsWith 만 쓰면 NULL 행이 통째로 빠진다(NULL LIKE → NULL).
          OR: [{ reason: null }, { reason: { not: { startsWith: DEFERRED_STAMP_REASON_PREFIX } } }],
        },
      });

      // 지연 적립은 EARN 원장을 만들지 않으므로 예약도 함께 봐야 같은 날 재적립을 막을 수 있다.
      if (todayEarn || (await hasTodayPendingStampAccrual(store.id, customer.id))) {
        const alreadyRewards: RewardEntry[] = store.stampSetting.rewards
          ? (store.stampSetting.rewards as unknown as RewardEntry[])
          : buildRewardsFromLegacy(store.stampSetting as any);
        return res.status(400).json({
          success: false,
          error: 'already_earned_today',
          message: '오늘 이미 스탬프를 적립했습니다.',
          alreadyEarned: true,
          currentStamps: customer.totalStamps,
          rewards: alreadyRewards,
        });
      }
    }

    // 태그히어 연동 시 중복 체크 (StampLedger.ordersheetId)
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

      // 전환(ACCRUED)된 예약은 EARN 원장이 남아 위에서 이미 걸린다. 취소(CANCELED)된 예약은
      // 재적립 대상이 아니지만 재예약 시 (storeId, orderId) 유니크를 위반하므로 여기서 막는다.
      // (PENDING 은 위 일일 제한 앞에서 already_reserved 로 먼저 반환된다)
      if (existingStampPending?.status === 'CANCELED') {
        return res.status(409).json({
          success: false,
          error: 'accrual_canceled',
          message: '취소된 주문입니다.',
        });
      }
    }

    // 주문 데이터 조회 (메뉴/테이블/금액)
    let orderItems: any[] = [];
    let tableLabel: string | null = null;
    let totalAmount: number | null = null;
    if (ordersheetId) {
      const ctx = await extractOrderContext(ordersheetId, resolveVersionForOrder(store, ordersheetId));
      orderItems = ctx.orderItems;
      tableLabel = ctx.tableLabel;
      totalAmount = ctx.totalAmount;
    }

    // 스탬프 적립 (트랜잭션) — 무조건 방문횟수 +1
    const previousStamps = customer.totalStamps ?? 0;
    const isFirstEarn = (customer.visitCount ?? 0) === 0;
    const firstStampCount = store.stampSetting.firstStampBonus ?? 1;
    const stampDelta = manualMode
      ? manualCount
      : (isFirstEarn && firstStampCount > 1 ? firstStampCount : 1);

    // 후불 + 결제완료 감지 가능 POS 주문은 실제 적립을 결제완료 시점까지 미룬다.
    // 매번개수입력 모드는 직원이 개수를 확정하는 즉시 적립 흐름이라 지연 대상이 아니다.
    // (프랜차이즈 통합 스탬프는 이 엔드포인트에서 이미 거부됨)
    const shouldDefer = deferUntilPaid === true && !manualMode && !!ordersheetId;

    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
      const newBalance = previousStamps + stampDelta;

      const updatedCustomer = await tx.customer.update({
        where: { id: customer.id },
        data: {
          // 지연 적립이면 잔액은 그대로 두고 방문 통계만 갱신한다.
          ...(!shouldDefer && { totalStamps: newBalance }),
          lastVisitAt: new Date(),
          visitCount: { increment: 1 },
        },
      });

      // 지연 대상이면 EARN 원장/잔액/추첨을 만들지 않고 예약 행만 남긴다.
      if (shouldDefer) {
        await tx.pendingStampAccrual.create({
          data: buildPendingStampAccrualData({
            storeId: store.id,
            customerId: customer.id,
            orderId: ordersheetId!,
            stampDelta,
            earnMethod: earnMethod as any,
            tableLabel,
            // 이 경로는 원래 항상 적립 알림톡을 보냈다 → 전환 시점에 발송.
            sendAlimtalk: true,
            source: 'IN_APP',
          }),
        });
      }

      const ledger = shouldDefer ? null : await tx.stampLedger.create({
        data: {
          storeId: store.id,
          customerId: customer.id,
          type: 'EARN',
          delta: stampDelta,
          balance: newBalance,
          ordersheetId: ordersheetId || null,
          earnMethod: earnMethod as any,
          tableLabel,
          reason: manualMode
            ? `스탬프 적립 (${stampDelta}개)`
            : (stampDelta > 1
              ? `첫 방문 스탬프 적립 (${stampDelta}개)`
              : (ordersheetId ? `태그히어 주문 적립 (${ordersheetId})` : '스탬프 적립')),
        },
      });

      const visitOrOrderData = {
        storeId: store.id,
        customerId: customer.id,
        orderId: ordersheetId || null,
        visitedAt: new Date(),
        totalAmount,
        items: orderItems.length > 0 || tableLabel ? {
          items: orderItems,
          tableNumber: tableLabel,
        } : undefined,
      };
      // 지연 예약 분기는 같은 주문의 방문 기록이 이미 있을 수 있다(포인트 예약 등 다른 경로가 먼저 생성).
      // create 로 두면 (storeId, orderId) 유니크가 터져 예약 트랜잭션이 통째로 롤백되고,
      // 아래 P2002 흡수가 "예약됨"으로 삼켜 스탬프가 조용히 유실된다 → 포인트 예약 경로와 같은 upsert.
      // (즉시 적립 경로는 기존 create 유지)
      if (shouldDefer) {
        await tx.visitOrOrder.upsert({
          where: { storeId_orderId: { storeId: store.id, orderId: ordersheetId! } },
          update: {},
          create: visitOrOrderData,
        });
      } else {
        await tx.visitOrOrder.create({ data: visitOrOrderData });
      }

      // 마일스톤 추첨은 지연 적립이면 전환 시점(finalizePendingStampAccrual)에서 수행한다.
      const milestoneResult = ledger
        ? checkMilestoneAndDraw(previousStamps, newBalance, store.stampSetting!)
        : null;
      if (ledger && milestoneResult) {
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
    } catch (txErr: any) {
      // 예약 행은 (storeId, orderId) 유니크라 더블탭·동시 요청에서 진 쪽이 P2002 로 롤백된다.
      // 예약 자체는 이긴 쪽이 이미 만들어 놨으므로 500 대신 선조회 가드와 같은 안내로 흡수한다.
      // (지연 분기에서만 흡수 — 즉시 적립 경로의 다른 유니크 위반은 그대로 500 으로 남긴다)
      // 예약 유니크가 아닌 P2002(예: 방문 기록)는 흡수하면 스탬프가 조용히 유실되므로 그대로 던진다.
      if (
        shouldDefer &&
        txErr?.code === 'P2002' &&
        (await isPendingStampAccrualConflict(txErr, store.id, ordersheetId!))
      ) {
        console.log(`[TagHere Order Webhook] 동시 예약 생성 감지, 멱등 응답 - orderId: ${ordersheetId}`);
        return res.status(400).json({
          success: false,
          error: 'already_reserved',
          message: '결제 완료 후 적립될 예약이 있습니다.',
        });
      }
      throw txErr;
    }

    if (shouldDefer) {
      console.log(`[TagHere Order Webhook] Stamp accrual reserved - customerId: ${customer.id}, orderId: ${ordersheetId}, stampDelta: ${stampDelta}`);
    } else {
      console.log(`[TagHere Order Webhook] Stamp earned - customerId: ${customer.id}, newBalance: ${result.customer.totalStamps}${result.milestoneResult ? `, milestone: ${result.milestoneResult.tier}개 - ${result.milestoneResult.reward}` : ''}`);
    }

    // 알림톡 발송 (비동기) — 매장 설정에 따름 (isHitejinro 미사용)
    // 지연 적립은 여기서 보내지 않는다 — 실제 적립 시점(finalizePendingStampAccrual)에서 발송.
    const phoneNumber = customer.phone?.replace(/[^0-9]/g, '');
    if (result.ledger && store.stampSetting.alimtalkEnabled && phoneNumber) {
      const rewardsForAlimtalk: RewardEntry[] = store.stampSetting.rewards
        ? (store.stampSetting.rewards as unknown as RewardEntry[])
        : buildRewardsFromLegacy(store.stampSetting as any);
      const stampUsageRule = buildStampUsageRule(rewardsForAlimtalk, result.milestoneResult);
      const reviewGuide = store.reviewAutomationSetting?.benefitText || '진심을 담은 리뷰는 매장에 큰 도움이 됩니다 :)';

      enqueueStampEarnedAlimTalk({
        storeId: store.id,
        customerId: customer.id,
        stampLedgerId: result.ledger.id,
        phone: phoneNumber,
        variables: {
          storeName: store.name,
          earnedStamps: stampDelta,
          totalStamps: result.customer.totalStamps,
          stampUsageRule,
          reviewGuide,
        },
      }).catch((err) => {
        console.error('[TagHere Order Webhook] Stamp AlimTalk enqueue failed:', err);
      });
    }

    const successRewards: RewardEntry[] = store.stampSetting.rewards
      ? (store.stampSetting.rewards as unknown as RewardEntry[])
      : buildRewardsFromLegacy(store.stampSetting as any);

    return res.json({
      success: true,
      // 지연 적립이면 잔액이 아직 안 움직였으므로 currentStamps 는 기존 잔액 그대로다.
      ...(shouldDefer && { deferred: true }),
      currentStamps: result.customer.totalStamps,
      customerId: customer.id,
      isNewCustomer,
      rewards: successRewards,
      drawnReward: result.milestoneResult?.reward || null,
      drawnRewardTier: result.milestoneResult?.tier || null,
    });
  } catch (error: any) {
    console.error('[TagHere Order Webhook] Stamp earn error:', error);
    return res.status(500).json({
      success: false,
      error: 'server_error',
      message: '스탬프 적립 중 오류가 발생했습니다.',
    });
  }
});

/**
 * POST /api/taghere/webhook/store-crm-info
 *
 * 주문 서비스(Bearer)에서 매장 CRM 활성화 여부 + 수렴 적립 모드 조회. 라이브(상태 미복제).
 */
router.post('/store-crm-info', webhookAuthMiddleware, async (req: WebhookRequest, res) => {
  try {
    const { storeId, storeSlug } = req.body as { storeId?: string; storeSlug?: string };

    if (!storeId && !storeSlug) {
      return res.status(400).json({
        success: false,
        error: 'missing_params',
        message: 'storeId 또는 storeSlug은 필수입니다.',
      });
    }

    const store = await findStoreByV2Ref('store-crm-info', { storeId, storeSlug }, {
        name: true,
        crmEnabled: true,
        enrollmentMode: true,
        pointRatePercent: true,
        metacityEnabled: true,
        stampSetting: { select: { enabled: true } },
    });

    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'store_not_found',
        message: '매장을 찾을 수 없습니다.',
      });
    }

    const mode = resolveCrmPageMode({
      enrollmentMode: store.enrollmentMode,
      isStampMode: !!store.stampSetting?.enabled,
    });

    return res.json({
      success: true,
      crmEnabled: store.crmEnabled,
      mode,
      storeName: store.name,
      pointRatePercent: store.pointRatePercent,
      // 매직포스 연동 매장 여부 — V1 주문 서버가 인앱 포인트 지원 여부(pointsInAppSupported) 판단에 사용.
      // (metacityEnabled 매장은 /transaction 이 CRM 포인트를 적립하지 않으므로 인앱 포인트 제외 대상)
      metacityEnabled: store.metacityEnabled,
    });
  } catch (error: any) {
    console.error('[TagHere Order Webhook] Store CRM info error:', error);
    return res.status(500).json({
      success: false,
      error: 'server_error',
      message: '매장 CRM 정보 조회 중 오류가 발생했습니다.',
    });
  }
});

/**
 * POST /api/taghere/webhook/stamp/balance
 * 현재 보유 스탬프 조회 (읽기 전용). 주문 서비스가 적립 화면 부제에 표시한다.
 *
 * /stamp/earn 과 달리 고객을 생성하지 않는다 — 화면만 보고 이탈한 사용자까지
 * consentMarketing=true 로 만들지 않기 위해 findFirst 만 한다.
 * 보상 추첨(checkMilestoneAndDraw)도 호출하지 않는다. 아직 일어나지 않은 당첨이 뽑히기 때문.
 *
 * 프랜차이즈/비활성 매장은 400 이 아니라 200 + supported:false 로 응답한다.
 * 호출자(V2)가 4xx 를 장애로 취급해 502 로 승격시키는 구조라, 정상적인 미지원 상태를
 * 에러로 내리면 해당 매장의 모든 페이지뷰가 알람이 된다.
 */
router.post('/stamp/balance', webhookAuthMiddleware, async (req: WebhookRequest, res) => {
  try {
    const { storeId, storeSlug, phone } = req.body;

    if ((!storeId && !storeSlug) || !phone) {
      return res.status(400).json({
        success: false,
        error: 'missing_params',
        message: 'storeId 또는 storeSlug, 그리고 phone은 필수입니다.',
      });
    }

    const store = await findStoreByV2Ref('stamp/balance', { storeId, storeSlug }, {
        id: true,
        franchiseStampEnabled: true,
        franchiseId: true,
        franchise: { select: { franchiseStampSetting: true } },
        stampSetting: { select: { enabled: true, manualStampCountEnabled: true } },
    });

    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'store_not_found',
        message: '매장을 찾을 수 없습니다.',
      });
    }

    // /stamp/earn 과 동일한 가드. 프랜차이즈 스탬프는 kakaoId 기반 FranchiseCustomer 라
    // 전화번호로 조회할 수 없어 숫자를 주지 않는다.
    const isFranchiseStampMode = !!(
      store.franchiseStampEnabled &&
      store.franchiseId &&
      store.franchise?.franchiseStampSetting
    );
    if (isFranchiseStampMode) {
      return res.json({
        success: true,
        supported: false,
        currentStamps: null,
        reason: 'franchise_not_supported',
      });
    }

    if (!store.stampSetting?.enabled) {
      return res.json({
        success: true,
        supported: false,
        currentStamps: null,
        reason: 'stamp_disabled',
      });
    }

    const customer = await prisma.customer.findFirst({
      where: { storeId: store.id, phoneLastDigits: toPhoneLastDigits(phone) },
      select: { id: true, totalStamps: true },
    });

    // 오늘 이미 적립했는지 — 주문 서비스가 적립 화면을 띄우기 전에 판단하는 데 쓴다.
    // 판정식은 같은 파일의 /stamp/earn 일일 제한 블록과 반드시 동일해야 한다.
    //
    // todayStart 가 서버 로컬(UTC) 기준이라 실제 리셋은 KST 09시다(알려진 버그).
    // 여기서만 KST 로 고치면 "적립 가능이라 했는데 400" 이 생기므로 일부러 같은 기준을 쓴다.
    // 타임존을 교정할 땐 이 판정식을 쓰는 지점을 모두 함께 바꿔야 한다 —
    // /stamp/earn, /stamp/balance(여기), routes/stamps.ts(관리자·태블릿 적립),
    // routes/taghere.ts(스탬프 링크), routes/kakao.ts(카카오 로그인 적립).
    // 위 지점들은 모두 "지연 전환분 원장 제외 + 오늘 예약 존재(hasTodayPendingStampAccrual)" 를 함께 본다.
    // (프랜차이즈 통합 스탬프는 franchiseStampLedger 로 원장이 달라 별도다)
    let alreadyEarnedToday = false;
    if (customer && !store.stampSetting.manualStampCountEnabled) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const todayEarn = await prisma.stampLedger.findFirst({
        where: {
          storeId: store.id,
          customerId: customer.id,
          type: 'EARN',
          createdAt: { gte: todayStart },
          // 지연 전환분은 createdAt 이 결제완료 시각이라 "오늘 적립" 판정 근거가 될 수 없다.
          // reason 은 nullable 이라 NOT startsWith 만 쓰면 NULL 행이 통째로 빠진다(NULL LIKE → NULL).
          OR: [{ reason: null }, { reason: { not: { startsWith: DEFERRED_STAMP_REASON_PREFIX } } }],
        },
      });
      // 오늘 예약이 있으면 적립한 것으로 본다 — /stamp/earn 의 일일 제한과 동일 판정.
      alreadyEarnedToday = !!todayEarn || (await hasTodayPendingStampAccrual(store.id, customer.id));
    }

    return res.json({
      success: true,
      supported: true,
      currentStamps: customer?.totalStamps ?? 0,
      alreadyEarnedToday,
    });
  } catch (error: any) {
    // phone 은 로그에 남기지 않는다.
    console.error('[TagHere Order Webhook] Stamp balance error:', error);
    return res.status(500).json({
      success: false,
      error: 'server_error',
      message: '스탬프 조회 중 오류가 발생했습니다.',
    });
  }
});

export default router;
