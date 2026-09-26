import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import {
  countSegment,
  listStoreMenus,
  loadStoreSegment,
  sanitizeConditions,
} from '../services/segment-engine.js';

const router = Router();
router.use(authMiddleware);

const MAX_SEGMENTS_PER_STORE = 50;

function sanitizeName(value: unknown): string {
  return String(value ?? '').trim().slice(0, 50);
}

// GET /api/segments - 저장된 세그먼트 목록
router.get('/', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const segments = await prisma.customerSegment.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ segments: segments.map((s) => ({ ...s, conditions: sanitizeConditions(s.conditions) })) });
  } catch (error) {
    console.error('[Segments] list error:', error);
    res.status(500).json({ error: '세그먼트 목록을 불러오지 못했습니다.' });
  }
});

// POST /api/segments/preview - 조건에 맞는 고객 수 (전체 / 발송 가능)
router.post('/preview', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const conditions = sanitizeConditions(req.body?.conditions);
    const counts = await countSegment(storeId, conditions);
    res.json({ ...counts, conditions });
  } catch (error) {
    console.error('[Segments] preview error:', error);
    res.status(500).json({ error: '대상 고객 수를 계산하지 못했습니다.' });
  }
});

// GET /api/segments/menus?days=180 - 매장에서 주문된 메뉴 목록 (메뉴 조건 선택용)
router.get('/menus', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const days = Math.min(3650, Math.max(1, parseInt(String(req.query.days ?? '365'), 10) || 365));
    const menus = await listStoreMenus(storeId, days);
    res.json({ menus, days });
  } catch (error) {
    console.error('[Segments] menus error:', error);
    res.status(500).json({ error: '메뉴 목록을 불러오지 못했습니다.' });
  }
});

// GET /api/segments/:id - 단건 + 현재 대상 수
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const segment = await loadStoreSegment(storeId, req.params.id);
    if (!segment) return res.status(404).json({ error: '세그먼트를 찾을 수 없습니다.' });
    const counts = await countSegment(storeId, segment.conditions);
    res.json({ segment, ...counts });
  } catch (error) {
    console.error('[Segments] get error:', error);
    res.status(500).json({ error: '세그먼트를 불러오지 못했습니다.' });
  }
});

// POST /api/segments - 저장
router.post('/', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const name = sanitizeName(req.body?.name);
    if (!name) return res.status(400).json({ error: '세그먼트 이름을 입력해주세요.' });

    const conditions = sanitizeConditions(req.body?.conditions);
    if (Object.keys(conditions).length === 0) {
      return res.status(400).json({ error: '조건을 하나 이상 설정해주세요.' });
    }

    const count = await prisma.customerSegment.count({ where: { storeId } });
    if (count >= MAX_SEGMENTS_PER_STORE) {
      return res.status(400).json({ error: `세그먼트는 최대 ${MAX_SEGMENTS_PER_STORE}개까지 저장할 수 있습니다.` });
    }

    const segment = await prisma.customerSegment.create({
      data: { storeId, name, conditions: conditions as Prisma.InputJsonValue },
    });
    res.status(201).json({ segment });
  } catch (error) {
    console.error('[Segments] create error:', error);
    res.status(500).json({ error: '세그먼트를 저장하지 못했습니다.' });
  }
});

// PUT /api/segments/:id - 수정
router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const existing = await prisma.customerSegment.findFirst({ where: { id: req.params.id, storeId } });
    if (!existing) return res.status(404).json({ error: '세그먼트를 찾을 수 없습니다.' });

    const data: Prisma.CustomerSegmentUpdateInput = {};
    if (req.body?.name !== undefined) {
      const name = sanitizeName(req.body.name);
      if (!name) return res.status(400).json({ error: '세그먼트 이름을 입력해주세요.' });
      data.name = name;
    }
    if (req.body?.conditions !== undefined) {
      const conditions = sanitizeConditions(req.body.conditions);
      if (Object.keys(conditions).length === 0) {
        return res.status(400).json({ error: '조건을 하나 이상 설정해주세요.' });
      }
      data.conditions = conditions as Prisma.InputJsonValue;
    }

    const segment = await prisma.customerSegment.update({ where: { id: existing.id }, data });
    res.json({ segment });
  } catch (error) {
    console.error('[Segments] update error:', error);
    res.status(500).json({ error: '세그먼트를 수정하지 못했습니다.' });
  }
});

// DELETE /api/segments/:id
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const deleted = await prisma.customerSegment.deleteMany({ where: { id: req.params.id, storeId } });
    if (deleted.count === 0) return res.status(404).json({ error: '세그먼트를 찾을 수 없습니다.' });
    res.json({ success: true });
  } catch (error) {
    console.error('[Segments] delete error:', error);
    res.status(500).json({ error: '세그먼트를 삭제하지 못했습니다.' });
  }
});

export default router;
