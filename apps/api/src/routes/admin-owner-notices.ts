// 어드민 — 사장님 안내 (충전금 부족 · 주간 리포트)
//  - GET  /api/admin/owner-notices/preview  지금 보내면 누가 받나 (발송하지 않음)
//  - GET  /api/admin/owner-notices/stats    최근 N일 발송 · 링크 열람 · 7일 안 충전 전환
//  - POST /api/admin/owner-notices/test     지정 번호로 시험 발송 (실제 매장 숫자)
import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { adminAuthMiddleware, AdminRequest } from './admin-shared.js';
import {
  findLowBalanceCandidates,
  findWeeklyReportStores,
  mobileOf,
  sendTestNotice,
  NoticeKind,
  OWNER_NOTICE_TEMPLATES,
} from '../services/owner-notice/worker.js';

const router = Router();

router.get('/owner-notices/preview', adminAuthMiddleware, async (_req: AdminRequest, res: Response) => {
  try {
    const [low, weekly] = await Promise.all([findLowBalanceCandidates(), findWeeklyReportStores(new Date(), 2000)]);
    res.json({
      enabled: process.env.OWNER_NOTICE_ENABLED === 'true',
      templates: OWNER_NOTICE_TEMPLATES,
      lowBalance: low.map((c) => ({
        storeId: c.storeId,
        storeName: c.storeName,
        kind: c.kind,
        hasMobile: !!c.phone,
        balance: c.wallet.balance,
        dailySpend: c.wallet.dailySpend,
        daysLeft: c.wallet.daysLeft,
        skipped7d: c.wallet.skipped7d,
      })),
      weekly: { stores: weekly.length, withMobile: weekly.filter((s) => mobileOf(s.phone)).length },
    });
  } catch (error) {
    console.error('[AdminOwnerNotice] preview error:', error);
    res.status(500).json({ error: '미리보기를 불러오지 못했습니다.' });
  }
});

router.get('/owner-notices/stats', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const days = Math.min(180, Math.max(1, parseInt(String(req.query.days ?? '30'), 10) || 30));
    const since = new Date(Date.now() - days * 86400000);
    const byKind = await prisma.$queryRaw<Array<{ kind: string; sent: bigint; opened: bigint; topped: bigint; topup_amount: bigint | null }>>(Prisma.sql`
      SELECT n.kind,
             COUNT(*) AS sent,
             COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM owner_links l WHERE l."noticeId" = n.id AND l."firstOpenedAt" IS NOT NULL)) AS opened,
             COUNT(*) FILTER (WHERE t.amount IS NOT NULL) AS topped,
             COALESCE(SUM(t.amount), 0) AS topup_amount
      FROM owner_notices n
      LEFT JOIN LATERAL (
        SELECT SUM(p.amount) AS amount FROM payment_transactions p
        WHERE p."storeId" = n."storeId" AND p.type = 'TOPUP' AND p.meta->>'source' = 'tosspayments'
          AND p."createdAt" > n."createdAt" AND p."createdAt" <= n."createdAt" + interval '7 days'
        HAVING COUNT(*) > 0
      ) t ON true
      WHERE n.status = 'SENT' AND n."createdAt" >= ${since} AND n."periodKey" NOT LIKE 'test:%'
      GROUP BY n.kind`);
    const skips = await prisma.alimtalkSkipDaily.aggregate({ where: { date: { gte: since.toISOString().slice(0, 10) } }, _sum: { count: true } });
    const skipStores = await prisma.alimtalkSkipDaily.groupBy({ by: ['storeId'], where: { date: { gte: since.toISOString().slice(0, 10) } } });
    const recent = await prisma.ownerNotice.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    const storeNames = new Map(
      (await prisma.store.findMany({ where: { id: { in: recent.map((r) => r.storeId) } }, select: { id: true, name: true } })).map((s) => [s.id, s.name])
    );
    res.json({
      days,
      byKind: byKind.map((k) => ({ kind: k.kind, sent: Number(k.sent), opened: Number(k.opened), toppedUp: Number(k.topped), topupAmount: Number(k.topup_amount ?? 0) })),
      skipped: { messages: skips._sum.count ?? 0, stores: skipStores.length },
      recent: recent.map((r) => ({ id: r.id, storeName: storeNames.get(r.storeId) ?? r.storeId, kind: r.kind, status: r.status, error: r.error, createdAt: r.createdAt, test: r.periodKey.startsWith('test:') })),
    });
  } catch (error) {
    console.error('[AdminOwnerNotice] stats error:', error);
    res.status(500).json({ error: '통계를 불러오지 못했습니다.' });
  }
});

router.post('/owner-notices/test', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { storeId, kind, phone } = req.body ?? {};
    const kinds: NoticeKind[] = ['WEEKLY_REPORT', 'LOW_BALANCE_SOON', 'LOW_BALANCE_EMPTY'];
    if (!storeId || !kinds.includes(kind) || !phone) return res.status(400).json({ error: '매장, 종류, 휴대폰 번호를 입력해 주세요.' });
    const r = await sendTestNotice(storeId, kind, phone);
    res.json(r);
  } catch (error: any) {
    console.error('[AdminOwnerNotice] test error:', error);
    res.status(400).json({ error: error?.message || '시험 발송에 실패했습니다.' });
  }
});

export default router;
