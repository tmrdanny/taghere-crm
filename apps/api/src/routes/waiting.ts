import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import {
  registerWaiting,
  callWaiting,
  recallWaiting,
  seatWaiting,
  cancelWaiting,
  deferWaiting,
  restoreWaiting,
  getWaitingStats,
  getTodayStats,
} from '../services/waiting.js';

type WaitingStatus = 'WAITING' | 'CALLED' | 'SEATED' | 'CANCELLED' | 'NO_SHOW';
type CancelReason = 'CUSTOMER_REQUEST' | 'STORE_REASON' | 'OUT_OF_STOCK' | 'NO_SHOW' | 'AUTO_CANCELLED';

const router = Router();

router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { status, typeId, page = '1', limit = '50' } = req.query;

    const where: any = { storeId };

    if (status) {
      const statuses = (status as string).split(',') as WaitingStatus[];
      where.status = { in: statuses };
    }

    if (typeId) {
      where.waitingTypeId = typeId;
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const [waitings, total] = await Promise.all([
      (prisma as any).waitingList.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
        skip,
        take: limitNum,
        include: {
          waitingType: {
            select: { id: true, name: true },
          },
          customer: {
            select: { id: true, name: true, visitCount: true },
          },
        },
      }),
      (prisma as any).waitingList.count({ where }),
    ]);

    const statusOrder: Record<WaitingStatus, number> = {
      CALLED: 0,
      WAITING: 1,
      SEATED: 2,
      CANCELLED: 3,
      NO_SHOW: 4,
    };

    const sortedWaitings = waitings.sort((a: any, b: any) => {
      const statusDiff = statusOrder[a.status as WaitingStatus] - statusOrder[b.status as WaitingStatus];
      if (statusDiff !== 0) return statusDiff;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    const waitingsWithPosition = sortedWaitings.map((w: any) => {
      const sameTypeWaitings = sortedWaitings.filter(
        (sw: any) =>
          sw.waitingTypeId === w.waitingTypeId &&
          ['WAITING', 'CALLED'].includes(sw.status)
      );
      const position = sameTypeWaitings.findIndex((sw: any) => sw.id === w.id) + 1;

      return {
        ...w,
        position: ['WAITING', 'CALLED'].includes(w.status) ? position : null,
      };
    });

    res.json({
      waitings: waitingsWithPosition,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Waiting list error:', error);
    res.status(500).json({ error: '대기 목록 조회 중 오류가 발생했습니다.' });
  }
});

router.get('/stats', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const stats = await getWaitingStats(storeId);
    res.json(stats);
  } catch (error) {
    console.error('Waiting stats error:', error);
    res.status(500).json({ error: '통계 조회 중 오류가 발생했습니다.' });
  }
});

router.get('/stats/today', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const [todayStats, waitingStats] = await Promise.all([
      getTodayStats(storeId),
      getWaitingStats(storeId),
    ]);

    // 프론트엔드가 기대하는 형식으로 변환
    res.json({
      // 현재 대기 중인 통계 (WAITING + CALLED 상태)
      totalTeams: waitingStats.totalWaiting,
      totalGuests: waitingStats.totalPartySize,
      estimatedMinutes: waitingStats.estimatedMinutes,
      byType: waitingStats.byType.map((t) => ({
        typeId: t.typeId,
        typeName: t.typeName,
        teams: t.waitingCount,
        guests: 0, // TODO: partySize per type if needed
        estimatedMinutes: t.estimatedMinutes,
      })),
      byStatus: {
        waiting: waitingStats.totalWaiting,
        seated: todayStats.totalSeated,
        cancelled: todayStats.totalCancelled + todayStats.totalNoShow,
      },
      // 오늘 전체 통계
      todayStats: {
        totalRegistered: todayStats.totalRegistered,
        totalSeated: todayStats.totalSeated,
        totalCancelled: todayStats.totalCancelled,
        totalNoShow: todayStats.totalNoShow,
        avgWaitTime: todayStats.avgWaitTime,
      },
    });
  } catch (error) {
    console.error('Today stats error:', error);
    res.status(500).json({ error: '오늘 통계 조회 중 오류가 발생했습니다.' });
  }
});

