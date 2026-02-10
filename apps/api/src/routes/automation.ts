import { Router, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import type { AutomationRuleType } from '@prisma/client';

const router = Router();

// 유효한 타입 체크
const VALID_TYPES: AutomationRuleType[] = ['BIRTHDAY', 'CHURN_PREVENTION'];

// 기본 트리거 설정
const DEFAULT_TRIGGER_CONFIG: Record<string, object> = {
  BIRTHDAY: { daysBefore: 3 },
  CHURN_PREVENTION: { daysInactive: 30 },
};

// 기본 쿨다운 (일)
const DEFAULT_COOLDOWN: Record<string, number> = {
  BIRTHDAY: 365,      // 연 1회
  CHURN_PREVENTION: 60, // 60일 내 재발송 금지
};

/**
 * 매장의 자동화 규칙 lazy 초기화
 * 규칙이 없으면 모든 타입에 대해 enabled=false로 생성
 */
async function ensureRulesExist(storeId: string) {
  const existing = await prisma.automationRule.findMany({
    where: { storeId },
    select: { type: true },
  });

  const existingTypes = new Set(existing.map((r) => r.type));
  const missingTypes = VALID_TYPES.filter((t) => !existingTypes.has(t));

  if (missingTypes.length > 0) {
    await prisma.automationRule.createMany({
      data: missingTypes.map((type) => ({
        storeId,
        type,
        enabled: false,
        triggerConfig: DEFAULT_TRIGGER_CONFIG[type] as any,
        cooldownDays: DEFAULT_COOLDOWN[type],
        couponContent: type === 'BIRTHDAY' ? '생일 축하 특별 할인' : '다시 만나서 반가워요! 특별 할인',
      })),
    });
  }
}

// GET /api/automation/rules - 전체 규칙 목록 (매장별)
router.get('/rules', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.user?.storeId;
    if (!storeId) return res.status(401).json({ error: '인증이 필요합니다.' });

    await ensureRulesExist(storeId);

    const rules = await prisma.automationRule.findMany({
      where: { storeId },
      orderBy: { createdAt: 'asc' },
    });

    // 각 규칙의 이번 달 통계
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const stats = await Promise.all(
      rules.map(async (rule) => {
        const [totalSent, couponUsed] = await Promise.all([
          prisma.automationLog.count({
            where: {
              automationRuleId: rule.id,
              sentAt: { gte: startOfMonth },
            },
          }),
          prisma.automationLog.count({
            where: {
              automationRuleId: rule.id,
              sentAt: { gte: startOfMonth },
              couponUsed: true,
            },
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

    res.json({ rules, stats });
  } catch (error) {
    console.error('[Automation] Failed to fetch rules:', error);
    res.status(500).json({ error: '자동화 규칙을 불러오는데 실패했습니다.' });
  }
});

// PUT /api/automation/rules/:type - 규칙 설정 수정 (ON/OFF + 설정값)
router.put('/rules/:type', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.user?.storeId;
    if (!storeId) return res.status(401).json({ error: '인증이 필요합니다.' });

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
      couponDiscountType,
      couponDiscountValue,
      couponValidDays,
      messageTemplate,
      cooldownDays,
      monthlyMaxSends,
      sendTimeHour,
    } = req.body;

    // 업데이트 데이터 구성 (undefined인 필드는 무시)
    const updateData: Record<string, any> = {};
    if (enabled !== undefined) updateData.enabled = enabled;
    if (triggerConfig !== undefined) updateData.triggerConfig = triggerConfig;
    if (couponEnabled !== undefined) updateData.couponEnabled = couponEnabled;
    if (couponContent !== undefined) updateData.couponContent = couponContent;
    if (couponDiscountType !== undefined) updateData.couponDiscountType = couponDiscountType;
    if (couponDiscountValue !== undefined) updateData.couponDiscountValue = couponDiscountValue;
    if (couponValidDays !== undefined) updateData.couponValidDays = couponValidDays;
    if (messageTemplate !== undefined) updateData.messageTemplate = messageTemplate;
    if (cooldownDays !== undefined) updateData.cooldownDays = cooldownDays;
    if (monthlyMaxSends !== undefined) updateData.monthlyMaxSends = monthlyMaxSends;
    if (sendTimeHour !== undefined) {
      if (sendTimeHour < 0 || sendTimeHour > 23) {
        return res.status(400).json({ error: '발송 시각은 0~23 사이여야 합니다.' });
      }
      updateData.sendTimeHour = sendTimeHour;
    }

    const rule = await prisma.automationRule.update({
      where: {
        storeId_type: { storeId, type },
      },
      data: updateData,
    });

    res.json({ rule });
  } catch (error) {
    console.error('[Automation] Failed to update rule:', error);
    res.status(500).json({ error: '자동화 규칙 수정에 실패했습니다.' });
  }
});

// GET /api/automation/rules/:type/logs - 실행 이력
router.get('/rules/:type/logs', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.user?.storeId;
    if (!storeId) return res.status(401).json({ error: '인증이 필요합니다.' });

    const type = req.params.type as AutomationRuleType;
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: '유효하지 않은 자동화 타입입니다.' });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const rule = await prisma.automationRule.findUnique({
      where: { storeId_type: { storeId, type } },
    });

    if (!rule) {
      return res.json({ logs: [], pagination: { page, limit, total: 0, totalPages: 0 } });
    }

    const [logs, total] = await Promise.all([
      prisma.automationLog.findMany({
        where: { automationRuleId: rule.id },
        orderBy: { sentAt: 'desc' },
        skip,
        take: limit,
        include: {
          customer: {
            select: { name: true, phone: true },
          },
        },
      }),
      prisma.automationLog.count({
        where: { automationRuleId: rule.id },
      }),
    ]);

    res.json({
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('[Automation] Failed to fetch logs:', error);
    res.status(500).json({ error: '발송 이력을 불러오는데 실패했습니다.' });
  }
});

// GET /api/automation/dashboard - 자동화 성과 요약
router.get('/dashboard', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.user?.storeId;
    if (!storeId) return res.status(401).json({ error: '인증이 필요합니다.' });

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalSent, totalCouponUsed, revenueData] = await Promise.all([
      prisma.automationLog.count({
        where: { storeId, sentAt: { gte: startOfMonth } },
      }),
      prisma.automationLog.count({
        where: { storeId, sentAt: { gte: startOfMonth }, couponUsed: true },
      }),
      prisma.automationLog.aggregate({
        where: {
          storeId,
          sentAt: { gte: startOfMonth },
          couponUsed: true,
          resultAmount: { not: null },
        },
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
    console.error('[Automation] Failed to fetch dashboard:', error);
    res.status(500).json({ error: '대시보드를 불러오는데 실패했습니다.' });
  }
});

// GET /api/automation/preview/:type - 현재 대상 고객 수 미리보기
router.get('/preview/:type', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const storeId = req.user?.storeId;
    if (!storeId) return res.status(401).json({ error: '인증이 필요합니다.' });

    const type = req.params.type as AutomationRuleType;
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: '유효하지 않은 자동화 타입입니다.' });
    }

    if (type === 'BIRTHDAY') {
      // 생일 정보가 있는 고객 수
      const totalWithBirthday = await prisma.customer.count({
        where: {
          storeId,
          birthday: { not: null },
          consentMarketing: true,
        },
      });

      // 이번 달 예상 발송 수 (월 생일 고객)
      const now = new Date();
      const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
      const thisMonthBirthday = await prisma.customer.count({
        where: {
          storeId,
          birthday: { startsWith: currentMonth },
          consentMarketing: true,
        },
      });

      res.json({
        totalEligible: totalWithBirthday,
        thisMonthEstimate: thisMonthBirthday,
        estimatedMonthlyCost: thisMonthBirthday * 50,
      });
    } else if (type === 'CHURN_PREVENTION') {
      // 이탈 위험 고객 수 (30일 이상 미방문 + 2회 이상 방문)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const churnRisk = await prisma.customer.count({
        where: {
          storeId,
          visitCount: { gte: 2 },
          lastVisitAt: { lt: thirtyDaysAgo },
          consentMarketing: true,
        },
      });

      // 전체 재방문 가능 고객 수
      const totalRevisitable = await prisma.customer.count({
        where: {
          storeId,
          visitCount: { gte: 2 },
          consentMarketing: true,
        },
      });

      res.json({
        totalEligible: totalRevisitable,
        currentChurnRisk: churnRisk,
        estimatedMonthlyCost: churnRisk * 50,
      });
    }
  } catch (error) {
    console.error('[Automation] Failed to fetch preview:', error);
    res.status(500).json({ error: '미리보기를 불러오는데 실패했습니다.' });
  }
});

export default router;
