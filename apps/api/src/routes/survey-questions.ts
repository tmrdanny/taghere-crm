import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

const MAX_QUESTIONS = 10;

// GET /api/survey-questions - 매장의 설문 질문 목록
router.get('/', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;

    const questions = await prisma.surveyQuestion.findMany({
      where: { storeId },
      orderBy: { order: 'asc' },
      include: {
        _count: { select: { answers: true } },
      },
    });

    res.json(questions);
  } catch (error) {
    console.error('Get survey questions error:', error);
    res.status(500).json({ error: '설문 질문 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/survey-questions - 질문 생성
router.post('/', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { type, label, description, required: isRequired } = req.body;

    if (!type || !label) {
      return res.status(400).json({ error: '질문 타입과 텍스트를 입력해주세요.' });
    }

    const count = await prisma.surveyQuestion.count({ where: { storeId } });
    if (count >= MAX_QUESTIONS) {
      return res.status(400).json({ error: `질문은 최대 ${MAX_QUESTIONS}개까지만 추가할 수 있습니다.` });
    }

    const question = await prisma.surveyQuestion.create({
      data: {
        storeId,
        type,
        label,
        description: description || null,
        required: isRequired ?? false,
        order: count,
      },
    });

    res.json({ question });
  } catch (error) {
    console.error('Create survey question error:', error);
    res.status(500).json({ error: '질문 생성 중 오류가 발생했습니다.' });
  }
});

// PUT /api/survey-questions/:id - 질문 수정
router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { id } = req.params;
    const { label, description, enabled, required: isRequired, order, dateConfig } = req.body;

    const existing = await prisma.surveyQuestion.findFirst({
      where: { id, storeId },
    });

    if (!existing) {
      return res.status(404).json({ error: '질문을 찾을 수 없습니다.' });
    }

    const question = await prisma.surveyQuestion.update({
      where: { id },
      data: {
        ...(label !== undefined && { label }),
        ...(description !== undefined && { description }),
        ...(enabled !== undefined && { enabled }),
        ...(isRequired !== undefined && { required: isRequired }),
        ...(order !== undefined && { order }),
        ...(dateConfig !== undefined && { dateConfig }),
      },
    });

    res.json({ question });
  } catch (error) {
    console.error('Update survey question error:', error);
    res.status(500).json({ error: '질문 수정 중 오류가 발생했습니다.' });
  }
});

// PUT /api/survey-questions/reorder - 질문 순서 변경
router.put('/reorder', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { orderedIds } = req.body;

    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ error: '순서 정보가 필요합니다.' });
    }

    await prisma.$transaction(
      orderedIds.map((id: string, index: number) =>
        prisma.surveyQuestion.updateMany({
          where: { id, storeId },
          data: { order: index },
        })
      )
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Reorder survey questions error:', error);
    res.status(500).json({ error: '순서 변경 중 오류가 발생했습니다.' });
  }
});

// DELETE /api/survey-questions/:id - 질문 삭제
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const storeId = req.user!.storeId;
    const { id } = req.params;

    const existing = await prisma.surveyQuestion.findFirst({
      where: { id, storeId },
    });

    if (!existing) {
      return res.status(404).json({ error: '질문을 찾을 수 없습니다.' });
    }

    await prisma.surveyQuestion.delete({ where: { id } });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete survey question error:', error);
    res.status(500).json({ error: '질문 삭제 중 오류가 발생했습니다.' });
  }
});

export default router;
