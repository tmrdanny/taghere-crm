import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { maskName, maskPhone } from '../utils/masking.js';
import { buildRewardsFromLegacy, RewardEntry } from '../utils/random-reward.js';

const router = Router();
const prisma = new PrismaClient();

// GET /api/my-page?kakaoId=xxx
router.get('/', async (req, res) => {
  try {
    const { kakaoId } = req.query;

    if (!kakaoId || typeof kakaoId !== 'string') {
      return res.status(400).json({ error: 'kakaoId is required' });
    }

    // 1. kakaoId로 모든 Customer 조회
    const customers = await prisma.customer.findMany({
      where: { kakaoId },
      include: {
        store: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    // 고객 기본 정보 (첫 번째 레코드에서)
    const firstCustomer = customers[0];
    const customerInfo = firstCustomer
      ? {
          name: maskName(firstCustomer.name),
          phone: maskPhone(firstCustomer.phone),
        }
      : null;

    // 2. 매장별 데이터 구성
    const stores = await Promise.all(
      customers.map(async (customer) => {
        // StampSetting 조회
        const stampSetting = await prisma.stampSetting.findUnique({
          where: { storeId: customer.storeId },
        });

        // 보상 목록 추출
        let stampRewards: { tier: number; description: string; isRandom: boolean }[] | null = null;
        if (stampSetting && stampSetting.enabled) {
          const rewards: RewardEntry[] = stampSetting.rewards
            ? (stampSetting.rewards as unknown as RewardEntry[])
            : buildRewardsFromLegacy(stampSetting as Record<string, any>);
          stampRewards = rewards
            .sort((a, b) => a.tier - b.tier)
            .map((r) => ({
              tier: r.tier,
              description: r.description,
              isRandom: !!(r.options && r.options.length > 0),
            }));
        }

        // 최근 포인트 내역 10건
        const recentPointHistory = await prisma.pointLedger.findMany({
          where: { customerId: customer.id },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            type: true,
            delta: true,
            balance: true,
            reason: true,
            createdAt: true,
          },
        });

        // 최근 스탬프 내역 10건
        const recentStampHistory = await prisma.stampLedger.findMany({
          where: { customerId: customer.id },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            type: true,
            delta: true,
            balance: true,
            drawnReward: true,
            drawnRewardTier: true,
            createdAt: true,
          },
        });

        return {
          storeId: customer.storeId,
          storeName: customer.store.name,
          totalPoints: customer.totalPoints,
          totalStamps: customer.totalStamps,
          visitCount: customer.visitCount,
          lastVisitAt: customer.lastVisitAt,
          stampEnabled: stampSetting?.enabled ?? false,
          stampRewards,
          recentPointHistory,
          recentStampHistory,
        };
      })
    );

    // 3. kakaoId로 모든 FranchiseCustomer 조회
    const franchiseCustomers = await prisma.franchiseCustomer.findMany({
      where: { kakaoId },
      include: {
        franchise: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    // 4. 프랜차이즈별 데이터 구성
    const franchises = await Promise.all(
      franchiseCustomers.map(async (fc) => {
        // FranchiseStampSetting 조회
        const stampSetting = await prisma.franchiseStampSetting.findUnique({
          where: { franchiseId: fc.franchiseId },
        });

        // 보상 목록 추출
        let stampRewards: { tier: number; description: string; isRandom: boolean }[] = [];
        if (stampSetting) {
          const rewards: RewardEntry[] = stampSetting.rewards
            ? (stampSetting.rewards as unknown as RewardEntry[])
            : buildRewardsFromLegacy(stampSetting as Record<string, any>);
          stampRewards = rewards
            .sort((a, b) => a.tier - b.tier)
            .map((r) => ({
              tier: r.tier,
              description: r.description,
              isRandom: !!(r.options && r.options.length > 0),
            }));
        }

        // 최근 스탬프 내역 10건 (매장명 포함)
        const recentStampHistory = await prisma.franchiseStampLedger.findMany({
          where: { franchiseCustomerId: fc.id },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            type: true,
            delta: true,
            balance: true,
            drawnReward: true,
            drawnRewardTier: true,
            createdAt: true,
            store: {
              select: { name: true },
            },
          },
        });

        // 최근 포인트 내역 10건
        const recentPointHistory = await prisma.franchisePointLedger.findMany({
          where: { franchiseCustomerId: fc.id },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            type: true,
            delta: true,
            balance: true,
            reason: true,
            createdAt: true,
            store: {
              select: { name: true },
            },
          },
        });

        // 매장별 적립 수 조회 (프랜차이즈 소속 매장의 Customer 중 kakaoId 일치)
        const franchiseStores = await prisma.store.findMany({
          where: { franchiseId: fc.franchiseId },
          select: { id: true, name: true },
        });

        const storeBreakdown = await Promise.all(
          franchiseStores.map(async (store) => {
            const customer = customers.find(
              (c) => c.storeId === store.id
            );
            return {
              storeId: store.id,
              storeName: store.name,
              stamps: customer?.totalStamps ?? 0,
            };
          })
        );

        // 실제로 적립이 있는 매장만 필터
        const activeStoreBreakdown = storeBreakdown.filter((s) => s.stamps > 0);

        return {
          franchiseId: fc.franchiseId,
          franchiseName: fc.franchise.name,
          totalStamps: fc.totalStamps,
          totalPoints: fc.totalPoints,
          visitCount: fc.visitCount,
          lastVisitAt: fc.lastVisitAt,
          stampRewards,
          storeBreakdown: activeStoreBreakdown,
          recentStampHistory: recentStampHistory.map((h) => ({
            ...h,
            storeName: h.store.name,
            store: undefined,
          })),
          recentPointHistory: recentPointHistory.map((h) => ({
            ...h,
            storeName: h.store.name,
            store: undefined,
          })),
        };
      })
    );

    // 프랜차이즈에 속한 매장은 stores에서 제외 (중복 방지)
    const franchiseStoreIds = new Set<string>();
    for (const fc of franchiseCustomers) {
      const franchiseStores = await prisma.store.findMany({
        where: { franchiseId: fc.franchiseId },
        select: { id: true },
      });
      franchiseStores.forEach((s) => franchiseStoreIds.add(s.id));
    }

    const independentStores = stores.filter(
      (s) => !franchiseStoreIds.has(s.storeId)
    );

    res.json({
      customer: customerInfo,
      franchises,
      stores: independentStores,
    });
  } catch (error) {
    console.error('[My Page API] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
