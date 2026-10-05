import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { maskName, maskPhone } from '../utils/masking.js';
import { buildRewardsFromLegacy, RewardEntry } from '../utils/random-reward.js';
import { customerAuthMiddleware, CustomerAuthRequest } from '../middleware/customer-auth.js';
import {
  findMyCustomerIds,
  findMyFranchiseCustomerIds,
  withdrawCustomer,
  withdrawMarketingConsent,
} from '../services/customer-my-page.js';
import { lookupMetacityBalanceReadOnly } from '../services/metacity.js';
import { toSafeHttpsUrl } from '../utils/safe-url.js';

const router = Router();

// 모든 마이페이지 API 는 고객 로그인 증표가 필요하다
router.use(customerAuthMiddleware);

// 탈퇴는 로그인한 지 10분 안의 증표만 받는다 (증표를 도둑맞아도 바로 탈퇴로 지워지지 않게)
const WITHDRAW_MAX_TOKEN_AGE_SEC = 10 * 60;

type StampRewardView = { tier: number; description: string; isRandom: boolean };

function toRewardViews(setting: Record<string, any> | null | undefined): StampRewardView[] {
  if (!setting) return [];
  const rewards: RewardEntry[] = setting.rewards
    ? (setting.rewards as unknown as RewardEntry[])
    : buildRewardsFromLegacy(setting);
  return [...rewards]
    .sort((a, b) => a.tier - b.tier)
    .map((r) => ({
      tier: r.tier,
      description: r.description,
      isRandom: !!(r.options && r.options.length > 0),
    }));
}

/** 현재 스탬프보다 큰 첫 보상 단계까지 남은 개수. 모든 단계를 넘겼으면 null */
function nextReward(rewards: StampRewardView[], totalStamps: number) {
  const next = rewards.find((r) => r.tier > totalStamps);
  return next ? { tier: next.tier, description: next.description, remaining: next.tier - totalStamps } : null;
}

const HISTORY_SELECT_POINT = {
  id: true,
  type: true,
  delta: true,
  balance: true,
  reason: true,
  createdAt: true,
} as const;

const HISTORY_SELECT_STAMP = {
  id: true,
  type: true,
  delta: true,
  balance: true,
  drawnReward: true,
  drawnRewardTier: true,
  createdAt: true,
} as const;

