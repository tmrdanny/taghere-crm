import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

// 기본 방문 경로 옵션
const DEFAULT_OPTIONS = [
  { id: 'revisit', label: '단순 재방문', order: 1, enabled: true },
  { id: 'friend', label: '지인 추천', order: 2, enabled: true },
  { id: 'naver', label: '네이버', order: 3, enabled: true },
  { id: 'youtube', label: '유튜브', order: 4, enabled: true },
  { id: 'daangn', label: '당근', order: 5, enabled: true },
  { id: 'instagram', label: '인스타그램', order: 6, enabled: true },
  { id: 'sms', label: '문자', order: 7, enabled: true },
  { id: 'kakao', label: '카카오톡', order: 8, enabled: true },
  { id: 'passby', label: '지나가다 방문', order: 9, enabled: true },
];

// 최대 옵션 개수
const MAX_OPTIONS = 12;

interface VisitSourceOption {
  id: string;
  label: string;
  order: number;
  enabled: boolean;
}

// 인증 미들웨어 적용
router.use(authMiddleware);

// GET /api/visit-source-settings - 방문 경로 설정 조회
router.get('/', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;

    let setting = await prisma.visitSourceSetting.findUnique({
      where: { storeId },
    });

    // 설정이 없으면 기본값으로 생성 (enabled: true - 기본 ON)
    if (!setting) {
      setting = await prisma.visitSourceSetting.create({
        data: {
          storeId,
          enabled: true,
          options: DEFAULT_OPTIONS,
        },
      });
    }

    res.json({
      enabled: setting.enabled,
      options: setting.options as unknown as VisitSourceOption[],
    });
  } catch (error) {
    console.error('Get visit source settings error:', error);
    res.status(500).json({ error: '방문 경로 설정 조회 중 오류가 발생했습니다.' });
  }
});

// PUT /api/visit-source-settings - 방문 경로 설정 수정
router.put('/', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { enabled, options } = req.body;

    // 최대 옵션 개수 검증
    if (options && Array.isArray(options) && options.length > MAX_OPTIONS) {
      return res.status(400).json({ error: `방문 경로 옵션은 최대 ${MAX_OPTIONS}개까지만 추가할 수 있습니다.` });
    }

    const setting = await prisma.visitSourceSetting.upsert({
      where: { storeId },
      create: {
        storeId,
        enabled: enabled ?? false,
        options: options ?? DEFAULT_OPTIONS,
      },
      update: {
        ...(enabled !== undefined && { enabled }),
        ...(options !== undefined && { options }),
      },
    });

    res.json({
      enabled: setting.enabled,
      options: setting.options as unknown as VisitSourceOption[],
    });
  } catch (error) {
    console.error('Update visit source settings error:', error);
    res.status(500).json({ error: '방문 경로 설정 수정 중 오류가 발생했습니다.' });
  }
});

// GET /api/visit-source-settings/stats - 방문 경로 통계 조회
router.get('/stats', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { days = '30' } = req.query;

    const daysNum = parseInt(days as string, 10) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum);

    // 방문 경로별 고객 수 집계
    const distribution = await prisma.customer.groupBy({
      by: ['visitSource'],
      where: {
        storeId,
        visitSource: { not: null },
      },
      _count: { id: true },
    });

    // 설정에서 옵션 라벨 가져오기
    const setting = await prisma.visitSourceSetting.findUnique({
      where: { storeId },
    });
    const options = (setting?.options as unknown as VisitSourceOption[]) || DEFAULT_OPTIONS;
    const labelMap = Object.fromEntries(options.map(o => [o.id, o.label]));

    // 분포 데이터 변환
    const distributionData = distribution.map(item => ({
      source: item.visitSource || 'unknown',
      label: labelMap[item.visitSource || ''] || item.visitSource || '알 수 없음',
      count: item._count.id,
    }));

    // 전체 고객 수
    const totalCustomers = await prisma.customer.count({
      where: { storeId },
    });

    const withSource = distribution.reduce((sum, item) => sum + item._count.id, 0);

    res.json({
      distribution: distributionData.sort((a, b) => b.count - a.count),
      summary: {
        totalCustomers,
        withSource,
        withoutSource: totalCustomers - withSource,
      },
    });
  } catch (error) {
    console.error('Get visit source stats error:', error);
    res.status(500).json({ error: '방문 경로 통계 조회 중 오류가 발생했습니다.' });
  }
});

export default router;
