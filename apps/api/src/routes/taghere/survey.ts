import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';

const router = Router();

// GET /api/taghere/visit-source-options/:slug - 매장의 활성화된 방문 경로 옵션 조회 (공개 API)
router.get('/visit-source-options/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    // 매장 조회
    const store = await prisma.store.findFirst({
      where: { slug },
      select: {
        id: true,
        visitSourceSetting: true,
      },
    });

    if (!store) {
      return res.status(404).json({ error: '매장을 찾을 수 없습니다.' });
    }

    // 설정이 없거나 비활성화된 경우
    if (!store.visitSourceSetting?.enabled) {
      return res.json({
        enabled: false,
        options: [],
      });
    }

    // 활성화된 옵션만 필터링하여 반환
    const allOptions = store.visitSourceSetting.options as Array<{
      id: string;
      label: string;
      order: number;
      enabled: boolean;
    }>;

    const enabledOptions = allOptions
      .filter(o => o.enabled)
      .sort((a, b) => a.order - b.order)
      .map(o => ({ id: o.id, label: o.label }));

    res.json({
      enabled: true,
      options: enabledOptions,
    });
  } catch (error: any) {
    console.error('[TagHere] Visit source options error:', error);
    res.status(500).json({ error: '방문 경로 옵션 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/taghere/survey-questions/:slug - 매장의 활성 설문 질문 목록 (공개)
router.get('/survey-questions/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    const store = await prisma.store.findFirst({
      where: { slug },
      select: { id: true },
    });

    if (!store) {
      return res.json({ questions: [] });
    }

    const questions = await prisma.surveyQuestion.findMany({
      where: { storeId: store.id, enabled: true },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        type: true,
        label: true,
        description: true,
        required: true,
        choiceOptions: true,
      },
    });

    res.json({ questions });
  } catch (error: any) {
    console.error('[TagHere] Survey questions error:', error);
    res.status(500).json({ error: '설문 질문 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/taghere/survey-answers - 설문 답변 저장 (공개)
router.post('/survey-answers', async (req, res) => {
  try {
    const { customerId, answers } = req.body;

    if (!customerId || !Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: '고객 ID와 답변이 필요합니다.' });
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, storeId: true },
    });

    if (!customer) {
      return res.status(404).json({ error: '고객을 찾을 수 없습니다.' });
    }

    for (const answer of answers) {
      if (!answer.questionId) continue;

      await prisma.surveyAnswer.upsert({
        where: {
          questionId_customerId: {
            questionId: answer.questionId,
            customerId,
          },
        },
        create: {
          questionId: answer.questionId,
          customerId,
          storeId: customer.storeId,
          valueDate: answer.valueDate ? new Date(answer.valueDate) : null,
          valueText: answer.valueText || null,
        },
        update: {
          valueDate: answer.valueDate ? new Date(answer.valueDate) : null,
          valueText: answer.valueText || null,
        },
      });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('[TagHere] Survey answers save error:', error);
    res.status(500).json({ error: '설문 답변 저장 중 오류가 발생했습니다.' });
  }
});

export default router;
