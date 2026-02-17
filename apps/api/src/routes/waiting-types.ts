import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { getTodayStartEnd } from '../services/waiting.js';

const router = Router();

router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { includeInactive } = req.query;

    const where: any = { storeId };
    if (includeInactive !== 'true') {
      where.isActive = true;
    }

    const types = await (prisma as any).waitingType.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
    });

    const { todayStart, todayEnd } = getTodayStartEnd();

    const typesWithStats = await Promise.all(
      types.map(async (type: any) => {
        const waitingCount = await (prisma as any).waitingList.count({
          where: {
            waitingTypeId: type.id,
            status: { in: ['WAITING', 'CALLED'] },
            createdAt: { gte: todayStart, lte: todayEnd },
          },
        });

        return {
          ...type,
          currentWaitingCount: waitingCount,
          estimatedMinutes: waitingCount * type.avgWaitTimePerTeam,
        };
      })
    );

    res.json({ types: typesWithStats });
  } catch (error) {
    console.error('Waiting types list error:', error);
    res.status(500).json({ error: '웨이팅 유형 목록 조회 중 오류가 발생했습니다.' });
  }
});

router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { name, description, avgWaitTimePerTeam, minPartySize, maxPartySize } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: '유형 이름을 입력해주세요.' });
    }

    if (minPartySize !== undefined && (minPartySize < 0 || minPartySize > 100)) {
      return res.status(400).json({ error: '최소 인원은 0~100명 사이로 입력해주세요.' });
    }

    if (!maxPartySize || maxPartySize < 1 || maxPartySize > 100) {
      return res.status(400).json({ error: '최대 인원은 1~100명 사이로 입력해주세요.' });
    }

    if (minPartySize && minPartySize > maxPartySize) {
      return res.status(400).json({ error: '최소 인원은 최대 인원보다 클 수 없습니다.' });
    }

    const existingType = await (prisma as any).waitingType.findFirst({
      where: { storeId, name: name.trim() },
    });

    if (existingType) {
      return res.status(400).json({ error: '이미 존재하는 유형 이름입니다.' });
    }

    const maxSortOrder = await (prisma as any).waitingType.aggregate({
      where: { storeId },
      _max: { sortOrder: true },
    });

    const type = await (prisma as any).waitingType.create({
      data: {
        storeId,
        name: name.trim(),
        description: description || null,
        avgWaitTimePerTeam: avgWaitTimePerTeam || 5,
        minPartySize: minPartySize ?? 0,
        maxPartySize: maxPartySize,
        sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
        isActive: true,
      },
    });

    res.status(201).json({ type });
  } catch (error) {
    console.error('Waiting type create error:', error);
    res.status(500).json({ error: '웨이팅 유형 생성 중 오류가 발생했습니다.' });
  }
});

router.put('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { id } = req.params;
    const { name, description, avgWaitTimePerTeam, minPartySize, maxPartySize, isActive } = req.body;

    const existingType = await (prisma as any).waitingType.findFirst({
      where: { id, storeId },
    });

    if (!existingType) {
      return res.status(404).json({ error: '웨이팅 유형을 찾을 수 없습니다.' });
    }

    if (name && name.trim() !== existingType.name) {
      const duplicateType = await (prisma as any).waitingType.findFirst({
        where: { storeId, name: name.trim(), id: { not: id } },
      });

      if (duplicateType) {
        return res.status(400).json({ error: '이미 존재하는 유형 이름입니다.' });
      }
    }

    if (minPartySize !== undefined && (minPartySize < 0 || minPartySize > 100)) {
      return res.status(400).json({ error: '최소 인원은 0~100명 사이로 입력해주세요.' });
    }

    if (maxPartySize !== undefined && (maxPartySize < 1 || maxPartySize > 100)) {
      return res.status(400).json({ error: '최대 인원은 1~100명 사이로 입력해주세요.' });
    }

    const effectiveMin = minPartySize ?? existingType.minPartySize ?? 0;
    const effectiveMax = maxPartySize ?? existingType.maxPartySize;
    if (effectiveMin > 0 && effectiveMin > effectiveMax) {
      return res.status(400).json({ error: '최소 인원은 최대 인원보다 클 수 없습니다.' });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description;
    if (avgWaitTimePerTeam !== undefined) updateData.avgWaitTimePerTeam = avgWaitTimePerTeam;
    if (minPartySize !== undefined) updateData.minPartySize = minPartySize;
    if (maxPartySize !== undefined) updateData.maxPartySize = maxPartySize;
    if (isActive !== undefined) updateData.isActive = isActive;

    const type = await (prisma as any).waitingType.update({
      where: { id },
      data: updateData,
    });

    res.json({ type });
  } catch (error) {
    console.error('Waiting type update error:', error);
    res.status(500).json({ error: '웨이팅 유형 수정 중 오류가 발생했습니다.' });
  }
});

