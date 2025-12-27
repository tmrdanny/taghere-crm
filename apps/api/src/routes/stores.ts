import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

const router = Router();

// GET /api/stores/by-slug/:slug - slug로 매장 정보 조회 (public)
router.get('/by-slug/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    if (!slug) {
      return res.status(400).json({ error: 'slug가 필요합니다.' });
    }

    const store = await prisma.store.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        randomPointEnabled: true,
        randomPointMin: true,
        randomPointMax: true,
        fixedPointEnabled: true,
        fixedPointAmount: true,
      },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    res.json(store);
  } catch (error) {
    console.error('Store by slug error:', error);
    res.status(500).json({ error: '매장 정보 조회 중 오류가 발생했습니다.' });
  }
});

export default router;
