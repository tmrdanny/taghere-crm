/**
 * 내부 admin 인사이트 대시보드 API (BigQuery 기반, 읽기 전용).
 * 전부 adminAuthMiddleware로 보호. 기간(from/to: YYYYMMDD) 미지정 시 최근 14일.
 */

import { Router, Response } from 'express';
import { AdminRequest, adminAuthMiddleware } from './admin-shared.js';
import { prisma } from '../lib/prisma.js';
import {
  getFunnel,
  getFeatureUsage,
  getDailyTrend,
  getStoreConversion,
  getRetention,
  getDropoff,
  getHeatmap,
  getStoreDetail,
  getOwnerUsage,
  getOwnerActiveStores,
  getCouponEffect,
  getSegmentConversion,
  getRatingDistribution,
  getNewCustomers,
} from '../services/bigquery.js';

const router = Router();

const fmt = (d: Date) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

/** from/to를 YYYYMMDD로 검증·정규화(미지정/형식오류 시 최근 14일). */
function parseRange(req: AdminRequest): { from: string; to: string } {
  const now = new Date();
  const defTo = fmt(now);
  const defFrom = fmt(new Date(now.getTime() - 13 * 86400000));
  const q = req.query;
  const from = /^\d{8}$/.test(String(q.from)) ? String(q.from) : defFrom;
  const to = /^\d{8}$/.test(String(q.to)) ? String(q.to) : defTo;
  return { from, to };
}

// GET /api/admin/insights/funnel?from&to&flow_type
router.get('/funnel', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { from, to } = parseRange(req);
    const ft = String(req.query.flow_type || '');
    const flowType = ['points', 'membership', 'stamp'].includes(ft) ? ft : undefined;
    const data = await getFunnel(from, to, flowType);
    res.json({ from, to, flowType: flowType ?? null, ...data });
  } catch (error) {
    console.error('[insights/funnel]', error);
    res.status(500).json({ error: '퍼널 데이터 조회에 실패했습니다.' });
  }
});

// GET /api/admin/insights/feature-usage?from&to
router.get('/feature-usage', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { from, to } = parseRange(req);
    const data = await getFeatureUsage(from, to);
    res.json({ from, to, ...data });
  } catch (error) {
    console.error('[insights/feature-usage]', error);
    res.status(500).json({ error: '기능 사용 데이터 조회에 실패했습니다.' });
  }
});

// GET /api/admin/insights/daily?from&to
router.get('/daily', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { from, to } = parseRange(req);
    const rows = await getDailyTrend(from, to);
    res.json({ from, to, rows });
  } catch (error) {
    console.error('[insights/daily]', error);
    res.status(500).json({ error: '일별 추이 조회에 실패했습니다.' });
  }
});

// GET /api/admin/insights/stores?from&to
router.get('/stores', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { from, to } = parseRange(req);
    const rows = (await getStoreConversion(from, to)) as Array<{ store_slug: string; starts: number; success: number }>;
    // BigQuery엔 slug만 있어 CRM DB에서 매장명을 조인
    const slugs = rows.map((r) => r.store_slug).filter(Boolean);
    const stores = slugs.length
      ? await prisma.store.findMany({ where: { slug: { in: slugs } }, select: { slug: true, name: true } })
      : [];
    const nameBySlug = new Map(stores.map((s) => [s.slug, s.name]));
    const enriched = rows.map((r) => ({ ...r, store_name: nameBySlug.get(r.store_slug) ?? null }));
    res.json({ from, to, rows: enriched });
  } catch (error) {
    console.error('[insights/stores]', error);
    res.status(500).json({ error: '매장별 데이터 조회에 실패했습니다.' });
  }
});

// GET /api/admin/insights/retention?from&to
router.get('/retention', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { from, to } = parseRange(req);
    res.json({ from, to, ...(await getRetention(from, to)) });
  } catch (error) {
    console.error('[insights/retention]', error);
    res.status(500).json({ error: '리텐션 데이터 조회에 실패했습니다.' });
  }
});

// GET /api/admin/insights/dropoff?from&to
router.get('/dropoff', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { from, to } = parseRange(req);
    res.json({ from, to, ...(await getDropoff(from, to)) });
  } catch (error) {
    console.error('[insights/dropoff]', error);
    res.status(500).json({ error: '이탈 데이터 조회에 실패했습니다.' });
  }
});