router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { id } = req.params;

    const existingType = await (prisma as any).waitingType.findFirst({
      where: { id, storeId },
    });

    if (!existingType) {
      return res.status(404).json({ error: '웨이팅 유형을 찾을 수 없습니다.' });
    }

    const activeTypeCount = await (prisma as any).waitingType.count({
      where: { storeId, isActive: true },
    });

    if (activeTypeCount <= 1 && existingType.isActive) {
      return res.status(400).json({ error: '최소 1개의 활성 유형이 필요합니다.' });
    }

    const { todayStart: delTodayStart, todayEnd: delTodayEnd } = getTodayStartEnd();
    const activeWaitingCount = await (prisma as any).waitingList.count({
      where: {
        waitingTypeId: id,
        status: { in: ['WAITING', 'CALLED'] },
        createdAt: { gte: delTodayStart, lte: delTodayEnd },
      },
    });

    if (activeWaitingCount > 0) {
      return res.status(400).json({
        error: `현재 대기 중인 웨이팅이 ${activeWaitingCount}건 있습니다. 모두 처리 후 삭제해주세요.`,
      });
    }

    const hasHistory = await (prisma as any).waitingList.findFirst({
      where: { waitingTypeId: id },
    });

    if (hasHistory) {
      await (prisma as any).waitingType.update({
        where: { id },
        data: { isActive: false },
      });
      res.json({ success: true, message: '유형이 비활성화되었습니다.', softDeleted: true });
    } else {
      await (prisma as any).waitingType.delete({
        where: { id },
      });
      res.json({ success: true, message: '유형이 삭제되었습니다.', softDeleted: false });
    }
  } catch (error) {
    console.error('Waiting type delete error:', error);
    res.status(500).json({ error: '웨이팅 유형 삭제 중 오류가 발생했습니다.' });
  }
});

router.put('/reorder', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { typeIds } = req.body;

    if (!Array.isArray(typeIds) || typeIds.length === 0) {
      return res.status(400).json({ error: '유형 ID 목록이 필요합니다.' });
    }

    const existingTypes = await (prisma as any).waitingType.findMany({
      where: { storeId, id: { in: typeIds } },
      select: { id: true },
    });

    const existingIds = new Set(existingTypes.map((t: any) => t.id));
    const invalidIds = typeIds.filter((id: string) => !existingIds.has(id));

    if (invalidIds.length > 0) {
      return res.status(400).json({ error: '유효하지 않은 유형 ID가 포함되어 있습니다.' });
    }

    await prisma.$transaction(
      typeIds.map((id: string, index: number) =>
        (prisma as any).waitingType.update({
          where: { id },
          data: { sortOrder: index },
        })
      )
    );

    res.json({ success: true, message: '순서가 변경되었습니다.' });
  } catch (error) {
    console.error('Waiting type reorder error:', error);
    res.status(500).json({ error: '순서 변경 중 오류가 발생했습니다.' });
  }
});

export default router;
