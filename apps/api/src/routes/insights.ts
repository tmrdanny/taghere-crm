import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

// 인증 미들웨어 적용
router.use(authMiddleware);

// 연령대 라벨 변환
const getAgeLabel = (ageGroup: string): string => {
  switch (ageGroup) {
    case 'TWENTIES': return '20대';
    case 'THIRTIES': return '30대';
    case 'FORTIES': return '40대';
    case 'FIFTIES': return '50대';
    case 'SIXTY_PLUS': return '60대 이상';
    default: return ageGroup;
  }
};

// birthYear로부터 ageGroup 계산
const calculateAgeGroup = (birthYear: number | null): string | null => {
  if (!birthYear) return null;
  const currentYear = new Date().getFullYear();
  const age = currentYear - birthYear;

  if (age >= 20 && age < 30) return 'TWENTIES';
  if (age >= 30 && age < 40) return 'THIRTIES';
  if (age >= 40 && age < 50) return 'FORTIES';
  if (age >= 50 && age < 60) return 'FIFTIES';
  if (age >= 60) return 'SIXTY_PLUS';
  return null;
};

// GET /api/insights/customers - 고객 통계
router.get('/customers', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;

    // 1. 전체 고객 조회
    const allCustomers = await prisma.customer.findMany({
      where: { storeId },
      select: {
        id: true,
        gender: true,
        ageGroup: true,
        birthYear: true,
        visitSource: true,
        visitCount: true,
        totalPoints: true,
      },
    });

    const totalCustomers = allCustomers.length;

    // 2. 성별 분포
    let maleCount = 0;
    let femaleCount = 0;
    let unknownGenderCount = 0;

    allCustomers.forEach((c) => {
      if (c.gender === 'MALE') maleCount++;
      else if (c.gender === 'FEMALE') femaleCount++;
      else unknownGenderCount++;
    });

    const genderDistribution = {
      male: maleCount,
      female: femaleCount,
      unknown: unknownGenderCount,
      total: totalCustomers,
    };

    // 3. 연령대 분포
    const ageMap = new Map<string, number>();
    allCustomers.forEach((c) => {
      const ageGroup = c.ageGroup || calculateAgeGroup(c.birthYear);
      if (ageGroup) {
        ageMap.set(ageGroup, (ageMap.get(ageGroup) || 0) + 1);
      }
    });

    const ageDistribution = Array.from(ageMap.entries())
      .map(([ageGroup, count]) => ({
        ageGroup,
        label: getAgeLabel(ageGroup),
        count,
        percentage: totalCustomers > 0 ? Math.round((count / totalCustomers) * 100) : 0,
      }))
      .sort((a, b) => {
        const order: Record<string, number> = {
          TWENTIES: 1,
          THIRTIES: 2,
          FORTIES: 3,
          FIFTIES: 4,
          SIXTY_PLUS: 5,
        };
        return (order[a.ageGroup] || 999) - (order[b.ageGroup] || 999);
      });

    // 4. 성별 × 연령대별 평균 포인트 (소비 대용)
    const genderAgeMap = new Map<string, { totalPoints: number; count: number }>();

    allCustomers.forEach((c) => {
      const gender = c.gender || 'UNKNOWN';
      const ageGroup = c.ageGroup || calculateAgeGroup(c.birthYear) || 'UNKNOWN';
      const key = `${gender}_${ageGroup}`;

      if (!genderAgeMap.has(key)) {
        genderAgeMap.set(key, { totalPoints: 0, count: 0 });
      }

      const data = genderAgeMap.get(key)!;
      data.totalPoints += c.totalPoints || 0;
      data.count += 1;
    });

    const genderAgeSpending = Array.from(genderAgeMap.entries())
      .filter(([key]) => !key.includes('UNKNOWN'))
      .map(([key, data]) => {
        const [gender, ageGroup] = key.split('_');
        return {
          gender: gender === 'MALE' ? '남성' : '여성',
          genderCode: gender,
          ageGroup,
          ageLabel: getAgeLabel(ageGroup),
          avgPoints: data.count > 0 ? Math.round(data.totalPoints / data.count) : 0,
        };
      })
      .sort((a, b) => {
        const genderOrder = { MALE: 1, FEMALE: 2 };
        const ageOrder: Record<string, number> = {
          TWENTIES: 1,
          THIRTIES: 2,
          FORTIES: 3,
          FIFTIES: 4,
          SIXTY_PLUS: 5,
        };
        const genderDiff =
          (genderOrder[a.genderCode as keyof typeof genderOrder] || 99) -
          (genderOrder[b.genderCode as keyof typeof genderOrder] || 99);
        if (genderDiff !== 0) return genderDiff;
        return (ageOrder[a.ageGroup] || 99) - (ageOrder[b.ageGroup] || 99);
      });

    // 5. 재방문율 (7일, 30일)
    const now = new Date();
    const date7DaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const date30DaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 7일 내 방문 고객
    const visits7Days = await prisma.pointLedger.groupBy({
      by: ['customerId'],
      where: {
        storeId,
        type: 'EARN',
        createdAt: { gte: date7DaysAgo },
      },
      _count: { id: true },
    });

    const total7Days = visits7Days.length;
    const revisit7Days = visits7Days.filter((v) => v._count.id >= 2).length;
    const retention7 = total7Days > 0 ? Math.round((revisit7Days / total7Days) * 100) : 0;

    // 30일 내 방문 고객
    const visits30Days = await prisma.pointLedger.groupBy({
      by: ['customerId'],
      where: {
        storeId,
        type: 'EARN',
        createdAt: { gte: date30DaysAgo },
      },
      _count: { id: true },
    });

    const total30Days = visits30Days.length;
    const revisit30Days = visits30Days.filter((v) => v._count.id >= 2).length;
    const retention30 = total30Days > 0 ? Math.round((revisit30Days / total30Days) * 100) : 0;

    const retention = {
      day7: retention7,
      day30: retention30,
    };

    // 6. 방문 경로 분포
    const visitSourceMap = new Map<string, number>();
    let noSourceCount = 0;

    allCustomers.forEach((c) => {
      if (c.visitSource) {
        visitSourceMap.set(c.visitSource, (visitSourceMap.get(c.visitSource) || 0) + 1);
      } else {
        noSourceCount++;
      }
    });

    // 방문 경로 라벨 조회
    const visitSourceSetting = await prisma.visitSourceSetting.findUnique({
      where: { storeId },
      select: { options: true },
    });

    const optionsArray = (visitSourceSetting?.options as Array<{ id: string; label: string }>) || [];
    const labelMap = new Map(optionsArray.map((opt) => [opt.id, opt.label]));

    const visitSourceDistribution = Array.from(visitSourceMap.entries())
      .map(([source, count]) => ({
        source,
        label: labelMap.get(source) || source,
        count,
        percentage: totalCustomers > 0 ? Math.round((count / totalCustomers) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // 미설정 고객 추가
    if (noSourceCount > 0) {
      visitSourceDistribution.push({
        source: 'none',
        label: '미설정',
        count: noSourceCount,
        percentage: totalCustomers > 0 ? Math.round((noSourceCount / totalCustomers) * 100) : 0,
      });
    }

    res.json({
      totalCustomers,
      genderDistribution,
      ageDistribution,
      genderAgeSpending,
      retention,
      visitSourceDistribution,
    });
  } catch (error) {
    console.error('Customer insights error:', error);
    res.status(500).json({ error: '고객 통계 조회 중 오류가 발생했습니다.' });
  }
});

export default router;
