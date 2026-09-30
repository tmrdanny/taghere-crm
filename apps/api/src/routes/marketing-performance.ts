import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { franchiseAuthMiddleware, FranchiseAuthRequest } from '../middleware/franchise-auth.js';
import { computeMarketingPerformance } from '../services/marketing/performance.js';
import { buildRecommendations, loadCoachContext } from '../services/marketing/coach.js';
import { cancelReservation, isCancelError, listReservations } from '../services/marketing/reservations.js';
import { listBoosterPerformance } from '../services/marketing/booster.js';

/**
 * 마케팅 성과 — 캠페인별 쿠폰 사용(직원 확인)·재방문·매출·ROI + 다음 캠페인 추천.
 *  - GET /api/marketing-performance?days=90            사장님
 *  - GET /api/franchise/marketing-performance?days=90  프랜차이즈 (전 가맹점)
 *  - GET …/place-booster                               플레이스 부스터 캠페인 성과 (기간 무관)
 */
const parseDays = (v: unknown) => {
  const d = parseInt(String(v ?? '90'), 10);
  return [30, 90, 180, 365].includes(d) ? d : 90;
};

async function respond(res: Response, storeIds: string[], scope: { storeId?: string; franchiseId?: string }, days: number, base: string, automationHref: string) {
  const [perf, ctx] = await Promise.all([computeMarketingPerformance({ storeIds, scope, days }), loadCoachContext(storeIds)]);
  res.json({ ...perf, context: ctx, recommendations: buildRecommendations(perf, ctx, { base, automationHref }) });
}

export const ownerRouter = Router();
ownerRouter.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    await respond(res, [storeId], { storeId }, parseDays(req.query.days), '/messages', '/automation');
  } catch (e) {
    console.error('[MarketingPerformance] owner error:', e);
    res.status(500).json({ error: '마케팅 성과를 불러오지 못했습니다.' });
  }
});

export const franchiseRouter = Router();
franchiseRouter.get('/', franchiseAuthMiddleware, async (req: Request, res) => {
  try {
    const franchiseId = (req as FranchiseAuthRequest).franchiseUser!.franchiseId;
    const stores = await prisma.store.findMany({ where: { franchiseId }, select: { id: true } });
    await respond(res, stores.map((s) => s.id), { franchiseId }, parseDays(req.query.days), '/franchise/campaigns/retarget', '/franchise/campaigns/automation');
  } catch (e) {
    console.error('[MarketingPerformance] franchise error:', e);
    res.status(500).json({ error: '마케팅 성과를 불러오지 못했습니다.' });
  }
});

// ---------- 예약 발송 목록 · 취소 ----------
//  - GET  /api/marketing-performance/reservations            (사장님)
//  - POST /api/marketing-performance/reservations/:id/cancel
//  - 프랜차이즈는 /api/franchise/marketing-performance/... 같은 경로
function reservationRoutes(router: Router, auth: any, scopeOf: (req: Request) => { storeId?: string; franchiseId?: string }) {
  router.get('/reservations', auth, async (req: Request, res: Response) => {
    try {
      res.json({ reservations: await listReservations(scopeOf(req)) });
    } catch (e) {
      console.error('[Reservations] list error:', e);
      res.status(500).json({ error: '예약 목록을 불러오지 못했습니다.' });
    }
  });
  router.post('/reservations/:id/cancel', auth, async (req: Request, res: Response) => {
    try {
      const r = await cancelReservation(scopeOf(req), req.params.id);
      res.json({
        success: true,
        ...r,
        message: `예약을 취소했어요.${r.refunded > 0 ? ` ${r.refunded.toLocaleString()}원을 돌려드렸어요.` : ''}`,
      });
    } catch (e: any) {
      if (isCancelError(e)) return res.status(400).json({ error: e.message });
      console.error('[Reservations] cancel error:', e);
      res.status(500).json({ error: '예약을 취소하지 못했습니다.' });
    }
  });
}
reservationRoutes(ownerRouter, authMiddleware, (req) => ({ storeId: (req as AuthRequest).user!.storeId }));
reservationRoutes(franchiseRouter, franchiseAuthMiddleware, (req) => ({ franchiseId: (req as FranchiseAuthRequest).franchiseUser!.franchiseId }));

// ---------- 플레이스 부스터 성과 ----------
ownerRouter.get('/place-booster', authMiddleware, async (req: AuthRequest, res) => {
  try {
    res.json({ campaigns: await listBoosterPerformance([req.user!.storeId]) });
  } catch (e) {
    console.error('[MarketingPerformance] booster error:', e);
    res.status(500).json({ error: '플레이스 부스터 성과를 불러오지 못했습니다.' });
  }
});
franchiseRouter.get('/place-booster', franchiseAuthMiddleware, async (req: Request, res) => {
  try {
    const franchiseId = (req as FranchiseAuthRequest).franchiseUser!.franchiseId;
    const stores = await prisma.store.findMany({ where: { franchiseId }, select: { id: true } });
    res.json({ campaigns: await listBoosterPerformance(stores.map((s) => s.id)) });
  } catch (e) {
    console.error('[MarketingPerformance] franchise booster error:', e);
    res.status(500).json({ error: '플레이스 부스터 성과를 불러오지 못했습니다.' });
  }
});
