import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { registerWaiting, cancelWaiting, getWaitingStats } from '../services/waiting.js';

const router = Router();

router.get('/:storeSlug/info', async (req: Request, res: Response) => {
  try {
    const { storeSlug } = req.params;

    const store = await prisma.store.findUnique({
      where: { slug: storeSlug },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    const setting = await (prisma as any).waitingSetting.findUnique({
      where: { storeId: store.id },
    });

    if (!setting) {
      return res.json({
        store: {
          name: store.name,
          slug: store.slug,
        },
        operationStatus: 'CLOSED',
        isAccepting: false,
        types: [],
        stats: {
          totalWaiting: 0,
          totalPartySize: 0,
          estimatedMinutes: 0,
          byType: [],
        },
      });
    }

    const types = await (prisma as any).waitingType.findMany({
      where: { storeId: store.id, isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        avgWaitTimePerTeam: true,
        maxPartySize: true,
      },
    });

    const stats = await getWaitingStats(store.id);

    res.json({
      store: {
        name: store.name,
        slug: store.slug,
      },
      operationStatus: setting.operationStatus,
      isAccepting: setting.operationStatus === 'ACCEPTING',
      pauseMessage: setting.pauseMessage,
      showEstimatedTime: setting.showEstimatedTime,
      types: types.map((type: any) => {
        const typeStats = stats.byType.find((s) => s.typeId === type.id);
        return {
          ...type,
          currentWaitingCount: typeStats?.waitingCount ?? 0,
          estimatedMinutes: typeStats?.estimatedMinutes ?? 0,
        };
      }),
      stats: {
        totalWaiting: stats.totalWaiting,
        totalPartySize: stats.totalPartySize,
        estimatedMinutes: stats.estimatedMinutes,
      },
    });
  } catch (error) {
    console.error('Public waiting info error:', error);
    res.status(500).json({ error: '정보 조회 중 오류가 발생했습니다.' });
  }
});

router.post('/:storeSlug/register', async (req: Request, res: Response) => {
  try {
    const { storeSlug } = req.params;
    const { waitingTypeId, phone, partySize, memo, consentMarketing, source } = req.body;

    const store = await prisma.store.findUnique({
      where: { slug: storeSlug },
      select: { id: true, name: true },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    if (!waitingTypeId) {
      return res.status(400).json({ error: '웨이팅 유형을 선택해주세요.' });
    }

    if (!phone) {
      return res.status(400).json({ error: '전화번호를 입력해주세요.' });
    }

    if (!partySize || partySize < 1) {
      return res.status(400).json({ error: '인원 수를 입력해주세요.' });
    }

    // 웨이팅 유형의 최대 인원 제한 확인
    const waitingType = await (prisma as any).waitingType.findUnique({
      where: { id: waitingTypeId },
      select: { maxPartySize: true, name: true },
    });

    if (!waitingType) {
      return res.status(400).json({ error: '유효하지 않은 웨이팅 유형입니다.' });
    }

    if (partySize > waitingType.maxPartySize) {
      return res.status(400).json({
        error: `${waitingType.name}은(는) 최대 ${waitingType.maxPartySize}명까지 가능합니다.`
      });
    }

    const normalizedPhone = phone.replace(/[^0-9]/g, '');
    if (normalizedPhone.length < 10 || normalizedPhone.length > 11) {
      return res.status(400).json({ error: '올바른 전화번호 형식이 아닙니다.' });
    }

    const waitingSource = source === 'TABLET' ? 'TABLET' : 'QR';

    const result = await registerWaiting({
      storeId: store.id,
      waitingTypeId,
      phone: normalizedPhone,
      partySize,
      memo,
      source: waitingSource,
      consentMarketing: consentMarketing ?? false,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.status(201).json({
      success: true,
      storeName: store.name,
      waitingId: result.waitingId,
      waitingNumber: result.waitingNumber,
      waitingTypeName: waitingType?.name,
      position: result.position,
      estimatedMinutes: result.estimatedMinutes,
      message: '웨이팅이 등록되었습니다.',
    });
  } catch (error) {
    console.error('Public waiting register error:', error);
    res.status(500).json({ error: '웨이팅 등록 중 오류가 발생했습니다.' });
  }
});

router.get('/:storeSlug/status/:phone', async (req: Request, res: Response) => {
  try {
    const { storeSlug, phone } = req.params;

    const store = await prisma.store.findUnique({
      where: { slug: storeSlug },
      select: { id: true, name: true },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    const normalizedPhone = phone.replace(/[^0-9]/g, '');

    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstNow = new Date(now.getTime() + kstOffset);
    const kstDateStr = kstNow.toISOString().split('T')[0];
    const todayStart = new Date(kstDateStr + 'T00:00:00+09:00');
    const todayEnd = new Date(kstDateStr + 'T23:59:59.999+09:00');

    const waiting = await (prisma as any).waitingList.findFirst({
      where: {
        storeId: store.id,
        phone: normalizedPhone,
        createdAt: { gte: todayStart, lte: todayEnd },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        waitingType: {
          select: { name: true },
        },
      },
    });

    if (!waiting) {
      return res.json({
        found: false,
        storeName: store.name,
      });
    }

    let position: number | null = null;
    if (['WAITING', 'CALLED'].includes(waiting.status)) {
      position = await (prisma as any).waitingList.count({
        where: {
          storeId: store.id,
          waitingTypeId: waiting.waitingTypeId,
          status: { in: ['WAITING', 'CALLED'] },
          createdAt: { lt: waiting.createdAt },
        },
      }) + 1;
    }

    res.json({
      found: true,
      storeName: store.name,
      waiting: {
        id: waiting.id,
        waitingNumber: waiting.waitingNumber,
        waitingTypeName: waiting.waitingType.name,
        partySize: waiting.partySize,
        status: waiting.status,
        position,
        estimatedWaitMinutes: waiting.estimatedWaitMinutes,
        calledAt: waiting.calledAt,
        calledCount: waiting.calledCount,
        callExpireAt: waiting.callExpireAt,
        createdAt: waiting.createdAt,
        seatedAt: waiting.seatedAt,
        cancelledAt: waiting.cancelledAt,
        cancelReason: waiting.cancelReason,
      },
    });
  } catch (error) {
    console.error('Public waiting status error:', error);
    res.status(500).json({ error: '상태 조회 중 오류가 발생했습니다.' });
  }
});

router.post('/:storeSlug/cancel', async (req: Request, res: Response) => {
  try {
    const { storeSlug } = req.params;
    const { phone, waitingId } = req.body;

    const store = await prisma.store.findUnique({
      where: { slug: storeSlug },
      select: { id: true },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    let waiting;

    if (waitingId) {
      waiting = await (prisma as any).waitingList.findFirst({
        where: { id: waitingId, storeId: store.id },
      });
    } else if (phone) {
      const normalizedPhone = phone.replace(/[^0-9]/g, '');

      const now = new Date();
      const kstOffset = 9 * 60 * 60 * 1000;
      const kstNow = new Date(now.getTime() + kstOffset);
      const kstDateStr = kstNow.toISOString().split('T')[0];
      const todayStart = new Date(kstDateStr + 'T00:00:00+09:00');
      const todayEnd = new Date(kstDateStr + 'T23:59:59.999+09:00');

      waiting = await (prisma as any).waitingList.findFirst({
        where: {
          storeId: store.id,
          phone: normalizedPhone,
          status: { in: ['WAITING', 'CALLED'] },
          createdAt: { gte: todayStart, lte: todayEnd },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (!waiting) {
      return res.status(404).json({ error: '웨이팅을 찾을 수 없습니다.' });
    }

    if (!['WAITING', 'CALLED'].includes(waiting.status)) {
      return res.status(400).json({ error: '이미 처리된 웨이팅입니다.' });
    }

    const result = await cancelWaiting(store.id, waiting.id, 'CUSTOMER_REQUEST', true);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      message: '웨이팅이 취소되었습니다.',
    });
  } catch (error) {
    console.error('Public waiting cancel error:', error);
    res.status(500).json({ error: '취소 처리 중 오류가 발생했습니다.' });
  }
});

export default router;
