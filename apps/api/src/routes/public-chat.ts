import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { prisma as prismaClient } from '../lib/prisma.js';
import { generateAnonymousNickname } from '../utils/nickname-generator.js';

const prisma = prismaClient as any;
const router = Router();

// GET /api/public/chat/:storeSlug/info
router.get('/:storeSlug/info', async (req: Request, res: Response) => {
  try {
    const { storeSlug } = req.params;
    const store = await prisma.store.findUnique({
      where: { slug: storeSlug },
      select: { id: true, name: true, slug: true, chatSetting: true },
    });
    if (!store) return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });

    const setting = store.chatSetting;
    if (!setting || !setting.enabled) {
      return res.json({
        enabled: false,
        authMode: 'ANONYMOUS',
        storeName: store.name,
      });
    }

    res.json({
      enabled: true,
      authMode: setting.authMode,
      welcomeMessage: setting.welcomeMessage ?? null,
      storeName: store.name,
    });
  } catch (error) {
    console.error('[PublicChat] info error:', error);
    res.status(500).json({ error: '채팅방 정보 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/public/chat/:storeSlug/join
// body: { sessionId?: string, kakaoId?: string, kakaoNickname?: string }
router.post('/:storeSlug/join', async (req: Request, res: Response) => {
  try {
    const { storeSlug } = req.params;
    const { sessionId: providedSessionId, kakaoId, kakaoNickname } = req.body ?? {};

    const store = await prisma.store.findUnique({
      where: { slug: storeSlug },
      select: { id: true, chatSetting: true },
    });
    if (!store) return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    if (!store.chatSetting?.enabled) {
      return res.status(403).json({ error: '채팅 기능이 비활성화되어 있습니다.' });
    }

    const authMode = store.chatSetting.authMode;
    const sessionId = providedSessionId || crypto.randomUUID();

    let nickname: string;
    let customerId: string | null = null;

    if (authMode === 'KAKAO') {
      if (!kakaoId || !kakaoNickname) {
        return res.status(400).json({ error: '카카오 인증이 필요합니다.', needAuth: true });
      }
      const customer = await prisma.customer.findFirst({
        where: { storeId: store.id, kakaoId },
        select: { id: true },
      });
      customerId = customer?.id ?? null;
      nickname = String(kakaoNickname).slice(0, 20);
    } else {
      // ANONYMOUS — 기존 세션 있으면 그 닉네임 재사용, 없으면 자동 생성
      if (providedSessionId) {
        const existing = await prisma.chatParticipant.findUnique({
          where: { storeId_sessionId: { storeId: store.id, sessionId: providedSessionId } },
        });
        nickname = existing?.nickname ?? generateAnonymousNickname();
      } else {
        nickname = generateAnonymousNickname();
      }
    }

    const participant = await prisma.chatParticipant.upsert({
      where: { storeId_sessionId: { storeId: store.id, sessionId } },
      update: { nickname, customerId, lastSeenAt: new Date() },
      create: {
        storeId: store.id,
        sessionId,
        nickname,
        customerId,
      },
    });

    res.json({
      sessionId,
      participantId: participant.id,
      nickname: participant.nickname,
      authMode,
    });
  } catch (error) {
    console.error('[PublicChat] join error:', error);
    res.status(500).json({ error: '입장 중 오류가 발생했습니다.' });
  }
});

// GET /api/public/chat/:storeSlug/messages
router.get('/:storeSlug/messages', async (req: Request, res: Response) => {
  try {
    const { storeSlug } = req.params;
    const store = await prisma.store.findUnique({
      where: { slug: storeSlug },
      select: { id: true },
    });
    if (!store) return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    const messages = await prisma.chatMessage.findMany({
      where: { storeId: store.id, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    res.json({ messages });
  } catch (error) {
    console.error('[PublicChat] messages error:', error);
    res.status(500).json({ error: '메시지 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/public/chat/:storeSlug/posts
router.get('/:storeSlug/posts', async (req: Request, res: Response) => {
  try {
    const { storeSlug } = req.params;
    const store = await prisma.store.findUnique({
      where: { slug: storeSlug },
      select: { id: true },
    });
    if (!store) return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    const posts = await prisma.chatPost.findMany({
      where: { storeId: store.id },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      take: 50,
    });
    res.json({ posts });
  } catch (error) {
    console.error('[PublicChat] posts error:', error);
    res.status(500).json({ error: '게시글 조회 중 오류가 발생했습니다.' });
  }
});

export default router;
