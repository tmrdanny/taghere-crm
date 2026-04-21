import { Router } from 'express';
import { prisma as prismaClient } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import {
  broadcastStoreMessage,
  broadcastPost,
  broadcastPostUpdate,
  broadcastPostDelete,
  broadcastMessageDelete,
  broadcastRoomReset,
} from '../services/chat-socket.js';

const prisma = prismaClient as any;
const router = Router();

router.use(authMiddleware);

// GET /api/chat/settings
router.get('/settings', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const setting = await prisma.chatSetting.upsert({
      where: { storeId },
      update: {},
      create: { storeId },
    });
    res.json({ setting });
  } catch (error) {
    console.error('[Chat] GET settings error:', error);
    res.status(500).json({ error: '설정 조회 중 오류가 발생했습니다.' });
  }
});

// PUT /api/chat/settings
router.put('/settings', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { enabled, authMode, resetIntervalDays, resetHourKst, welcomeMessage } = req.body;

    const updateData: any = {};
    if (enabled !== undefined) updateData.enabled = !!enabled;
    if (authMode !== undefined) {
      if (!['ANONYMOUS', 'KAKAO'].includes(authMode)) {
        return res.status(400).json({ error: '유효한 authMode가 아닙니다.' });
      }
      updateData.authMode = authMode;
    }
    if (resetIntervalDays !== undefined) {
      const v = Number(resetIntervalDays);
      if (!Number.isInteger(v) || v < 1 || v > 7) {
        return res.status(400).json({ error: '초기화 주기는 1~7일이어야 합니다.' });
      }
      updateData.resetIntervalDays = v;
    }
    if (resetHourKst !== undefined) {
      const v = Number(resetHourKst);
      if (!Number.isInteger(v) || v < 0 || v > 23) {
        return res.status(400).json({ error: '초기화 시각은 0~23시여야 합니다.' });
      }
      updateData.resetHourKst = v;
    }
    if (welcomeMessage !== undefined) {
      updateData.welcomeMessage = typeof welcomeMessage === 'string' ? welcomeMessage : null;
    }

    const setting = await prisma.chatSetting.upsert({
      where: { storeId },
      update: updateData,
      create: { storeId, ...updateData },
    });
    res.json({ setting });
  } catch (error) {
    console.error('[Chat] PUT settings error:', error);
    res.status(500).json({ error: '설정 저장 중 오류가 발생했습니다.' });
  }
});

// GET /api/chat/posts
router.get('/posts', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const posts = await prisma.chatPost.findMany({
      where: { storeId },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
    res.json({ posts });
  } catch (error) {
    console.error('[Chat] GET posts error:', error);
    res.status(500).json({ error: '게시글 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/chat/posts
router.post('/posts', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { title, content, isPinned, imageUrl } = req.body;
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: '내용을 입력해주세요.' });
    }
    if (content.length > 2000) {
      return res.status(400).json({ error: '내용은 2000자 이내여야 합니다.' });
    }
    const post = await prisma.chatPost.create({
      data: {
        storeId,
        title: title?.trim() || null,
        content: content.trim(),
        isPinned: !!isPinned,
        imageUrl: imageUrl?.trim() || null,
      },
    });
    broadcastPost(storeId, {
      id: post.id,
      title: post.title,
      content: post.content,
      imageUrl: post.imageUrl,
      isPinned: post.isPinned,
      createdAt: post.createdAt.toISOString(),
    });
    res.json({ post });
  } catch (error) {
    console.error('[Chat] POST posts error:', error);
    res.status(500).json({ error: '게시글 생성 중 오류가 발생했습니다.' });
  }
});

