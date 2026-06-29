import { Router, Response } from 'express';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma.js';
import { generateSlug, getUniqueSlug } from './auth.js';
import { AdminRequest, adminAuthMiddleware } from './admin-shared.js';
import { foodCourtUpload } from './admin-uploads.js';

const router = Router();

interface BoothTable {
  tableNumber: string;
  url: string;
}

interface Booth {
  id: string;
  nameKo: string;
  nameEn?: string;
  categoryKo?: string;
  categoryEn?: string;
  imageUrl?: string;
  order: number;
  tables: BoothTable[];
}

const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || 'https://taghere-crm-web-g96p.onrender.com';

const MAX_BOOTHS = 50;
const MAX_TABLES_PER_BOOTH = 200;

// GET /api/admin/food-court-settings/:storeId
router.get('/food-court-settings/:storeId', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
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

    let setting = await prisma.foodCourtSetting.findUnique({
      where: { storeId },
    });

    if (!setting) {
      setting = await prisma.foodCourtSetting.create({
        data: {
          storeId,
          enabled: false,
          stores: [],
        },
      });
    }

    res.json({
      enabled: setting.enabled,
      customerTitle: setting.customerTitle,
      customerSubtitle: setting.customerSubtitle,
      noticeText: setting.noticeText,
      noticeLogoUrl: setting.noticeLogoUrl,
      stores: (setting.stores as unknown as Booth[]) || [],
      customerPageBaseUrl: `${PUBLIC_APP_URL}/taghere-food-court/${storeSlug}`,
      storeName: store.name,
      storeSlug,
    });
  } catch (error) {
    console.error('Admin get food court settings error:', error);
    res.status(500).json({ error: '푸드코트 설정 조회 중 오류가 발생했습니다.' });
  }
});

// PUT /api/admin/food-court-settings/:storeId
router.put('/food-court-settings/:storeId', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { storeId } = req.params;
    const { enabled, stores, customerTitle, customerSubtitle, noticeText, noticeLogoUrl } = req.body;

    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    let normalizedStores: Booth[] | undefined;

    if (stores !== undefined) {
      if (!Array.isArray(stores)) {
        return res.status(400).json({ error: '매장 목록 형식이 올바르지 않습니다.' });
      }
      if (stores.length > MAX_BOOTHS) {
        return res.status(400).json({ error: `매장은 최대 ${MAX_BOOTHS}개까지 등록할 수 있습니다.` });
      }

      normalizedStores = [];
      for (let i = 0; i < stores.length; i++) {
        const booth = stores[i] as Booth;

        if (!booth.nameKo || !booth.nameKo.trim()) {
          return res.status(400).json({ error: '매장 이름(한글)은 필수입니다.' });
        }

        const tables = Array.isArray(booth.tables) ? booth.tables : [];
        if (tables.length > MAX_TABLES_PER_BOOTH) {
          return res.status(400).json({ error: `매장당 테이블은 최대 ${MAX_TABLES_PER_BOOTH}개까지 등록할 수 있습니다.` });
        }

        const numbers = tables.map((t) => t.tableNumber);
        if (new Set(numbers).size !== numbers.length) {
          return res.status(400).json({ error: `'${booth.nameKo}' 매장에 중복된 테이블 번호가 있습니다.` });
        }

        for (const t of tables) {
          if (!t.tableNumber || !t.url) {
            return res.status(400).json({ error: `'${booth.nameKo}' 매장의 테이블 번호와 URL은 필수입니다.` });
          }
          try {
            new URL(t.url);
          } catch {
            return res.status(400).json({ error: `잘못된 URL 형식입니다: ${t.url}` });
          }
        }

        normalizedStores.push({
          id: booth.id || randomUUID(),
          nameKo: booth.nameKo.trim(),
          nameEn: booth.nameEn?.trim() || undefined,
          categoryKo: booth.categoryKo?.trim() || undefined,
          categoryEn: booth.categoryEn?.trim() || undefined,
          imageUrl: booth.imageUrl || undefined,
          order: typeof booth.order === 'number' ? booth.order : i,
          tables: tables.map((t) => ({ tableNumber: String(t.tableNumber), url: t.url })),
        });
      }
    }

    const setting = await prisma.foodCourtSetting.upsert({
      where: { storeId },
      create: {
        storeId,
        enabled: enabled ?? false,
        stores: (normalizedStores ?? []) as any,
        customerTitle: customerTitle ?? null,
        customerSubtitle: customerSubtitle ?? null,
        noticeText: noticeText ?? null,
        noticeLogoUrl: noticeLogoUrl ?? null,
      },
      update: {
        ...(enabled !== undefined && { enabled }),
        ...(normalizedStores !== undefined && { stores: normalizedStores as any }),
        ...(customerTitle !== undefined && { customerTitle }),
        ...(customerSubtitle !== undefined && { customerSubtitle }),
        ...(noticeText !== undefined && { noticeText }),
        ...(noticeLogoUrl !== undefined && { noticeLogoUrl }),
      },
    });

    res.json({
      enabled: setting.enabled,
      customerTitle: setting.customerTitle,
      customerSubtitle: setting.customerSubtitle,
      noticeText: setting.noticeText,
      noticeLogoUrl: setting.noticeLogoUrl,
      stores: (setting.stores as unknown as Booth[]) || [],
    });
  } catch (error) {
    console.error('Admin update food court settings error:', error);
    res.status(500).json({ error: '푸드코트 설정 수정 중 오류가 발생했습니다.' });
  }
});

