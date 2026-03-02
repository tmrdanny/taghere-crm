import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

interface TableEntry {
  tableNumber: string;
  url: string;
  label?: string;
}

const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || 'https://taghere-crm-web-g96p.onrender.com';

router.use(authMiddleware);

// GET /api/table-link-settings
router.get('/', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;

    let setting = await prisma.tableLinkSetting.findUnique({
      where: { storeId },
    });

    if (!setting) {
      setting = await prisma.tableLinkSetting.create({
        data: {
          storeId,
          enabled: false,
          tables: [],
        },
      });
    }

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { slug: true, name: true },
    });

    res.json({
      enabled: setting.enabled,
      customerTitle: setting.customerTitle,
      customerSubtitle: setting.customerSubtitle,
      tables: (setting.tables as unknown as TableEntry[]) || [],
      customerPageUrl: store?.slug
        ? `${PUBLIC_APP_URL}/taghere-table-link/${store.slug}`
        : null,
      storeName: store?.name,
    });
  } catch (error) {
    console.error('Get table link settings error:', error);
    res.status(500).json({ error: '테이블 링크 설정 조회 중 오류가 발생했습니다.' });
  }
});

// PUT /api/table-link-settings
router.put('/', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { enabled, tables, customerTitle, customerSubtitle } = req.body;

    if (tables && Array.isArray(tables)) {
      if (tables.length > 100) {
        return res.status(400).json({ error: '테이블은 최대 100개까지 등록할 수 있습니다.' });
      }

      const numbers = tables.map((t: TableEntry) => t.tableNumber);
      const unique = new Set(numbers);
      if (unique.size !== numbers.length) {
        return res.status(400).json({ error: '중복된 테이블 번호가 있습니다.' });
      }

      for (const t of tables as TableEntry[]) {
        if (!t.tableNumber || !t.url) {
          return res.status(400).json({ error: '테이블 번호와 URL은 필수입니다.' });
        }
        try {
          new URL(t.url);
        } catch {
          return res.status(400).json({ error: `잘못된 URL 형식입니다: ${t.url}` });
        }
      }
    }

    const setting = await prisma.tableLinkSetting.upsert({
      where: { storeId },
      create: {
        storeId,
        enabled: enabled ?? false,
        tables: (tables ?? []) as any,
        customerTitle: customerTitle ?? null,
        customerSubtitle: customerSubtitle ?? null,
      },
      update: {
        ...(enabled !== undefined && { enabled }),
        ...(tables !== undefined && { tables: tables as any }),
        ...(customerTitle !== undefined && { customerTitle }),
        ...(customerSubtitle !== undefined && { customerSubtitle }),
      },
    });

    res.json({
      enabled: setting.enabled,
      customerTitle: setting.customerTitle,
      customerSubtitle: setting.customerSubtitle,
      tables: (setting.tables as unknown as TableEntry[]) || [],
    });
  } catch (error) {
    console.error('Update table link settings error:', error);
    res.status(500).json({ error: '테이블 링크 설정 수정 중 오류가 발생했습니다.' });
  }
});

// POST /api/table-link-settings/bulk-add
router.post('/bulk-add', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { startNumber, endNumber, urlTemplate } = req.body;

    if (!startNumber || !endNumber || !urlTemplate) {
      return res.status(400).json({ error: '시작 번호, 끝 번호, URL 템플릿이 필요합니다.' });
    }

    const start = parseInt(startNumber);
    const end = parseInt(endNumber);

    if (isNaN(start) || isNaN(end) || start < 1 || end > 100 || start > end) {
      return res.status(400).json({ error: '유효한 범위를 입력해주세요. (1~100)' });
    }

    let setting = await prisma.tableLinkSetting.findUnique({
      where: { storeId },
    });

    const existingTables = (setting?.tables as unknown as TableEntry[]) || [];
    const existingNumbers = new Set(existingTables.map(t => t.tableNumber));

    const newTables: TableEntry[] = [];
    for (let i = start; i <= end; i++) {
      const num = String(i);
      if (!existingNumbers.has(num)) {
        newTables.push({
          tableNumber: num,
          url: urlTemplate.replace(/\{number\}/g, num),
        });
      }
    }

    const mergedTables = [...existingTables, ...newTables];

    if (mergedTables.length > 100) {
      return res.status(400).json({ error: '테이블은 최대 100개까지 등록할 수 있습니다.' });
    }

    const updated = await prisma.tableLinkSetting.upsert({
      where: { storeId },
      create: {
        storeId,
        enabled: false,
        tables: mergedTables as any,
      },
      update: {
        tables: mergedTables as any,
      },
    });

    res.json({
      tables: (updated.tables as unknown as TableEntry[]) || [],
      addedCount: newTables.length,
      skippedCount: (end - start + 1) - newTables.length,
    });
  } catch (error) {
    console.error('Bulk add tables error:', error);
    res.status(500).json({ error: '일괄 추가 중 오류가 발생했습니다.' });
  }
});

export default router;
