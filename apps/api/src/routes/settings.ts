import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

// GET /api/settings/point-policy
router.get('/point-policy', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;

    let policy = await prisma.pointPolicy.findUnique({ where: { storeId } });

    // Create default policy if not exists
    if (!policy) {
      policy = await prisma.pointPolicy.create({
        data: {
          storeId,
          type: 'FIXED',
          value: 100,
        },
      });
    }

    res.json(policy);
  } catch (error) {
    console.error('Point policy get error:', error);
    res.status(500).json({ error: '포인트 정책 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/settings/point-policy
router.post('/point-policy', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { type, value } = req.body;

    if (!type || !['PERCENT', 'FIXED'].includes(type)) {
      return res.status(400).json({ error: '유효한 정책 타입을 선택해주세요.' });
    }

    if (value === undefined || value < 0) {
      return res.status(400).json({ error: '유효한 값을 입력해주세요.' });
    }

    const policy = await prisma.pointPolicy.upsert({
      where: { storeId },
      update: { type, value },
      create: { storeId, type, value },
    });

    res.json({ success: true, policy });
  } catch (error) {
    console.error('Point policy update error:', error);
    res.status(500).json({ error: '포인트 정책 저장 중 오류가 발생했습니다.' });
  }
});

// GET /api/settings/store
router.get('/store', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;

    const store = await prisma.store.findUnique({
      where: { id: storeId },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    res.json(store);
  } catch (error) {
    console.error('Store get error:', error);
    res.status(500).json({ error: '매장 정보 조회 중 오류가 발생했습니다.' });
  }
});

// PATCH /api/settings/store - 매장 정보 수정
router.patch('/store', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { name, ownerName, phone, businessRegNumber, address, naverPlaceUrl } = req.body;

    // 최소 매장명은 필수
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: '매장명은 필수입니다.' });
    }

    // 기존 매장 정보 조회 (네이버 플레이스 URL 변경 감지용)
    const existingStore = await prisma.store.findUnique({
      where: { id: storeId },
      select: { naverPlaceUrl: true },
    });

    const newNaverPlaceUrl = naverPlaceUrl?.trim() || null;
    const urlChanged = existingStore?.naverPlaceUrl !== newNaverPlaceUrl;

    // 네이버 플레이스 URL이 변경되면 기존 리뷰 통계 삭제
    if (urlChanged && existingStore?.naverPlaceUrl) {
      await prisma.naverReviewStats.deleteMany({
        where: { storeId },
      });
      console.log('Naver review stats cleared due to URL change');
    }

    const store = await prisma.store.update({
      where: { id: storeId },
      data: {
        name: name.trim(),
        ownerName: ownerName?.trim() || null,
        phone: phone?.trim() || null,
        businessRegNumber: businessRegNumber?.trim() || null,
        address: address?.trim() || null,
        naverPlaceUrl: newNaverPlaceUrl,
      },
    });

    res.json({ success: true, store, reviewStatsCleared: urlChanged });
  } catch (error) {
    console.error('Store update error:', error);
    res.status(500).json({ error: '매장 정보 저장 중 오류가 발생했습니다.' });
  }
});

// GET /api/settings/alimtalk - 알림톡 설정 조회
router.get('/alimtalk', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: {
        pointsAlimtalkEnabled: true,
      },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    res.json({
      pointsAlimtalkEnabled: store.pointsAlimtalkEnabled,
    });
  } catch (error) {
    console.error('Alimtalk settings get error:', error);
    res.status(500).json({ error: '알림톡 설정 조회 중 오류가 발생했습니다.' });
  }
});

// PATCH /api/settings/alimtalk - 알림톡 설정 수정
router.patch('/alimtalk', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { pointsAlimtalkEnabled } = req.body;

    const store = await prisma.store.update({
      where: { id: storeId },
      data: {
        pointsAlimtalkEnabled: pointsAlimtalkEnabled === true,
      },
      select: {
        pointsAlimtalkEnabled: true,
      },
    });

    res.json({
      success: true,
      pointsAlimtalkEnabled: store.pointsAlimtalkEnabled,
    });
  } catch (error) {
    console.error('Alimtalk settings update error:', error);
    res.status(500).json({ error: '알림톡 설정 저장 중 오류가 발생했습니다.' });
  }
});

// GET /api/settings/fixed-point - 고정 포인트 설정 조회
router.get('/fixed-point', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: {
        fixedPointEnabled: true,
        fixedPointAmount: true,
      },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    res.json(store);
  } catch (error) {
    console.error('Fixed point settings get error:', error);
    res.status(500).json({ error: '고정 포인트 설정 조회 중 오류가 발생했습니다.' });
  }
});

// PATCH /api/settings/fixed-point - 고정 포인트 설정 수정
router.patch('/fixed-point', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { fixedPointEnabled, fixedPointAmount } = req.body;

    // 유효성 검사
    if (fixedPointAmount !== undefined && fixedPointAmount < 0) {
      return res.status(400).json({ error: '포인트는 0 이상이어야 합니다.' });
    }

    const store = await prisma.store.update({
      where: { id: storeId },
      data: {
        fixedPointEnabled: fixedPointEnabled === true,
        fixedPointAmount: fixedPointAmount ?? undefined,
      },
      select: {
        fixedPointEnabled: true,
        fixedPointAmount: true,
      },
    });

    res.json({ success: true, ...store });
  } catch (error) {
    console.error('Fixed point settings update error:', error);
    res.status(500).json({ error: '고정 포인트 설정 저장 중 오류가 발생했습니다.' });
  }
});

// GET /api/settings/point-rate - 포인트 적립률 설정 조회
router.get('/point-rate', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: {
        pointRateEnabled: true,
        pointRatePercent: true,
      },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    res.json(store);
  } catch (error) {
    console.error('Point rate settings get error:', error);
    res.status(500).json({ error: '포인트 적립률 설정 조회 중 오류가 발생했습니다.' });
  }
});

// PATCH /api/settings/point-rate - 포인트 적립률 설정 수정
router.patch('/point-rate', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { pointRateEnabled, pointRatePercent } = req.body;

    // 유효성 검사
    if (pointRatePercent !== undefined && (pointRatePercent < 0 || pointRatePercent > 100)) {
      return res.status(400).json({ error: '적립률은 0~100% 사이여야 합니다.' });
    }

    const store = await prisma.store.update({
      where: { id: storeId },
      data: {
        pointRateEnabled: pointRateEnabled === true,
        pointRatePercent: pointRatePercent ?? undefined,
      },
      select: {
        pointRateEnabled: true,
        pointRatePercent: true,
      },
    });

    res.json({ success: true, ...store });
  } catch (error) {
    console.error('Point rate settings update error:', error);
    res.status(500).json({ error: '포인트 적립률 설정 저장 중 오류가 발생했습니다.' });
  }
});

export default router;
