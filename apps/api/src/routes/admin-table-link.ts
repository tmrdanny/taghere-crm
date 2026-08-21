import { Router, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { generateSlug, getUniqueSlug } from './auth.js';
import { AdminRequest, adminAuthMiddleware } from './admin-shared.js';

const router = Router();

interface TableEntry {
  tableNumber: string;
  url: string;
  label?: string;
}

const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || 'https://taghere-crm-web-g96p.onrender.com';

// 스킴 없는 입력은 https://로 보정 (고객 페이지가 window.location.href로 이동하므로 상대경로 해석 방지)
function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || /^(mailto|tel|sms):/i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

// GET /api/admin/table-link-settings/:storeId
router.get('/table-link-settings/:storeId', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { storeId } = req.params;

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, slug: true, name: true },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    // slug가 없는 매장은 자동 생성
    let storeSlug = store.slug;
    if (!storeSlug) {
      const baseSlug = generateSlug(store.name);
      storeSlug = await getUniqueSlug(baseSlug);
      await prisma.store.update({
        where: { id: storeId },
        data: { slug: storeSlug },
      });
    }

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

    res.json({
      enabled: setting.enabled,
      genderCollectEnabled: setting.genderCollectEnabled,
      customerTitle: setting.customerTitle,
      customerSubtitle: setting.customerSubtitle,
      tables: (setting.tables as unknown as TableEntry[]) || [],
      customerPageUrl: `${PUBLIC_APP_URL}/taghere-table-link/${storeSlug}`,
      storeName: store.name,
      storeSlug,
    });
  } catch (error) {
    console.error('Admin get table link settings error:', error);
    res.status(500).json({ error: '테이블 링크 설정 조회 중 오류가 발생했습니다.' });
  }
});

// PUT /api/admin/table-link-settings/:storeId
router.put('/table-link-settings/:storeId', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { storeId } = req.params;
    const { enabled, genderCollectEnabled, tables, customerTitle, customerSubtitle } = req.body;

    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    let normalizedTables: TableEntry[] | undefined;
    if (tables && Array.isArray(tables)) {
      if (tables.length > 100) {
        return res.status(400).json({ error: '테이블은 최대 100개까지 등록할 수 있습니다.' });
      }

      normalizedTables = (tables as TableEntry[]).map(t => ({
        ...t,
        tableNumber: (t.tableNumber || '').trim(),
        url: normalizeUrl(t.url || ''),
      }));

      const numbers = normalizedTables.map(t => t.tableNumber).filter(Boolean);
      const unique = new Set(numbers);
      if (unique.size !== numbers.length) {
        return res.status(400).json({ error: '중복된 테이블 번호가 있습니다.' });
      }
    }

    const setting = await prisma.tableLinkSetting.upsert({
      where: { storeId },
      create: {
        storeId,
        enabled: enabled ?? false,
        genderCollectEnabled: genderCollectEnabled ?? true,
        tables: (normalizedTables ?? tables ?? []) as any,
        customerTitle: customerTitle ?? null,
        customerSubtitle: customerSubtitle ?? null,
      },
      update: {
        ...(enabled !== undefined && { enabled }),
        ...(genderCollectEnabled !== undefined && { genderCollectEnabled }),
        ...(tables !== undefined && { tables: (normalizedTables ?? tables) as any }),
        ...(customerTitle !== undefined && { customerTitle }),
        ...(customerSubtitle !== undefined && { customerSubtitle }),
      },
    });

    res.json({
      enabled: setting.enabled,
      genderCollectEnabled: setting.genderCollectEnabled,
      customerTitle: setting.customerTitle,
      customerSubtitle: setting.customerSubtitle,
      tables: (setting.tables as unknown as TableEntry[]) || [],
    });
  } catch (error) {
    console.error('Admin update table link settings error:', error);
    res.status(500).json({ error: '테이블 링크 설정 수정 중 오류가 발생했습니다.' });
  }
});

// POST /api/admin/table-link-settings/:storeId/bulk-add
router.post('/table-link-settings/:storeId/bulk-add', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { storeId } = req.params;
    const { startNumber, endNumber, urlTemplate } = req.body;

    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

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
          url: normalizeUrl(urlTemplate.replace(/\{number\}/g, num)),
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
    console.error('Admin bulk add tables error:', error);
    res.status(500).json({ error: '일괄 추가 중 오류가 발생했습니다.' });
  }
});

export default router;
