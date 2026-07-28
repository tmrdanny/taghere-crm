import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { webhookAuthMiddleware, WebhookRequest } from '../middleware/webhook-auth.js';
import { fetchOrder, resolveCrmPageMode, TaghereOrderData } from '../services/taghere-api.js';
import { findOrCreateCustomerByPhone } from '../services/customer-identity.js';
import { checkMilestoneAndDraw, buildRewardsFromLegacy, RewardEntry } from '../utils/random-reward.js';
import { enqueueStampEarnedAlimTalk } from '../services/solapi.js';

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
    const { storeSlug, phone, orderId } = req.body as {
      storeSlug?: string;
      phone?: string;
      orderId?: string;
    };

    if (!storeSlug || !phone || !orderId) {
      return res.status(400).json({
        success: false,
        error: 'missing_params',
        message: 'storeSlug, phone, orderId는 필수입니다.',
      });
    }

    const store = await prisma.store.findFirst({
      where: { slug: storeSlug },
      select: {
        id: true,
        name: true,
        taghereVersion: true,
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
    );

    const { orderItems, tableLabel, totalAmount } = await extractOrderContext(orderId, store.taghereVersion);

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
    const { storeSlug, phone, earnMethod = 'NFC_TAG', count } = req.body as {
      storeSlug?: string;
      phone?: string;
      earnMethod?: string;
      count?: number;
    };
    const ordersheetId: string | undefined = req.body.orderId || req.body.ordersheetId;

    if (!storeSlug || !phone) {
      return res.status(400).json({
        success: false,
        error: 'missing_params',
        message: 'storeSlug, phone은 필수입니다.',
      });
    }

    const store = await prisma.store.findFirst({
      where: { slug: storeSlug },
      select: {
        id: true,
        name: true,
        stampSetting: true,
        franchiseStampEnabled: true,
        franchiseId: true,
        taghereVersion: true,
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
    );

    // 일일 적립 제한 (1일 1회) — 수동 개수 모드 제외
    if (!manualMode) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const todayEarn = await prisma.stampLedger.findFirst({
        where: {
          storeId: store.id,
          customerId: customer.id,
          type: 'EARN',
          createdAt: { gte: todayStart },
        },
      });

      if (todayEarn) {
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
    }

    // 주문 데이터 조회 (메뉴/테이블/금액)
    let orderItems: any[] = [];
    let tableLabel: string | null = null;
    let totalAmount: number | null = null;
    if (ordersheetId) {
      const ctx = await extractOrderContext(ordersheetId, store.taghereVersion);
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

    const result = await prisma.$transaction(async (tx) => {
      const newBalance = previousStamps + stampDelta;

      const updatedCustomer = await tx.customer.update({
        where: { id: customer.id },
        data: {
          totalStamps: newBalance,
          lastVisitAt: new Date(),
          visitCount: { increment: 1 },
        },
      });

      const ledger = await tx.stampLedger.create({
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

      await tx.visitOrOrder.create({
        data: {
          storeId: store.id,
          customerId: customer.id,
          orderId: ordersheetId || null,
          visitedAt: new Date(),
          totalAmount,
          items: orderItems.length > 0 || tableLabel ? {
            items: orderItems,
            tableNumber: tableLabel,
          } : undefined,
        },
      });

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

    console.log(`[TagHere Order Webhook] Stamp earned - customerId: ${customer.id}, newBalance: ${result.customer.totalStamps}${result.milestoneResult ? `, milestone: ${result.milestoneResult.tier}개 - ${result.milestoneResult.reward}` : ''}`);

    // 알림톡 발송 (비동기) — 매장 설정에 따름 (isHitejinro 미사용)
    const phoneNumber = customer.phone?.replace(/[^0-9]/g, '');
    if (store.stampSetting.alimtalkEnabled && phoneNumber) {
      const rewardsForAlimtalk: RewardEntry[] = store.stampSetting.rewards
        ? (store.stampSetting.rewards as unknown as RewardEntry[])
        : buildRewardsFromLegacy(store.stampSetting as any);
      const rules = rewardsForAlimtalk
        .sort((a, b) => a.tier - b.tier)
        .map(r => {
          const isRandom = r.options && Array.isArray(r.options) && r.options.length > 1;
          return `- ${r.tier}개 모을 시: ${isRandom ? '랜덤 박스!' : r.description}`;
        });
      const stampUsageRule = rules.length > 0
        ? '\n' + rules.join('\n')
        : '\n- 10개 모을시 매장 선물 증정!';
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
    const { storeSlug } = req.body as { storeSlug?: string };

    if (!storeSlug) {
      return res.status(400).json({
        success: false,
        error: 'missing_params',
        message: 'storeSlug은 필수입니다.',
      });
    }

    const store = await prisma.store.findFirst({
      where: { slug: storeSlug },
      select: {
        name: true,
        crmEnabled: true,
        enrollmentMode: true,
        pointRatePercent: true,
        metacityEnabled: true,
        stampSetting: { select: { enabled: true } },
      },
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

export default router;
