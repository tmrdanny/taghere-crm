import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

// GET /api/cards
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;

    const cards = await prisma.card.findMany({
      where: { storeId, enabled: true },
      orderBy: { isDefault: 'desc' },
    });

    res.json({ cards });
  } catch (error) {
    console.error('Cards list error:', error);
    res.status(500).json({ error: '카드 목록 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/cards - 카드 등록 (MVP: mock)
router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { brand, last4, holderName, expiryMonth, expiryYear } = req.body;

    if (!brand || !last4) {
      return res.status(400).json({ error: '카드 정보를 입력해주세요.' });
    }

    // Check if there's already a default card
    const existingDefault = await prisma.card.findFirst({
      where: { storeId, isDefault: true },
    });

    const card = await prisma.card.create({
      data: {
        storeId,
        brand,
        last4,
        holderName,
        expiryMonth,
        expiryYear,
        enabled: true,
        isDefault: !existingDefault,
      },
    });

    res.json({ success: true, card });
  } catch (error) {
    console.error('Card create error:', error);
    res.status(500).json({ error: '카드 등록 중 오류가 발생했습니다.' });
  }
});

// DELETE /api/cards/:id
router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { id } = req.params;

    const card = await prisma.card.findFirst({
      where: { id, storeId },
    });

    if (!card) {
      return res.status(404).json({ error: '카드를 찾을 수 없습니다.' });
    }

    await prisma.card.update({
      where: { id },
      data: { enabled: false },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Card delete error:', error);
    res.status(500).json({ error: '카드 삭제 중 오류가 발생했습니다.' });
  }
});

// POST /api/cards/:id/default
router.post('/:id/default', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { id } = req.params;

    const card = await prisma.card.findFirst({
      where: { id, storeId, enabled: true },
    });

    if (!card) {
      return res.status(404).json({ error: '카드를 찾을 수 없습니다.' });
    }

    // Unset all defaults, then set this one
    await prisma.$transaction([
      prisma.card.updateMany({
        where: { storeId },
        data: { isDefault: false },
      }),
      prisma.card.update({
        where: { id },
        data: { isDefault: true },
      }),
    ]);

    res.json({ success: true });
  } catch (error) {
    console.error('Card default error:', error);
    res.status(500).json({ error: '기본 카드 설정 중 오류가 발생했습니다.' });
  }
});

export default router;