// GET /api/admin/insights/heatmap?from&to
router.get('/heatmap', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { from, to } = parseRange(req);
    const rows = await getHeatmap(from, to);
    res.json({ from, to, rows });
  } catch (error) {
    console.error('[insights/heatmap]', error);
    res.status(500).json({ error: '히트맵 데이터 조회에 실패했습니다.' });
  }
});

// GET /api/admin/insights/store-detail?from&to&slug
router.get('/store-detail', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const slug = String(req.query.slug || '');
    if (!slug) return res.status(400).json({ error: 'slug가 필요합니다.' });
    const { from, to } = parseRange(req);
    const data = await getStoreDetail(from, to, slug);
    res.json({ from, to, slug, ...data });
  } catch (error) {
    console.error('[insights/store-detail]', error);
    res.status(500).json({ error: '매장 상세 조회에 실패했습니다.' });
  }
});

// GET /api/admin/insights/owner-usage?from&to  (+ 채택률 분모용 totalStores)
router.get('/owner-usage', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { from, to } = parseRange(req);
    const [usage, totalStores] = await Promise.all([getOwnerUsage(from, to), prisma.store.count()]);
    res.json({ from, to, usage, totalStores });
  } catch (error) {
    console.error('[insights/owner-usage]', error);
    res.status(500).json({ error: '사장님 기능 사용량 조회에 실패했습니다.' });
  }
});

// GET /api/admin/insights/owner-stores?from&to  (user_id→매장 매핑·합산 top)
router.get('/owner-stores', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { from, to } = parseRange(req);
    const rows = await getOwnerActiveStores(from, to);
    const userIds = rows.map((r) => r.user_id).filter(Boolean);
    const staff = userIds.length
      ? await prisma.staffUser.findMany({ where: { id: { in: userIds } }, select: { id: true, store: { select: { id: true, name: true } } } })
      : [];
    const storeByUser = new Map(staff.map((s) => [s.id, s.store]));
    const agg = new Map<string, { name: string; cnt: number }>();
    for (const r of rows) {
      const st = storeByUser.get(r.user_id);
      if (!st) continue;
      const cur = agg.get(st.id) ?? { name: st.name, cnt: 0 };
      cur.cnt += Number(r.cnt);
      agg.set(st.id, cur);
    }
    const top = [...agg.values()].sort((a, b) => b.cnt - a.cnt).slice(0, 15);
    res.json({ from, to, rows: top });
  } catch (error) {
    console.error('[insights/owner-stores]', error);
    res.status(500).json({ error: '활발한 매장 조회에 실패했습니다.' });
  }
});

// GET /api/admin/insights/coupon-effect?from&to
router.get('/coupon-effect', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { from, to } = parseRange(req);
    res.json({ from, to, ...(await getCouponEffect(from, to)) });
  } catch (error) {
    console.error('[insights/coupon-effect]', error);
    res.status(500).json({ error: '쿠폰 효과 조회에 실패했습니다.' });
  }
});

// GET /api/admin/insights/segments?from&to
router.get('/segments', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { from, to } = parseRange(req);
    res.json({ from, to, ...(await getSegmentConversion(from, to)) });
  } catch (error) {
    console.error('[insights/segments]', error);
    res.status(500).json({ error: '세그먼트 전환 조회에 실패했습니다.' });
  }
});

// GET /api/admin/insights/ratings?from&to
router.get('/ratings', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { from, to } = parseRange(req);
    const rows = await getRatingDistribution(from, to);
    res.json({ from, to, rows });
  } catch (error) {
    console.error('[insights/ratings]', error);
    res.status(500).json({ error: '별점 분포 조회에 실패했습니다.' });
  }
});

// GET /api/admin/insights/new-customers?from&to
router.get('/new-customers', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { from, to } = parseRange(req);
    const rows = await getNewCustomers(from, to);
    res.json({ from, to, rows });
  } catch (error) {
    console.error('[insights/new-customers]', error);
    res.status(500).json({ error: '신규 고객 조회에 실패했습니다.' });
  }
});

export default router;