// GET /api/my-page — 내 매장 카드 + 프랜차이즈 브랜드 카드
router.get('/', async (req: CustomerAuthRequest, res) => {
  try {
    const identity = req.customer!;
    const [customerIds, franchiseCustomerIds] = await Promise.all([
      findMyCustomerIds(identity),
      findMyFranchiseCustomerIds(identity),
    ]);

    const customers = await prisma.customer.findMany({
      where: { id: { in: customerIds } },
      orderBy: { lastVisitAt: { sort: 'desc', nulls: 'last' } },
      include: {
        store: {
          select: {
            id: true,
            name: true,
            category: true,
            address: true,
            enrollmentMode: true,
            pointRatePercent: true,
            naverPlaceUrl: true,
            franchiseId: true,
            franchiseStampEnabled: true,
            metacityEnabled: true,
            metacityStoreIdx: true,
            franchise: { select: { id: true, name: true } },
          },
        },
      },
    });

    const franchiseCustomers = await prisma.franchiseCustomer.findMany({
      where: { id: { in: franchiseCustomerIds } },
      include: { franchise: { select: { id: true, name: true } } },
    });

    // 설정·쿠폰은 한 번에 모아서 조회
    const storeIds = [...new Set(customers.map((c) => c.storeId))];
    const franchiseIds = [
      ...new Set([
        ...customers.map((c) => c.store.franchiseId).filter((id): id is string => !!id),
        ...franchiseCustomers.map((fc) => fc.franchiseId),
      ]),
    ];
    const [stampSettings, franchiseStampSettings, coupons] = await Promise.all([
      prisma.stampSetting.findMany({ where: { storeId: { in: storeIds } } }),
      prisma.franchiseStampSetting.findMany({ where: { franchiseId: { in: franchiseIds } } }),
      prisma.retargetCoupon.findMany({
        where: { customerId: { in: customerIds }, usedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { id: true, code: true, customerId: true, couponContent: true, expiryDate: true, createdAt: true },
      }),
    ]);
    const stampSettingByStore = new Map(stampSettings.map((s) => [s.storeId, s]));
    const franchiseStampSettingById = new Map(franchiseStampSettings.map((s) => [s.franchiseId, s]));

    const stores = await Promise.all(
      customers.map(async (customer) => {
        const store = customer.store;
        const stampSetting = stampSettingByStore.get(store.id);
        // 통합 스탬프 참여 매장 — 스탬프는 브랜드 카드에 쌓이고 매장 기록 값은 갱신되지 않는다 (stamp-scan.ts 와 같은 판정)
        const stampManagedByFranchise = !!(
          store.franchiseStampEnabled &&
          store.franchiseId &&
          franchiseStampSettingById.has(store.franchiseId)
        );
        const stampEnabled = !stampManagedByFranchise && !!stampSetting?.enabled;
        const stampRewards = stampEnabled ? toRewardViews(stampSetting) : [];

        // 매직포스(메타씨티) 연동 매장은 메타씨티 잔액이 기준 — 조회 전용으로 물어본다 (가입·캐시 쓰기 없음)
        let totalPoints: number | null = customer.totalPoints;
        let pointSource: 'CRM' | 'METACITY' | 'METACITY_UNAVAILABLE' = 'CRM';
        if (store.metacityEnabled) {
          const balance = store.metacityStoreIdx
            ? await lookupMetacityBalanceReadOnly(store.metacityStoreIdx, customer)
            : null;
          if (balance) {
            totalPoints = balance.ablePoint;
            pointSource = 'METACITY';
          } else {
            totalPoints = null;
            pointSource = 'METACITY_UNAVAILABLE';
          }
        }

        const [recentPointHistory, recentStampHistory] = await Promise.all([
          prisma.pointLedger.findMany({
            where: { customerId: customer.id },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: HISTORY_SELECT_POINT,
          }),
          stampManagedByFranchise
            ? Promise.resolve([])
            : prisma.stampLedger.findMany({
                where: { customerId: customer.id },
                orderBy: { createdAt: 'desc' },
                take: 10,
                select: HISTORY_SELECT_STAMP,
              }),
        ]);

        return {
          storeId: store.id,
          storeName: store.name,
          category: store.category,
          address: store.address,
          enrollmentMode: store.enrollmentMode,
          pointRatePercent: store.pointRatePercent,
          naverPlaceUrl: toSafeHttpsUrl(store.naverPlaceUrl),
          franchiseName: store.franchise?.name ?? null,
          totalPoints,
          pointSource,
          totalStamps: stampManagedByFranchise ? null : customer.totalStamps,
          stampManagedByFranchise,
          visitCount: customer.visitCount,
          lastVisitAt: customer.lastVisitAt,
          stampEnabled,
          stampRewards,
          nextReward: stampEnabled ? nextReward(stampRewards, customer.totalStamps) : null,
          coupons: coupons
            .filter((c) => c.customerId === customer.id)
            .map(({ customerId: _customerId, ...coupon }) => coupon),
          recentPointHistory,
          recentStampHistory,
        };
      })
    );

    const franchiseCards = await Promise.all(
      franchiseCustomers.map(async (fc) => {
        const stampSetting = franchiseStampSettingById.get(fc.franchiseId);
        const stampRewards = toRewardViews(stampSetting);

        const [recentStampHistory, recentPointHistory, earnedByStore] = await Promise.all([
          prisma.franchiseStampLedger.findMany({
            where: { franchiseCustomerId: fc.id },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: { ...HISTORY_SELECT_STAMP, store: { select: { name: true } } },
          }),
          prisma.franchisePointLedger.findMany({
            where: { franchiseCustomerId: fc.id },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: { ...HISTORY_SELECT_POINT, store: { select: { name: true } } },
          }),
          // 매장별 적립 수 = 통합 스탬프 장부의 적립(EARN) 합계
          prisma.franchiseStampLedger.groupBy({
            by: ['storeId'],
            where: { franchiseCustomerId: fc.id, type: 'EARN' },
            _sum: { delta: true },
          }),
        ]);

        return {
          earnedByStore,
          franchiseId: fc.franchiseId,
          franchiseName: fc.franchise.name,
          totalStamps: fc.totalStamps,
          totalPoints: fc.totalPoints,
          visitCount: fc.visitCount,
          lastVisitAt: fc.lastVisitAt,
          selfClaimEnabled: stampSetting?.selfClaimEnabled ?? false,
          stampRewards,
          nextReward: nextReward(stampRewards, fc.totalStamps),
          recentStampHistory: recentStampHistory.map(({ store, ...h }) => ({ ...h, storeName: store.name })),
          recentPointHistory: recentPointHistory.map(({ store, ...h }) => ({ ...h, storeName: store.name })),
        };
      })
    );

    // 브랜드 카드들의 매장별 적립 수 — 매장 이름은 한 번에 모아 조회
    const breakdownStoreIds = [...new Set(franchiseCards.flatMap((f) => f.earnedByStore.map((e) => e.storeId)))];
    const breakdownStores = await prisma.store.findMany({
      where: { id: { in: breakdownStoreIds } },
      select: { id: true, name: true },
    });
    const storeNameById = new Map(breakdownStores.map((s) => [s.id, s.name]));
    const franchises = franchiseCards.map(({ earnedByStore, ...card }) => ({
      ...card,
      storeBreakdown: earnedByStore
        .map((e) => ({
          storeId: e.storeId,
          storeName: storeNameById.get(e.storeId) ?? '',
          stamps: e._sum.delta ?? 0,
        }))
        .filter((s) => s.stamps > 0)
        .sort((a, b) => b.stamps - a.stamps),
    }));

    const firstNamed = customers.find((c) => c.name);
    res.json({
      customer: {
        name: firstNamed ? maskName(firstNamed.name) : null,
        phone: identity.phone ? maskPhone(identity.phone) : null,
        provider: identity.provider,
        hasPhone: !!identity.phone,
      },
      franchises,
      stores,
    });
  } catch (error) {
    console.error('[My Page API] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/my-page/reward-claim — 프랜차이즈 통합 스탬프 보상 수령 신청
router.post('/reward-claim', async (req: CustomerAuthRequest, res) => {
  try {
    const { franchiseId, tier } = req.body;

    if (typeof franchiseId !== 'string' || !franchiseId || !Number.isInteger(tier) || tier <= 0) {
      return res.status(400).json({ error: 'franchiseId, tier가 필요합니다.' });
    }

    // 1. 토큰으로 찾은 내 프랜차이즈 기록인지 확인
    const myFranchiseCustomerIds = await findMyFranchiseCustomerIds(req.customer!);
    const franchiseCustomer = await prisma.franchiseCustomer.findFirst({
      where: { id: { in: myFranchiseCustomerIds }, franchiseId },
    });

    if (!franchiseCustomer) {
      return res.status(404).json({ error: '고객을 찾을 수 없습니다.' });
    }

    // 2. selfClaimEnabled 확인
    const stampSetting = await prisma.franchiseStampSetting.findUnique({
      where: { franchiseId },
    });

    if (!stampSetting?.selfClaimEnabled) {
      return res.status(400).json({ error: '보상 셀프 신청이 비활성화되어 있습니다.' });
    }

    // 3. 보상 tier 유효성 검증
    const rewards: RewardEntry[] = stampSetting.rewards
      ? (stampSetting.rewards as unknown as RewardEntry[])
      : buildRewardsFromLegacy(stampSetting as Record<string, any>);

    const targetReward = rewards.find((r) => r.tier === tier);
    if (!targetReward) {
      return res.status(400).json({ error: '해당 보상이 존재하지 않습니다.' });
    }

    // storeId가 필요 — 프랜차이즈 소속 첫 번째 매장 사용
    const firstStore = await prisma.store.findFirst({
      where: { franchiseId },
      select: { id: true },
    });

    if (!firstStore) {
      return res.status(400).json({ error: '매장을 찾을 수 없습니다.' });
    }

    // 4. 트랜잭션: 잔액이 충분할 때만 차감 (동시에 두 번 신청해도 한 번만 통과) + 레저 + RewardClaim 생성
    const result = await prisma.$transaction(async (tx) => {
      const decremented = await tx.franchiseCustomer.updateMany({
        where: { id: franchiseCustomer.id, totalStamps: { gte: tier } },
        data: { totalStamps: { decrement: tier } },
      });
      if (decremented.count === 0) {
        return null;
      }

      const updated = await tx.franchiseCustomer.findUniqueOrThrow({
        where: { id: franchiseCustomer.id },
      });

      const ledger = await tx.franchiseStampLedger.create({
        data: {
          franchiseId,
          franchiseCustomerId: franchiseCustomer.id,
          storeId: firstStore.id,
          type: 'USE',
          delta: -tier,
          balance: updated.totalStamps,
          reason: `보상 수령 신청 (${targetReward.description})`,
        },
      });

      await tx.rewardClaim.create({
        data: {
          franchiseId,
          franchiseCustomerId: franchiseCustomer.id,
          tier,
          rewardDescription: targetReward.description,
          status: 'PENDING',
          customerName: franchiseCustomer.name || null,
          customerPhone: franchiseCustomer.phone || null,
          stampLedgerId: ledger.id,
        },
      });

      return updated;
    });

    if (!result) {
      return res.status(400).json({ error: '스탬프가 부족합니다.' });
    }

    res.json({
      success: true,
      currentStamps: result.totalStamps,
    });
  } catch (error) {
    console.error('[My Page Reward Claim] Error:', error);
    res.status(500).json({ error: '보상 신청 중 오류가 발생했습니다.' });
  }
});

// POST /api/my-page/consent/withdraw — 마케팅 수신 동의 철회
router.post('/consent/withdraw', async (req: CustomerAuthRequest, res) => {
  try {
    const result = await withdrawMarketingConsent(req.customer!);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[My Page Consent Withdraw] Error:', error);
    res.status(500).json({ error: '수신 동의 철회 중 오류가 발생했습니다.' });
  }
});

// POST /api/my-page/withdraw — 탈퇴 (개인정보 비우기, 기록은 보존)
router.post('/withdraw', async (req: CustomerAuthRequest, res) => {
  try {
    const issuedAt = req.customer!.iat ?? 0;
    if (Date.now() / 1000 - issuedAt > WITHDRAW_MAX_TOKEN_AGE_SEC) {
      return res.status(403).json({ error: '본인 확인을 위해 다시 로그인해주세요.', code: 'REAUTH_REQUIRED' });
    }

    const result = await withdrawCustomer(req.customer!);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[My Page Withdraw] Error:', error);
    res.status(500).json({ error: '탈퇴 처리 중 오류가 발생했습니다.' });
  }
});

export default router;
