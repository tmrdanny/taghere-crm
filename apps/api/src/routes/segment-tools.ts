import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { listSegmentMembers, listVisitSources, sanitizeConditions } from '../services/segment-engine.js';

/**
 * 고객 그룹 만들기 화면 공용 API — 사장님(/api/segments)·프랜차이즈(/api/franchise/segments)가 범위만 달리해 함께 쓴다.
 *  - POST /members        조건에 맞는 손님 명단 (mode=group) 또는 직접 추가할 손님 검색 (mode=search)
 *  - GET  /visit-sources  방문 경로 선택지 (라벨 + 손님 수)
 * '/:id' 라우트보다 먼저 붙여야 한다.
 */
const DEFAULT_VISIT_SOURCE_LABELS: Record<string, string> = {
  revisit: '단순 재방문',
  friend: '지인 추천',
  naver: '네이버',
  youtube: '유튜브',
  daangn: '당근',
  instagram: '인스타그램',
  sms: '문자',
  kakao: '카카오톡',
  passby: '지나가다 방문',
};

const maskPhone = (phone: string | null) => {
  if (!phone) return null;
  const d = phone.replace(/\D/g, '');
  if (d.length < 8) return phone;
  return `${d.slice(0, 3)}-****-${d.slice(-4)}`;
};

export function mountSegmentTools(router: Router, storeIdsOf: (req: Request) => Promise<string[]>) {
  router.post('/members', async (req: Request, res: Response) => {
    try {
      const storeIds = await storeIdsOf(req);
      const conditions = sanitizeConditions(req.body?.conditions);
      const mode = req.body?.mode === 'search' ? 'search' : 'group';
      const { rows, hasMore } = await listSegmentMembers(storeIds, conditions, {
        mode,
        q: typeof req.body?.q === 'string' ? req.body.q.slice(0, 50) : undefined,
        offset: Number(req.body?.offset) || 0,
        limit: Number(req.body?.limit) || 50,
      });
      res.json({ rows: rows.map((r) => ({ ...r, phone: maskPhone(r.phone) })), hasMore, multiStore: storeIds.length > 1 });
    } catch (error) {
      console.error('[Segments] members error:', error);
      res.status(500).json({ error: '고객 명단을 불러오지 못했습니다.' });
    }
  });

  router.get('/visit-sources', async (req: Request, res: Response) => {
    try {
      const storeIds = await storeIdsOf(req);
      const [values, settings] = await Promise.all([
        listVisitSources(storeIds),
        prisma.visitSourceSetting.findMany({ where: { storeId: { in: storeIds } }, select: { options: true } }),
      ]);
      const labels: Record<string, string> = { ...DEFAULT_VISIT_SOURCE_LABELS };
      for (const s of settings) {
        for (const o of (Array.isArray(s.options) ? s.options : []) as Array<{ id?: string; label?: string }>) {
          if (o?.id && o.label) labels[o.id] = o.label;
        }
      }
      res.json({ sources: values.map((v) => ({ ...v, label: labels[v.value] ?? v.value })) });
    } catch (error) {
      console.error('[Segments] visit-sources error:', error);
      res.status(500).json({ error: '방문 경로를 불러오지 못했습니다.' });
    }
  });
}