router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { waitingTypeId, phone, name, partySize, memo, consentMarketing } = req.body;

    if (!waitingTypeId) {
      return res.status(400).json({ error: '웨이팅 유형을 선택해주세요.' });
    }

    if (!partySize || partySize < 1) {
      return res.status(400).json({ error: '인원 수를 입력해주세요.' });
    }

    if (!phone && !name) {
      return res.status(400).json({ error: '전화번호 또는 이름을 입력해주세요.' });
    }

    const result = await registerWaiting({
      storeId,
      waitingTypeId,
      phone: phone || undefined,
      name: name || undefined,
      partySize,
      memo,
      source: 'MANUAL',
      consentMarketing,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.status(201).json({
      success: true,
      waitingId: result.waitingId,
      waitingNumber: result.waitingNumber,
      position: result.position,
      estimatedMinutes: result.estimatedMinutes,
    });
  } catch (error) {
    console.error('Manual waiting registration error:', error);
    res.status(500).json({ error: '웨이팅 등록 중 오류가 발생했습니다.' });
  }
});

router.post('/:id/call', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { id } = req.params;

    const result = await callWaiting(storeId, id);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, message: '호출되었습니다.' });
  } catch (error) {
    console.error('Waiting call error:', error);
    res.status(500).json({ error: '호출 중 오류가 발생했습니다.' });
  }
});

router.post('/:id/recall', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { id } = req.params;

    const result = await recallWaiting(storeId, id);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, message: '재호출되었습니다.' });
  } catch (error) {
    console.error('Waiting recall error:', error);
    res.status(500).json({ error: '재호출 중 오류가 발생했습니다.' });
  }
});

router.post('/:id/seat', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { id } = req.params;

    const result = await seatWaiting(storeId, id);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      message: '착석 처리되었습니다.',
      customerId: result.customerId,
    });
  } catch (error) {
    console.error('Waiting seat error:', error);
    res.status(500).json({ error: '착석 처리 중 오류가 발생했습니다.' });
  }
});

router.post('/:id/cancel', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: '취소 사유를 선택해주세요.' });
    }

    const validReasons: CancelReason[] = [
      'CUSTOMER_REQUEST',
      'STORE_REASON',
      'OUT_OF_STOCK',
      'NO_SHOW',
    ];

    if (!validReasons.includes(reason)) {
      return res.status(400).json({ error: '유효하지 않은 취소 사유입니다.' });
    }

    const result = await cancelWaiting(storeId, id, reason);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, message: '취소 처리되었습니다.' });
  } catch (error) {
    console.error('Waiting cancel error:', error);
    res.status(500).json({ error: '취소 처리 중 오류가 발생했습니다.' });
  }
});

router.post('/:id/defer', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { id } = req.params;

    const result = await deferWaiting(storeId, id);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      message: '순서가 미뤄졌습니다.',
      newPosition: result.newPosition,
    });
  } catch (error) {
    console.error('Waiting defer error:', error);
    res.status(500).json({ error: '순서 미루기 중 오류가 발생했습니다.' });
  }
});

router.post('/:id/restore', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { id } = req.params;

    const result = await restoreWaiting(storeId, id);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, message: '웨이팅이 복원되었습니다.' });
  } catch (error) {
    console.error('Waiting restore error:', error);
    res.status(500).json({ error: '복원 중 오류가 발생했습니다.' });
  }
});

router.patch('/:id/memo', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { id } = req.params;
    const { memo } = req.body;

    const waiting = await (prisma as any).waitingList.findFirst({
      where: { id, storeId },
    });

    if (!waiting) {
      return res.status(404).json({ error: '웨이팅을 찾을 수 없습니다.' });
    }

    await (prisma as any).waitingList.update({
      where: { id },
      data: { memo },
    });

    res.json({ success: true, message: '메모가 수정되었습니다.' });
  } catch (error) {
    console.error('Waiting memo update error:', error);
    res.status(500).json({ error: '메모 수정 중 오류가 발생했습니다.' });
  }
});

export default router;
