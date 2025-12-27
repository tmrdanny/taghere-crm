import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { clearSolapiCache } from '../services/alimtalk-worker.js';

const router = Router();

// GET /api/alimtalk/config - 알림톡 설정 조회
router.get('/config', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;

    let config = await prisma.alimTalkConfig.findUnique({
      where: { storeId },
    });

    // 설정이 없으면 기본값 반환
    if (!config) {
      config = {
        id: '',
        storeId,
        solapiApiKey: null,
        solapiApiSecret: null,
        pfId: null,
        templateIdPointsEarned: null,
        templateIdReviewRequest: null,
        enabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    // API Secret은 마스킹 처리
    res.json({
      ...config,
      solapiApiSecret: config.solapiApiSecret ? '********' : null,
    });
  } catch (error) {
    console.error('AlimTalk config get error:', error);
    res.status(500).json({ error: '알림톡 설정 조회 중 오류가 발생했습니다.' });
  }
});

// PUT /api/alimtalk/config - 알림톡 설정 저장
router.put('/config', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const {
      solapiApiKey,
      solapiApiSecret,
      pfId,
      templateIdPointsEarned,
      templateIdReviewRequest,
      enabled,
    } = req.body;

    // 기존 설정 조회
    const existing = await prisma.alimTalkConfig.findUnique({
      where: { storeId },
    });

    // 업데이트 데이터 구성
    const updateData: any = {};
    if (solapiApiKey !== undefined) updateData.solapiApiKey = solapiApiKey;
    // API Secret이 마스킹된 값이 아닐 때만 업데이트
    if (solapiApiSecret !== undefined && solapiApiSecret !== '********') {
      updateData.solapiApiSecret = solapiApiSecret;
    }
    if (pfId !== undefined) updateData.pfId = pfId;
    if (templateIdPointsEarned !== undefined) updateData.templateIdPointsEarned = templateIdPointsEarned;
    if (templateIdReviewRequest !== undefined) updateData.templateIdReviewRequest = templateIdReviewRequest;
    if (enabled !== undefined) updateData.enabled = enabled;

    let config;
    if (existing) {
      config = await prisma.alimTalkConfig.update({
        where: { storeId },
        data: updateData,
      });
    } else {
      config = await prisma.alimTalkConfig.create({
        data: {
          storeId,
          ...updateData,
        },
      });
    }

    // 캐시 초기화
    clearSolapiCache();

    res.json({
      ...config,
      solapiApiSecret: config.solapiApiSecret ? '********' : null,
    });
  } catch (error) {
    console.error('AlimTalk config save error:', error);
    res.status(500).json({ error: '알림톡 설정 저장 중 오류가 발생했습니다.' });
  }
});

// GET /api/alimtalk/logs - 알림톡 발송 로그 조회
router.get('/logs', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { page = '1', limit = '20', status, messageType } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = { storeId };
    if (status) where.status = status;
    if (messageType) where.messageType = messageType;

    const [logs, total] = await Promise.all([
      prisma.alimTalkOutbox.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.alimTalkOutbox.count({ where }),
    ]);

    res.json({
      logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('AlimTalk logs error:', error);
    res.status(500).json({ error: '알림톡 발송 로그 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/alimtalk/stats - 알림톡 발송 통계
router.get('/stats', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { days = '30' } = req.query;

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - parseInt(days as string));

    const [total, sent, failed, pending] = await Promise.all([
      prisma.alimTalkOutbox.count({
        where: { storeId, createdAt: { gte: sinceDate } },
      }),
      prisma.alimTalkOutbox.count({
        where: { storeId, status: 'SENT', createdAt: { gte: sinceDate } },
      }),
      prisma.alimTalkOutbox.count({
        where: { storeId, status: 'FAILED', createdAt: { gte: sinceDate } },
      }),
      prisma.alimTalkOutbox.count({
        where: { storeId, status: { in: ['PENDING', 'RETRY', 'PROCESSING'] }, createdAt: { gte: sinceDate } },
      }),
    ]);

    // 메시지 타입별 통계
    const byType = await prisma.alimTalkOutbox.groupBy({
      by: ['messageType'],
      where: { storeId, createdAt: { gte: sinceDate } },
      _count: true,
    });

    res.json({
      period: `${days}days`,
      total,
      sent,
      failed,
      pending,
      successRate: total > 0 ? Math.round((sent / total) * 100) : 0,
      byType: byType.map((t) => ({
        type: t.messageType,
        count: t._count,
      })),
    });
  } catch (error) {
    console.error('AlimTalk stats error:', error);
    res.status(500).json({ error: '알림톡 통계 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/alimtalk/retry/:id - 실패한 메시지 재시도
router.post('/retry/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const storeId = req.user!.storeId;

    const message = await prisma.alimTalkOutbox.findFirst({
      where: { id, storeId },
    });

    if (!message) {
      return res.status(404).json({ error: '메시지를 찾을 수 없습니다.' });
    }

    if (message.status !== 'FAILED') {
      return res.status(400).json({ error: '실패한 메시지만 재시도할 수 있습니다.' });
    }

    await prisma.alimTalkOutbox.update({
      where: { id },
      data: {
        status: 'RETRY',
        retryCount: 0,
        failReason: null,
      },
    });

    res.json({ success: true, message: '재시도 예약되었습니다.' });
  } catch (error) {
    console.error('AlimTalk retry error:', error);
    res.status(500).json({ error: '재시도 요청 중 오류가 발생했습니다.' });
  }
});

export default router;
