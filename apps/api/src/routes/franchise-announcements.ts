import { Router, Request, Response } from 'express';
import { franchiseAuthMiddleware, FranchiseAuthRequest } from '../middleware/franchise-auth.js';
import { listActiveAnnouncements, markAnnouncementRead } from '../services/announcements.js';

// 프랜차이즈 CRM 공지사항 — 본사 단위 읽음 처리
//  - GET  /api/franchise/announcements
//  - POST /api/franchise/announcements/:id/read
const router = Router();

router.get('/', franchiseAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const franchiseId = (req as FranchiseAuthRequest).franchiseUser!.franchiseId;
    res.json(await listActiveAnnouncements({ franchiseId }));
  } catch (error) {
    console.error('[FranchiseAnnouncements] list error:', error);
    res.status(500).json({ error: '공지사항 조회 중 오류가 발생했습니다.' });
  }
});

router.post('/:id/read', franchiseAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const franchiseId = (req as FranchiseAuthRequest).franchiseUser!.franchiseId;
    const ok = await markAnnouncementRead(req.params.id, { franchiseId });
    if (!ok) return res.status(404).json({ error: '공지사항을 찾을 수 없습니다.' });
    res.json({ success: true });
  } catch (error) {
    console.error('[FranchiseAnnouncements] read error:', error);
    res.status(500).json({ error: '공지사항 읽음 처리 중 오류가 발생했습니다.' });
  }
});

export default router;
