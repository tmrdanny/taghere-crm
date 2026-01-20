import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

// 인증 미들웨어 적용
router.use(authMiddleware);

// GET /api/stamp-settings - 스탬프 설정 조회
router.get('/', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;

    let setting = await prisma.stampSetting.findUnique({
      where: { storeId },
    });

    // 설정이 없으면 기본값으로 생성
    if (!setting) {
      setting = await prisma.stampSetting.create({
        data: {
          storeId,
          enabled: true,
          alimtalkEnabled: true,
        },
      });
    }

    res.json({
      enabled: setting.enabled,
      reward5Description: setting.reward5Description,
      reward10Description: setting.reward10Description,
      alimtalkEnabled: setting.alimtalkEnabled,
    });
  } catch (error) {
    console.error('Get stamp settings error:', error);
    res.status(500).json({ error: '스탬프 설정 조회 중 오류가 발생했습니다.' });
  }
});

// PUT /api/stamp-settings - 스탬프 설정 수정
router.put('/', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const {
      enabled,
      reward5Description,
      reward10Description,
      alimtalkEnabled,
    } = req.body;

    const setting = await prisma.stampSetting.upsert({
      where: { storeId },
      create: {
        storeId,
        enabled: enabled ?? true,
        reward5Description: reward5Description || null,
        reward10Description: reward10Description || null,
        alimtalkEnabled: alimtalkEnabled ?? true,
      },
      update: {
        ...(enabled !== undefined && { enabled }),
        ...(reward5Description !== undefined && { reward5Description: reward5Description || null }),
        ...(reward10Description !== undefined && { reward10Description: reward10Description || null }),
        ...(alimtalkEnabled !== undefined && { alimtalkEnabled }),
      },
    });

    res.json({
      enabled: setting.enabled,
      reward5Description: setting.reward5Description,
      reward10Description: setting.reward10Description,
      alimtalkEnabled: setting.alimtalkEnabled,
    });
  } catch (error) {
    console.error('Update stamp settings error:', error);
    res.status(500).json({ error: '스탬프 설정 수정 중 오류가 발생했습니다.' });
  }
});

export default router;
