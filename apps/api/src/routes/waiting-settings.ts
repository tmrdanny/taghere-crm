import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

type WaitingOperationStatus = 'ACCEPTING' | 'WALK_IN' | 'PAUSED' | 'CLOSED';

const router = Router();

router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;

    let setting = await (prisma as any).waitingSetting.findUnique({
      where: { storeId },
    });

    if (!setting) {
      setting = await (prisma as any).waitingSetting.create({
        data: {
          storeId,
          operationStatus: 'CLOSED',
          enabled: true,
          maxWaitingCount: 50,
          showEstimatedTime: true,
          callTimeoutMinutes: 3,
          maxCallCount: 2,
          autoCancel: true,
        },
      });
    }

    res.json({ setting });
  } catch (error) {
    console.error('Waiting settings get error:', error);
    res.status(500).json({ error: '설정 조회 중 오류가 발생했습니다.' });
  }
});

router.put('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const {
      enabled,
      maxWaitingCount,
      showEstimatedTime,
      callTimeoutMinutes,
      maxCallCount,
      autoCancel,
      quickMemos,
      waitingNote,
      waitingCallNote,
    } = req.body;

    const updateData: any = {};

    if (enabled !== undefined) updateData.enabled = enabled;
    if (maxWaitingCount !== undefined) {
      if (maxWaitingCount < 1 || maxWaitingCount > 999) {
        return res.status(400).json({ error: '최대 대기 인원은 1~999 사이여야 합니다.' });
      }
      updateData.maxWaitingCount = maxWaitingCount;
    }
    if (showEstimatedTime !== undefined) updateData.showEstimatedTime = showEstimatedTime;
    if (callTimeoutMinutes !== undefined) {
      if (callTimeoutMinutes < 1 || callTimeoutMinutes > 30) {
        return res.status(400).json({ error: '호출 후 대기 시간은 1~30분 사이여야 합니다.' });
      }
      updateData.callTimeoutMinutes = callTimeoutMinutes;
    }
    if (maxCallCount !== undefined) {
      if (maxCallCount < 1 || maxCallCount > 5) {
        return res.status(400).json({ error: '최대 호출 횟수는 1~5회 사이여야 합니다.' });
      }
      updateData.maxCallCount = maxCallCount;
    }
    if (autoCancel !== undefined) updateData.autoCancel = autoCancel;
    if (quickMemos !== undefined) updateData.quickMemos = quickMemos;
    if (waitingNote !== undefined) updateData.waitingNote = waitingNote;
    if (waitingCallNote !== undefined) updateData.waitingCallNote = waitingCallNote;

    const setting = await (prisma as any).waitingSetting.upsert({
      where: { storeId },
      update: updateData,
      create: {
        storeId,
        ...updateData,
        operationStatus: 'CLOSED',
      },
    });

    res.json({ setting });
  } catch (error) {
    console.error('Waiting settings update error:', error);
    res.status(500).json({ error: '설정 수정 중 오류가 발생했습니다.' });
  }
});

router.put('/status', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { operationStatus, pauseMessage, pauseEndTime } = req.body;

    if (!operationStatus) {
      return res.status(400).json({ error: '운영 상태를 선택해주세요.' });
    }

    const validStatuses: WaitingOperationStatus[] = ['ACCEPTING', 'WALK_IN', 'PAUSED', 'CLOSED'];
    if (!validStatuses.includes(operationStatus)) {
      return res.status(400).json({ error: '유효하지 않은 운영 상태입니다.' });
    }

    if (operationStatus === 'ACCEPTING') {
      const typeCount = await (prisma as any).waitingType.count({
        where: { storeId, isActive: true },
      });

      // 웨이팅 유형이 없으면 기본 "홀" 유형 자동 생성
      if (typeCount === 0) {
        await (prisma as any).waitingType.create({
          data: {
            storeId,
            name: '홀',
            description: '일반 홀 좌석',
            minPartySize: 1,
            maxPartySize: 10,
            avgWaitTimePerTeam: 10,
            isActive: true,
            sortOrder: 0,
          },
        });
      }
    }

    const updateData: any = {
      operationStatus,
    };

    if (operationStatus === 'PAUSED') {
      updateData.pauseMessage = pauseMessage || null;
      updateData.pauseEndTime = pauseEndTime ? new Date(pauseEndTime) : null;
    } else {
      updateData.pauseMessage = null;
      updateData.pauseEndTime = null;
    }

    const setting = await (prisma as any).waitingSetting.upsert({
      where: { storeId },
      update: updateData,
      create: {
        storeId,
        operationStatus,
        pauseMessage: updateData.pauseMessage,
        pauseEndTime: updateData.pauseEndTime,
        enabled: true,
        maxWaitingCount: 50,
        showEstimatedTime: true,
        callTimeoutMinutes: 3,
        maxCallCount: 2,
        autoCancel: true,
      },
    });

    const statusMessages: Record<WaitingOperationStatus, string> = {
      ACCEPTING: '웨이팅 접수가 시작되었습니다.',
      WALK_IN: '바로 입장 모드로 전환되었습니다.',
      PAUSED: '웨이팅 접수가 일시 중지되었습니다.',
      CLOSED: '웨이팅 운영이 종료되었습니다.',
    };

    res.json({
      setting,
      message: statusMessages[operationStatus as WaitingOperationStatus],
    });
  } catch (error) {
    console.error('Waiting status update error:', error);
    res.status(500).json({ error: '운영 상태 변경 중 오류가 발생했습니다.' });
  }
});

export default router;
