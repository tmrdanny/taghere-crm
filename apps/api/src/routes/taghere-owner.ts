// 태그히어 허브(에이전트) 용 — 사장님 CRM 요약 + 로그인 없이 CRM 을 여는 링크
// 허브가 웹훅 토큰(TAGHERE_WEBHOOK_TOKEN / TAGHERE_V2_WEBHOOK_TOKEN)으로 호출한다.
//  - GET  /api/taghere/owner/summary?v2StoreId=SR...   숫자 요약 (카드 1장 그리기용)
//  - POST /api/taghere/owner/link  { v2StoreId }        사장님이 카드를 눌렀을 때 열 링크 (14일, 열면 12시간 로그인)
import { Router, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { webhookAuthMiddleware, WebhookRequest } from '../middleware/webhook-auth.js';
import { buildOwnerReport } from '../services/owner-notice/report.js';
import { reportHeadline } from '../services/owner-notice/worker.js';
import { createOwnerLink } from '../services/owner-notice/links.js';

const router = Router();

async function storeOf(req: WebhookRequest) {
  const v2StoreId = String(req.query.v2StoreId ?? req.body?.v2StoreId ?? '');
  if (!v2StoreId) return null;
  return prisma.store.findUnique({ where: { v2StoreId }, select: { id: true, crmEnabled: true } });
}

router.get('/summary', webhookAuthMiddleware, async (req: WebhookRequest, res: Response) => {
  try {
    const store = await storeOf(req);
    if (!store) return res.status(404).json({ success: false, error: 'store_not_found' });
    const r = await buildOwnerReport(store.id);
    if (!r) return res.status(404).json({ success: false, error: 'store_not_found' });
    res.json({
      success: true,
      data: {
        crmEnabled: store.crmEnabled,
        storeName: r.store.name,
        headline: reportHeadline(r),
        lastWeek: { visitors: r.thisWeek.visitors, returning: r.thisWeek.returning, newCustomers: r.thisWeek.newCustomers, visitorsChange: r.thisWeek.visitors - r.lastWeek.visitors },
        marketing30d: { recipients: r.marketing.recipients, revisited: r.marketing.revisited, revenue: r.marketing.revenue },
        wallet: { balance: r.wallet.balance, state: r.wallet.state, daysLeft: r.wallet.daysLeft, skipped7d: r.wallet.skipped7d },
        automation: { enabledCount: r.automation.enabledCount },
      },
    });
  } catch (error) {
    console.error('[TaghereOwner] summary error:', error);
    res.status(500).json({ success: false, error: 'internal_error' });
  }
});

router.post('/link', webhookAuthMiddleware, async (req: WebhookRequest, res: Response) => {
  try {
    const store = await storeOf(req);
    if (!store) return res.status(404).json({ success: false, error: 'store_not_found' });
    const { url } = await createOwnerLink({ storeId: store.id, purpose: 'REPORT' });
    res.json({ success: true, data: { url } });
  } catch (error) {
    console.error('[TaghereOwner] link error:', error);
    res.status(500).json({ success: false, error: 'internal_error' });
  }
});

export default router;
