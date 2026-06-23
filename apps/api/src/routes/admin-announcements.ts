import { Router, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { AdminRequest, adminAuthMiddleware } from './admin-shared.js';

const router = Router();

// GET /api/admin/announcements - 공지사항 목록 조회
router.get('/announcements', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const announcements = await prisma.announcement.findMany({
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    res.json(announcements);
  } catch (error) {
    console.error('Admin announcements error:', error);
    res.status(500).json({ error: '공지사항 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/admin/announcements - 공지사항 생성
router.post('/announcements', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { title, content, isActive, priority, startAt, endAt } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: '제목과 내용을 입력해주세요.' });
    }

    const announcement = await prisma.announcement.create({
      data: {
        title,
        content,
        isActive: isActive ?? true,
        priority: priority ?? 0,
        startAt: startAt ? new Date(startAt) : null,
        endAt: endAt ? new Date(endAt) : null,
      },
    });

    res.status(201).json(announcement);
  } catch (error) {
    console.error('Admin create announcement error:', error);
    res.status(500).json({ error: '공지사항 생성 중 오류가 발생했습니다.' });
  }
});

// PUT /api/admin/announcements/:id - 공지사항 수정
router.put('/announcements/:id', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { title, content, isActive, priority, startAt, endAt } = req.body;

    const existing = await prisma.announcement.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: '공지사항을 찾을 수 없습니다.' });
    }

    const announcement = await prisma.announcement.update({
      where: { id },
      data: {
        title: title ?? existing.title,
        content: content ?? existing.content,
        isActive: isActive ?? existing.isActive,
        priority: priority ?? existing.priority,
        startAt: startAt !== undefined ? (startAt ? new Date(startAt) : null) : existing.startAt,
        endAt: endAt !== undefined ? (endAt ? new Date(endAt) : null) : existing.endAt,
      },
    });

    res.json(announcement);
  } catch (error) {
    console.error('Admin update announcement error:', error);
    res.status(500).json({ error: '공지사항 수정 중 오류가 발생했습니다.' });
  }
});

// DELETE /api/admin/announcements/:id - 공지사항 삭제
router.delete('/announcements/:id', adminAuthMiddleware, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await prisma.announcement.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: '공지사항을 찾을 수 없습니다.' });
    }

    await prisma.announcement.delete({
      where: { id },
    });

    res.json({ success: true, message: '공지사항이 삭제되었습니다.' });
  } catch (error) {
    console.error('Admin delete announcement error:', error);
    res.status(500).json({ error: '공지사항 삭제 중 오류가 발생했습니다.' });
  }
});

export default router;
