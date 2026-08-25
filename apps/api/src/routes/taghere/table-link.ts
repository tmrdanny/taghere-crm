import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';

const router = Router();

// ============================================================
// 테이블 링크 API (공개)
// ============================================================

interface TableEntry {
  tableNumber: string;
  url: string;
  label?: string;
}

// GET /api/taghere/table-link/:slug - 매장 테이블 링크 정보 (공개 API)
router.get('/table-link/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    const store = await prisma.store.findFirst({
      where: { slug },
      select: {
        id: true,
        name: true,
        tableLinkSetting: true,
      },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    const setting = store.tableLinkSetting;

    if (!setting || !setting.enabled) {
      return res.status(404).json({ error: '테이블 링크 서비스가 비활성화되어 있습니다.' });
    }

    const tables = (setting.tables as unknown as TableEntry[]) || [];

    res.json({
      storeName: store.name,
      customerTitle: setting.customerTitle || '테이블 번호를 입력해주세요',
      customerSubtitle: setting.customerSubtitle || '좌석 번호를 입력하면 주문 페이지로 이동합니다',
      tableNumbers: tables.map(t => t.tableNumber),
      genderCollectEnabled: setting.genderCollectEnabled ?? true,
    });
  } catch (error) {
    console.error('Get table link info error:', error);
    res.status(500).json({ error: '테이블 링크 정보 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/taghere/table-link/:slug/gender-log - 테이블 링크 성별 선택 기록 (공개 API, 야화 연동용)
router.post('/table-link/:slug/gender-log', async (req, res) => {
  try {
    const { slug } = req.params;
    const { tableNumber, gender } = req.body;

    if (!tableNumber || (gender !== 'MALE' && gender !== 'FEMALE')) {
      return res.status(400).json({ error: '테이블 번호와 성별(MALE/FEMALE)이 필요합니다.' });
    }

    const store = await prisma.store.findFirst({
      where: { slug },
      select: { id: true, tableLinkSetting: true },
    });

    if (!store || !store.tableLinkSetting?.enabled) {
      return res.status(404).json({ error: '서비스가 비활성화되어 있습니다.' });
    }

    const tables = (store.tableLinkSetting.tables as unknown as TableEntry[]) || [];
    if (!tables.some(t => t.tableNumber === String(tableNumber))) {
      return res.status(404).json({ error: '해당 테이블 번호를 찾을 수 없습니다.' });
    }

    await prisma.tableLinkGenderLog.create({
      data: {
        storeId: store.id,
        tableNumber: String(tableNumber),
        gender,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Table link gender log error:', error);
    res.status(500).json({ error: '성별 기록 중 오류가 발생했습니다.' });
  }
});

// GET /api/taghere/table-link/:slug/redirect/:tableNumber - 테이블 URL 조회 (공개 API)
router.get('/table-link/:slug/redirect/:tableNumber', async (req, res) => {
  try {
    const { slug, tableNumber } = req.params;

    const store = await prisma.store.findFirst({
      where: { slug },
      select: {
        id: true,
        tableLinkSetting: true,
      },
    });

    if (!store || !store.tableLinkSetting?.enabled) {
      return res.status(404).json({ error: '서비스가 비활성화되어 있습니다.' });
    }

    const tables = (store.tableLinkSetting.tables as unknown as TableEntry[]) || [];
    const table = tables.find(t => t.tableNumber === tableNumber);

    if (!table) {
      return res.status(404).json({ error: '해당 테이블 번호를 찾을 수 없습니다.' });
    }

    if (!table.url) {
      return res.status(404).json({ error: '해당 테이블에 링크가 설정되지 않았습니다.' });
    }

    res.json({ url: table.url });
  } catch (error) {
    console.error('Table link redirect error:', error);
    res.status(500).json({ error: '리다이렉트 처리 중 오류가 발생했습니다.' });
  }
});

export default router;
