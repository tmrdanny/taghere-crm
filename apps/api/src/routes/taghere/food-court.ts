import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';

const router = Router();

// ============================================================
// 푸드코트 모드 API (공개)
// ============================================================

interface FoodCourtBoothTable {
  tableNumber: string;
  url: string;
}

interface FoodCourtBooth {
  id: string;
  nameKo: string;
  nameEn?: string;
  categoryKo?: string;
  categoryEn?: string;
  imageUrl?: string;
  order: number;
  tables: FoodCourtBoothTable[];
}

// GET /api/taghere/food-court/:slug/:tableNumber - 푸드코트 매장 목록 (공개 API)
router.get('/food-court/:slug/:tableNumber', async (req, res) => {
  try {
    const { slug, tableNumber } = req.params;

    const store = await prisma.store.findFirst({
      where: { slug },
      select: {
        id: true,
        name: true,
        foodCourtSetting: true,
      },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    const setting = store.foodCourtSetting;
    if (!setting || !setting.enabled) {
      return res.status(404).json({ error: '푸드코트 서비스가 비활성화되어 있습니다.' });
    }

    let booths = ((setting.stores as unknown as FoodCourtBooth[]) || [])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    // 랜덤 배치: 매 요청(=고객 세션)마다 매장 순서를 섞음 (Fisher-Yates)
    if (setting.randomizeOrder) {
      for (let i = booths.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [booths[i], booths[j]] = [booths[j], booths[i]];
      }
    }

    res.json({
      storeName: store.name,
      customerTitle: setting.customerTitle || `${store.name} 푸드코트`,
      customerSubtitle: setting.customerSubtitle || '',
      noticeText: setting.noticeText || null,
      noticeLogoUrl: setting.noticeLogoUrl || null,
      tableNumber,
      stores: booths.map((b) => ({
        id: b.id,
        nameKo: b.nameKo,
        nameEn: b.nameEn || null,
        categoryKo: b.categoryKo || null,
        categoryEn: b.categoryEn || null,
        imageUrl: b.imageUrl || null,
        available: (b.tables || []).some((t) => t.tableNumber === tableNumber),
      })),
    });
  } catch (error) {
    console.error('Get food court info error:', error);
    res.status(500).json({ error: '푸드코트 정보 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/taghere/food-court/:slug/:tableNumber/redirect/:boothId - 매장×테이블 URL 조회 (공개 API)
router.get('/food-court/:slug/:tableNumber/redirect/:boothId', async (req, res) => {
  try {
    const { slug, tableNumber, boothId } = req.params;

    const store = await prisma.store.findFirst({
      where: { slug },
      select: {
        id: true,
        foodCourtSetting: true,
      },
    });

    if (!store || !store.foodCourtSetting?.enabled) {
      return res.status(404).json({ error: '서비스가 비활성화되어 있습니다.' });
    }

    const booths = (store.foodCourtSetting.stores as unknown as FoodCourtBooth[]) || [];
    const booth = booths.find((b) => b.id === boothId);

    if (!booth) {
      return res.status(404).json({ error: '해당 매장을 찾을 수 없습니다.' });
    }

    const table = (booth.tables || []).find((t) => t.tableNumber === tableNumber);
    if (!table) {
      return res.status(404).json({ error: '해당 테이블의 주문 링크가 없습니다.' });
    }

    res.json({ url: table.url });
  } catch (error) {
    console.error('Food court redirect error:', error);
    res.status(500).json({ error: '리다이렉트 처리 중 오류가 발생했습니다.' });
  }
});

export default router;
