import { Router, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { franchiseAuthMiddleware, FranchiseAuthRequest } from '../middleware/franchise-auth.js';
import { VALID_TYPES, ensureRulesExist } from './automation.js';
import type { AutomationRuleType } from '@prisma/client';

const router = Router();

/** 가맹점이 해당 프랜차이즈 소속인지 검증 */
async function verifyStoreOwnership(franchiseId: string, storeId: string) {
  const store = await prisma.store.findFirst({
    where: { id: storeId, franchiseId },
    select: { id: true, name: true, naverPlaceUrl: true },
  });
  return store;
}

// GET /stores - 가맹점 목록 + 각 활성 rule 수 + naverPlaceUrl
router.get('/stores', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res: Response) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;

    const stores = await prisma.store.findMany({
      where: { franchiseId },
      select: {
        id: true,
        name: true,
        naverPlaceUrl: true,
        automationRules: {
          where: { enabled: true },
          select: { id: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    const result = stores.map((s) => ({
      id: s.id,
      name: s.name,
      naverPlaceUrl: s.naverPlaceUrl || '',
      activeRuleCount: s.automationRules.length,
    }));

    res.json({ stores: result });
  } catch (error) {
    console.error('[FranchiseAutomation] Failed to fetch stores:', error);
    res.status(500).json({ error: '가맹점 목록을 불러오는데 실패했습니다.' });
  }
});

// GET /stores/:storeId/rules - 해당 가맹점의 전체 규칙 + stats
router.get('/stores/:storeId/rules', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res: Response) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const { storeId } = req.params;

    const store = await verifyStoreOwnership(franchiseId, storeId);
    if (!store) return res.status(404).json({ error: '가맹점을 찾을 수 없습니다.' });

    await ensureRulesExist(storeId);

    const rules = await prisma.automationRule.findMany({
      where: { storeId },
      orderBy: { createdAt: 'asc' },
    });

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const stats = await Promise.all(
      rules.map(async (rule) => {
        const [totalSent, couponUsed] = await Promise.all([
          prisma.automationLog.count({
            where: { automationRuleId: rule.id, sentAt: { gte: startOfMonth } },
          }),
          prisma.automationLog.count({
            where: { automationRuleId: rule.id, sentAt: { gte: startOfMonth }, couponUsed: true },
          }),
        ]);
        return {
          ruleId: rule.id,
          type: rule.type,
          monthlySent: totalSent,
          monthlyCouponUsed: couponUsed,
          usageRate: totalSent > 0 ? Math.round((couponUsed / totalSent) * 100) : 0,
        };
      })
    );

    res.json({ rules, stats, storeName: store.name, naverPlaceUrl: store.naverPlaceUrl || '' });
  } catch (error) {
    console.error('[FranchiseAutomation] Failed to fetch rules:', error);
    res.status(500).json({ error: '자동화 규칙을 불러오는데 실패했습니다.' });
  }
});

// PUT /stores/:storeId/rules/:type - 규칙 수정
router.put('/stores/:storeId/rules/:type', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res: Response) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const { storeId } = req.params;

    const store = await verifyStoreOwnership(franchiseId, storeId);
    if (!store) return res.status(404).json({ error: '가맹점을 찾을 수 없습니다.' });

    const type = req.params.type as AutomationRuleType;
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: '유효하지 않은 자동화 타입입니다.' });
    }

    await ensureRulesExist(storeId);

    const {
      enabled,
      triggerConfig,
      couponEnabled,
      couponContent,
      couponValidDays,
      sendTimeHour,
    } = req.body;

    // 활성화 시 네이버 플레이스 링크 필수
    if (enabled === true && !store.naverPlaceUrl) {
      return res.status(400).json({ error: '네이버 플레이스 링크가 없으면 자동 마케팅을 활성화할 수 없습니다.' });
    }

    const updateData: Record<string, any> = {};
    if (enabled !== undefined) updateData.enabled = enabled;
    if (triggerConfig !== undefined) updateData.triggerConfig = triggerConfig;
    if (couponEnabled !== undefined) updateData.couponEnabled = couponEnabled;
    if (couponContent !== undefined) updateData.couponContent = couponContent;
    if (couponValidDays !== undefined) updateData.couponValidDays = couponValidDays;
    if (sendTimeHour !== undefined) {
      if (sendTimeHour < 0 || sendTimeHour > 23) {
        return res.status(400).json({ error: '발송 시각은 0~23 사이여야 합니다.' });
      }
      updateData.sendTimeHour = sendTimeHour;
    }

    const rule = await prisma.automationRule.update({
      where: { storeId_type: { storeId, type } },
      data: updateData,
    });

    res.json({ rule });
  } catch (error) {
    console.error('[FranchiseAutomation] Failed to update rule:', error);
    res.status(500).json({ error: '자동화 규칙 수정에 실패했습니다.' });
  }
});

