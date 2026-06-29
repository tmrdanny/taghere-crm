/**
 * 내부 admin 인사이트 대시보드 API (BigQuery 기반, 읽기 전용).
 * 전부 adminAuthMiddleware로 보호. 기간(from/to: YYYYMMDD) 미지정 시 최근 14일.
 */

import { Router, Response } from 'express';
import { AdminRequest, adminAuthMiddleware } from './admin-shared.js';
import {
  getFunnel,
  getFeatureUsage,
  getDailyTrend,
  getStoreConversion,
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
    const rows = await getStoreConversion(from, to);
    res.json({ from, to, rows });
  } catch (error) {
    console.error('[insights/stores]', error);
    res.status(500).json({ error: '매장별 데이터 조회에 실패했습니다.' });
  }
});

export default router;