// PUT /api/chat/posts/:id
router.put('/posts/:id', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { id } = req.params;
    const { title, content, isPinned, imageUrl } = req.body;

    const existing = await prisma.chatPost.findFirst({ where: { id, storeId } });
    if (!existing) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });

    const updateData: any = {};
    if (title !== undefined) updateData.title = title?.trim() || null;
    if (content !== undefined) {
      if (typeof content !== 'string' || content.trim().length === 0) {
        return res.status(400).json({ error: '내용을 입력해주세요.' });
      }
      updateData.content = content.trim();
    }
    if (isPinned !== undefined) updateData.isPinned = !!isPinned;
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl?.trim() || null;

    const post = await prisma.chatPost.update({
      where: { id },
      data: updateData,
    });
    broadcastPostUpdate(storeId, {
      id: post.id,
      title: post.title,
      content: post.content,
      imageUrl: post.imageUrl,
      isPinned: post.isPinned,
    });
    res.json({ post });
  } catch (error) {
    console.error('[Chat] PUT post error:', error);
    res.status(500).json({ error: '게시글 수정 중 오류가 발생했습니다.' });
  }
});

// DELETE /api/chat/posts/:id
router.delete('/posts/:id', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { id } = req.params;
    const existing = await prisma.chatPost.findFirst({ where: { id, storeId } });
    if (!existing) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
    await prisma.chatPost.delete({ where: { id } });
    broadcastPostDelete(storeId, id);
    res.json({ success: true });
  } catch (error) {
    console.error('[Chat] DELETE post error:', error);
    res.status(500).json({ error: '게시글 삭제 중 오류가 발생했습니다.' });
  }
});

// GET /api/chat/messages — 모니터링용 (최근 200개)
router.get('/messages', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const messages = await prisma.chatMessage.findMany({
      where: { storeId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json({ messages });
  } catch (error) {
    console.error('[Chat] GET messages error:', error);
    res.status(500).json({ error: '메시지 조회 중 오류가 발생했습니다.' });
  }
});

// DELETE /api/chat/messages/:id — 모더레이션
router.delete('/messages/:id', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { id } = req.params;
    const msg = await prisma.chatMessage.findFirst({ where: { id, storeId } });
    if (!msg) return res.status(404).json({ error: '메시지를 찾을 수 없습니다.' });
    await prisma.chatMessage.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    broadcastMessageDelete(storeId, id);
    res.json({ success: true });
  } catch (error) {
    console.error('[Chat] DELETE message error:', error);
    res.status(500).json({ error: '메시지 삭제 중 오류가 발생했습니다.' });
  }
});

// POST /api/chat/reset — 수동 초기화
router.post('/reset', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const now = new Date();
    const setting = await prisma.chatSetting.findUnique({ where: { storeId } });
    await prisma.chatMessage.updateMany({
      where: { storeId, deletedAt: null },
      data: { deletedAt: now },
    });
    await prisma.chatParticipant.deleteMany({ where: { storeId } });
    if (setting) {
      await prisma.chatSetting.update({
        where: { id: setting.id },
        data: { lastResetAt: now },
      });
    }
    broadcastRoomReset(storeId, setting?.welcomeMessage ?? null);
    res.json({ success: true });
  } catch (error) {
    console.error('[Chat] reset error:', error);
    res.status(500).json({ error: '초기화 중 오류가 발생했습니다.' });
  }
});

// POST /api/chat/send — 사장이 STORE 타입으로 메시지 송신
router.post('/send', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { content } = req.body;
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: '내용을 입력해주세요.' });
    }
    if (content.length > 500) {
      return res.status(400).json({ error: '내용은 500자 이내여야 합니다.' });
    }
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { name: true },
    });
    const nickname = store?.name ? `[${store.name}]` : '[사장님]';
    const msg = await prisma.chatMessage.create({
      data: {
        storeId,
        senderType: 'STORE',
        nickname,
        content: content.trim(),
      },
    });
    broadcastStoreMessage(storeId, {
      id: msg.id,
      senderType: msg.senderType,
      nickname: msg.nickname,
      content: msg.content,
      createdAt: msg.createdAt.toISOString(),
    });
    res.json({ message: msg });
  } catch (error) {
    console.error('[Chat] send error:', error);
    res.status(500).json({ error: '메시지 송신 중 오류가 발생했습니다.' });
  }
});

export default router;