// GET /stores/:storeId/preview/:type - 대상 미리보기
router.get('/stores/:storeId/preview/:type', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res: Response) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const { storeId } = req.params;

    const store = await verifyStoreOwnership(franchiseId, storeId);
    if (!store) return res.status(404).json({ error: '가맹점을 찾을 수 없습니다.' });

    const type = req.params.type as AutomationRuleType;
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: '유효하지 않은 자동화 타입입니다.' });
    }

    if (type === 'BIRTHDAY') {
      const totalWithBirthday = await prisma.customer.count({
        where: { storeId, birthday: { not: null }, consentMarketing: true },
      });
      const now = new Date();
      const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
      const thisMonthBirthday = await prisma.customer.count({
        where: { storeId, birthday: { startsWith: currentMonth }, consentMarketing: true },
      });
      res.json({ totalEligible: totalWithBirthday, thisMonthEstimate: thisMonthBirthday, estimatedMonthlyCost: thisMonthBirthday * 50 });
    } else if (type === 'CHURN_PREVENTION') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const churnRisk = await prisma.customer.count({
        where: { storeId, visitCount: { gte: 2 }, lastVisitAt: { lt: thirtyDaysAgo }, consentMarketing: true },
      });
      const totalRevisitable = await prisma.customer.count({
        where: { storeId, visitCount: { gte: 2 }, consentMarketing: true },
      });
      res.json({ totalEligible: totalRevisitable, currentChurnRisk: churnRisk, estimatedMonthlyCost: churnRisk * 50 });
    } else if (type === 'ANNIVERSARY') {
      const totalCustomers = await prisma.customer.count({
        where: { storeId, consentMarketing: true, phone: { not: null } },
      });
      const thisMonthEstimate = Math.round(totalCustomers / 12);
      res.json({ totalEligible: totalCustomers, thisMonthEstimate, estimatedMonthlyCost: thisMonthEstimate * 50 });
    } else if (type === 'FIRST_VISIT_FOLLOWUP') {
      const firstVisitors = await prisma.customer.count({
        where: { storeId, visitCount: 1, consentMarketing: true, phone: { not: null } },
      });
      res.json({ totalEligible: firstVisitors, thisMonthEstimate: firstVisitors, estimatedMonthlyCost: firstVisitors * 50 });
    } else if (type === 'VIP_MILESTONE') {
      const vipCandidates = await prisma.customer.count({
        where: { storeId, visitCount: { gte: 5 }, consentMarketing: true, phone: { not: null } },
      });
      res.json({ totalEligible: vipCandidates, thisMonthEstimate: Math.round(vipCandidates * 0.1), estimatedMonthlyCost: Math.round(vipCandidates * 0.1) * 50 });
    } else if (type === 'WINBACK') {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const winbackTargets = await prisma.customer.count({
        where: { storeId, visitCount: { gte: 2 }, lastVisitAt: { lt: ninetyDaysAgo }, consentMarketing: true, phone: { not: null } },
      });
      res.json({ totalEligible: winbackTargets, currentChurnRisk: winbackTargets, estimatedMonthlyCost: winbackTargets * 50 });
    } else if (type === 'SLOW_DAY') {
      const totalWithVisit = await prisma.customer.count({
        where: { storeId, visitCount: { gte: 1 }, consentMarketing: true, phone: { not: null } },
      });
      res.json({ totalEligible: totalWithVisit, thisMonthEstimate: Math.round(totalWithVisit * 0.3), estimatedMonthlyCost: Math.round(totalWithVisit * 0.3) * 50 });
    } else {
      res.json({ totalEligible: 0, thisMonthEstimate: 0, estimatedMonthlyCost: 0 });
    }
  } catch (error) {
    console.error('[FranchiseAutomation] Failed to fetch preview:', error);
    res.status(500).json({ error: '미리보기를 불러오는데 실패했습니다.' });
  }
});

// GET /stores/:storeId/rules/:type/logs - 발송 이력
router.get('/stores/:storeId/rules/:type/logs', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res: Response) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const { storeId } = req.params;

    const store = await verifyStoreOwnership(franchiseId, storeId);
    if (!store) return res.status(404).json({ error: '가맹점을 찾을 수 없습니다.' });

    const type = req.params.type as AutomationRuleType;
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: '유효하지 않은 자동화 타입입니다.' });
    }

    const limit = parseInt(req.query.limit as string) || 10;

    const rule = await prisma.automationRule.findUnique({
      where: { storeId_type: { storeId, type } },
    });

    if (!rule) return res.json({ logs: [] });

    const logs = await prisma.automationLog.findMany({
      where: { automationRuleId: rule.id },
      orderBy: { sentAt: 'desc' },
      take: limit,
      include: {
        customer: { select: { name: true, phone: true } },
      },
    });

    res.json({ logs });
  } catch (error) {
    console.error('[FranchiseAutomation] Failed to fetch logs:', error);
    res.status(500).json({ error: '발송 이력을 불러오는데 실패했습니다.' });
  }
});