// POST /api/admin/food-court-settings/:storeId/stores/:boothId/bulk-add
// 특정 부스에 테이블 링크를 범위로 일괄 추가 ({number} → 테이블 번호 치환)
router.post('/food-court-settings/:storeId/stores/:boothId/bulk-add', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { storeId, boothId } = req.params;
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

    if (isNaN(start) || isNaN(end) || start < 1 || end > MAX_TABLES_PER_BOOTH || start > end) {
      return res.status(400).json({ error: `유효한 범위를 입력해주세요. (1~${MAX_TABLES_PER_BOOTH})` });
    }

    const setting = await prisma.foodCourtSetting.findUnique({ where: { storeId } });
    if (!setting) {
      return res.status(404).json({ error: '푸드코트 설정을 찾을 수 없습니다. 먼저 저장해주세요.' });
    }

    const boothList = (setting.stores as unknown as Booth[]) || [];
    const booth = boothList.find((b) => b.id === boothId);
    if (!booth) {
      return res.status(404).json({ error: '매장(부스)을 찾을 수 없습니다. 먼저 저장해주세요.' });
    }

    const existingTables = Array.isArray(booth.tables) ? booth.tables : [];
    const existingNumbers = new Set(existingTables.map((t) => t.tableNumber));

    const newTables: BoothTable[] = [];
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
    if (mergedTables.length > MAX_TABLES_PER_BOOTH) {
      return res.status(400).json({ error: `매장당 테이블은 최대 ${MAX_TABLES_PER_BOOTH}개까지 등록할 수 있습니다.` });
    }

    booth.tables = mergedTables;

    await prisma.foodCourtSetting.update({
      where: { storeId },
      data: { stores: boothList as any },
    });

    res.json({
      stores: boothList,
      addedCount: newTables.length,
      skippedCount: (end - start + 1) - newTables.length,
    });
  } catch (error) {
    console.error('Admin food court bulk add error:', error);
    res.status(500).json({ error: '일괄 추가 중 오류가 발생했습니다.' });
  }
});

// POST /api/admin/food-court-settings/upload - 부스/로고 이미지 업로드
router.post('/food-court-settings/upload', adminAuthMiddleware, foodCourtUpload.single('image'), async (req: AdminRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '이미지 파일이 필요합니다.' });
    }
    const imageUrl = `/uploads/food-court/${req.file.filename}`;
    res.json({ imageUrl });
  } catch (error) {
    console.error('Food court image upload error:', error);
    res.status(500).json({ error: '이미지 업로드 중 오류가 발생했습니다.' });
  }
});

export default router;
