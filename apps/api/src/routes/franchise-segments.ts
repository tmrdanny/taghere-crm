import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { franchiseAuthMiddleware, FranchiseAuthRequest } from '../middleware/franchise-auth.js';
import {
  countSegmentInStores,
  hasFilterConditions,
  listMenusInStores,
  loadFranchiseSegment,
  sanitizeConditions,
  summarizeSegment,
} from '../services/segment-engine.js';
import { mountSegmentTools } from './segment-tools.js';

/**
 * 프랜차이즈 고객 그룹 — 전 가맹점 고객을 조건으로 묶어 저장하고 리타겟 발송 대상으로 쓴다.
 * 조건 평가는 사장님 고객 그룹(/api/segments)과 같은 엔진을 쓰고, 범위만 소속 매장 전체로 넓힌다.
 */
const router = Router();
router.use(franchiseAuthMiddleware);

const MAX_SEGMENTS_PER_FRANCHISE = 50;

function sanitizeName(value: unknown): string {
  return String(value ?? '').trim().slice(0, 50);
}

async function franchiseStoreIds(franchiseId: string): Promise<string[]> {
  const stores = await prisma.store.findMany({ where: { franchiseId }, select: { id: true } });
  return stores.map((s) => s.id);
}

mountSegmentTools(router, (req) => franchiseStoreIds((req as FranchiseAuthRequest).franchiseUser!.franchiseId));

// GET /api/franchise/segments - 저장된 고객 그룹 목록
router.get('/', async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const segments = await prisma.franchiseSegment.findMany({
      where: { franchiseId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ segments: segments.map((s) => ({ ...s, conditions: sanitizeConditions(s.conditions) })) });
  } catch (error) {
    console.error('[FranchiseSegments] list error:', error);
    res.status(500).json({ error: '고객 그룹 목록을 불러오지 못했습니다.' });
  }
});

// POST /api/franchise/segments/preview - 조건에 맞는 고객 수 (전 가맹점 합산)
router.post('/preview', async (req: FranchiseAuthRequest, res) => {
  try {
    const storeIds = await franchiseStoreIds(req.franchiseUser!.franchiseId);
    const conditions = sanitizeConditions(req.body?.conditions);
    const summary = await summarizeSegment(storeIds, conditions);
    res.json({ ...summary, conditions });
  } catch (error) {
    console.error('[FranchiseSegments] preview error:', error);
    res.status(500).json({ error: '대상 고객 수를 계산하지 못했습니다.' });
  }
});

// GET /api/franchise/segments/menus?days=365 - 전 가맹점 주문 메뉴 목록
router.get('/menus', async (req: FranchiseAuthRequest, res) => {
  try {
    const storeIds = await franchiseStoreIds(req.franchiseUser!.franchiseId);
    const days = Math.min(3650, Math.max(1, parseInt(String(req.query.days ?? '365'), 10) || 365));
    const menus = await listMenusInStores(storeIds, days);
    res.json({ menus, days });
  } catch (error) {
    console.error('[FranchiseSegments] menus error:', error);
    res.status(500).json({ error: '메뉴 목록을 불러오지 못했습니다.' });
  }
});

// GET /api/franchise/segments/:id - 단건 + 현재 대상 수
router.get('/:id', async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const segment = await loadFranchiseSegment(franchiseId, req.params.id);
    if (!segment) return res.status(404).json({ error: '고객 그룹을 찾을 수 없습니다.' });
    const counts = await countSegmentInStores(await franchiseStoreIds(franchiseId), segment.conditions);
    res.json({ segment, ...counts });
  } catch (error) {
    console.error('[FranchiseSegments] get error:', error);
    res.status(500).json({ error: '고객 그룹을 불러오지 못했습니다.' });
  }
});

// POST /api/franchise/segments - 저장
router.post('/', async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const name = sanitizeName(req.body?.name);
    if (!name) return res.status(400).json({ error: '고객 그룹 이름을 입력해주세요.' });

    const conditions = sanitizeConditions(req.body?.conditions);
    if (!hasFilterConditions(conditions) && !conditions.includeIds?.length) {
      return res.status(400).json({ error: '조건을 고르거나 손님을 직접 골라 주세요.' });
    }

    const count = await prisma.franchiseSegment.count({ where: { franchiseId } });
    if (count >= MAX_SEGMENTS_PER_FRANCHISE) {
      return res.status(400).json({ error: `고객 그룹은 최대 ${MAX_SEGMENTS_PER_FRANCHISE}개까지 저장할 수 있습니다.` });
    }

    const segment = await prisma.franchiseSegment.create({
      data: { franchiseId, name, conditions: conditions as Prisma.InputJsonValue },
    });
    res.status(201).json({ segment });
  } catch (error) {
    console.error('[FranchiseSegments] create error:', error);
    res.status(500).json({ error: '고객 그룹을 저장하지 못했습니다.' });
  }
});

// PUT /api/franchise/segments/:id - 수정
router.put('/:id', async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const existing = await prisma.franchiseSegment.findFirst({ where: { id: req.params.id, franchiseId } });
    if (!existing) return res.status(404).json({ error: '고객 그룹을 찾을 수 없습니다.' });

    const data: Prisma.FranchiseSegmentUpdateInput = {};
    if (req.body?.name !== undefined) {
      const name = sanitizeName(req.body.name);
      if (!name) return res.status(400).json({ error: '고객 그룹 이름을 입력해주세요.' });
      data.name = name;
    }
    if (req.body?.conditions !== undefined) {
      const conditions = sanitizeConditions(req.body.conditions);
      if (!hasFilterConditions(conditions) && !conditions.includeIds?.length) {
        return res.status(400).json({ error: '조건을 고르거나 손님을 직접 골라 주세요.' });
      }
      data.conditions = conditions as Prisma.InputJsonValue;
    }

    const segment = await prisma.franchiseSegment.update({ where: { id: existing.id }, data });
    res.json({ segment });
  } catch (error) {
    console.error('[FranchiseSegments] update error:', error);
    res.status(500).json({ error: '고객 그룹을 수정하지 못했습니다.' });
  }
});

// DELETE /api/franchise/segments/:id
router.delete('/:id', async (req: FranchiseAuthRequest, res) => {
  try {
    const franchiseId = req.franchiseUser!.franchiseId;
    const deleted = await prisma.franchiseSegment.deleteMany({ where: { id: req.params.id, franchiseId } });
    if (deleted.count === 0) return res.status(404).json({ error: '고객 그룹을 찾을 수 없습니다.' });
    res.json({ success: true });
  } catch (error) {
    console.error('[FranchiseSegments] delete error:', error);
    res.status(500).json({ error: '고객 그룹을 삭제하지 못했습니다.' });
  }
});

export default router;