// GET /stores/:storeId/dashboard - 월별 대시보드
router.get('/stores/:storeId/dashboard', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res: Response) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const { storeId } = req.params;

    const store = await verifyStoreOwnership(franchiseId, storeId);
    if (!store) return res.status(404).json({ error: '가맹점을 찾을 수 없습니다.' });

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalSent, totalCouponUsed, revenueData] = await Promise.all([
      prisma.automationLog.count({ where: { storeId, sentAt: { gte: startOfMonth } } }),
      prisma.automationLog.count({ where: { storeId, sentAt: { gte: startOfMonth }, couponUsed: true } }),
      prisma.automationLog.aggregate({
        where: { storeId, sentAt: { gte: startOfMonth }, couponUsed: true, resultAmount: { not: null } },
        _sum: { resultAmount: true },
      }),
    ]);

    res.json({
      totalSent,
      totalCouponUsed,
      usageRate: totalSent > 0 ? Math.round((totalCouponUsed / totalSent) * 100) : 0,
      estimatedRevenue: revenueData._sum.resultAmount || 0,
    });
  } catch (error) {
    console.error('[FranchiseAutomation] Failed to fetch dashboard:', error);
    res.status(500).json({ error: '대시보드를 불러오는데 실패했습니다.' });
  }
});

// PUT /stores/:storeId/naver-place-url - 네이버 플레이스 링크 직접 수정
router.put('/stores/:storeId/naver-place-url', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res: Response) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const { storeId } = req.params;

    const store = await verifyStoreOwnership(franchiseId, storeId);
    if (!store) return res.status(404).json({ error: '가맹점을 찾을 수 없습니다.' });

    const { naverPlaceUrl } = req.body;
    if (!naverPlaceUrl || typeof naverPlaceUrl !== 'string') {
      return res.status(400).json({ error: '네이버 플레이스 링크를 입력해주세요.' });
    }

    await prisma.store.update({
      where: { id: storeId },
      data: { naverPlaceUrl: naverPlaceUrl.trim() },
    });

    res.json({ success: true, naverPlaceUrl: naverPlaceUrl.trim() });
  } catch (error) {
    console.error('[FranchiseAutomation] Failed to update naver place url:', error);
    res.status(500).json({ error: '네이버 플레이스 링크 수정에 실패했습니다.' });
  }
});

// PUT /bulk/rules/:type - 전체 가맹점 일괄 규칙 설정
router.put('/bulk/rules/:type', franchiseAuthMiddleware, async (req: FranchiseAuthRequest, res: Response) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;

    const type = req.params.type as AutomationRuleType;
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: '유효하지 않은 자동화 타입입니다.' });
    }

    const stores = await prisma.store.findMany({
      where: { franchiseId },
      select: { id: true, name: true, naverPlaceUrl: true },
    });

    const {
      enabled,
      triggerConfig,
      couponEnabled,
      couponContent,
      couponValidDays,
      sendTimeHour,
    } = req.body;

    const updateData: Record<string, any> = {};
    if (enabled !== undefined) updateData.enabled = enabled;
    if (triggerConfig !== undefined) updateData.triggerConfig = triggerConfig;
    if (couponEnabled !== undefined) updateData.couponEnabled = couponEnabled;
    if (couponContent !== undefined) updateData.couponContent = couponContent;
    if (couponValidDays !== undefined) updateData.couponValidDays = couponValidDays;
    if (sendTimeHour !== undefined) {
      if (sendTimeHour < 0 || sendTimeHour > 23) {
        return res.status(400).json({ error: '발송 시각은 0~23 사이여야 합니다.' });
      }
      updateData.sendTimeHour = sendTimeHour;
    }

    let updatedCount = 0;
    const skippedStores: string[] = [];

    for (const store of stores) {
      await ensureRulesExist(store.id);

      // 활성화 시 네이버 플레이스 링크 없으면 스킵
      if (enabled === true && !store.naverPlaceUrl) {
        skippedStores.push(store.name);
        continue;
      }

      await prisma.automationRule.update({
        where: { storeId_type: { storeId: store.id, type } },
        data: updateData,
      });
      updatedCount++;
    }

    res.json({
      updatedCount,
      totalStores: stores.length,
      skippedStores,
    });
  } catch (error) {
    console.error('[FranchiseAutomation] Failed to bulk update rules:', error);
    res.status(500).json({ error: '일괄 설정에 실패했습니다.' });
  }
});

export default router;
