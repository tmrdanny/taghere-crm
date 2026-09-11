import { Router, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { webhookAuthMiddleware, WebhookRequest } from '../middleware/webhook-auth.js';
import { findStoreByV2Ref } from '../services/store-ref.js';
import { isVisitSourceRecent } from '../services/stamps.js';

const router = Router();

/**
 * V2 인앱 적립 후속 프로세스(방문 경로 + 설문 + 별점) 웹훅.
 *
 * CRM 호스팅 enroll 페이지의 후속 시퀀스를 주문 서비스 안에서 재현하기 위한 V2 전용 표면.
 * 공개 by-slug API(routes/taghere/survey.ts, routes/customers.ts)와 같은 데이터를 다루지만,
 * 여기서는 customer 가 해당 매장 소속인지까지 검증한다(웹훅 토큰 + 소속 검증).
 */

interface VisitSourceOptionRow {
  id: string;
  label: string;
  order: number;
  enabled: boolean;
}

/** 매장 해석 + 고객 소속 검증 공통부. 실패 시 응답을 직접 쓰고 null 반환. */
async function resolveStoreAndCustomer(
  endpoint: string,
  req: WebhookRequest,
  res: Response,
) {
  const { storeId, storeSlug, customerId } = req.body || {};

  if ((!storeId && !storeSlug) || !customerId) {
    res.status(400).json({
      success: false,
      error: 'missing_params',
      message: 'storeId(또는 storeSlug)와 customerId가 필요합니다.',
    });
    return null;
  }

  const store = await findStoreByV2Ref(endpoint, { storeId, storeSlug }, {
    id: true,
    visitSourceSetting: true,
  });

  if (!store) {
    res.status(404).json({
      success: false,
      error: 'store_not_found',
      message: '매장을 찾을 수 없습니다.',
    });
    return null;
  }

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, storeId: true, visitSourceUpdatedAt: true },
  });

  // 타 매장 고객 여부를 노출하지 않도록 미존재와 동일하게 404 로 응답한다
  if (!customer || customer.storeId !== store.id) {
    res.status(404).json({
      success: false,
      error: 'customer_not_found',
      message: '고객을 찾을 수 없습니다.',
    });
    return null;
  }

  return { store, customer };
}

/**
 * POST /api/taghere/webhook/post-accrual/info
 *
 * 적립 직후 후속 스텝 노출 여부 판단용 조회.
 * - visitSource.pending: 기능 활성 + 노출 옵션 존재 + 최근 24시간 내 미응답(isVisitSourceRecent)
 * - surveyQuestions: 이 고객이 아직 답하지 않은 활성 질문만 (답변은 질문당 1개 upsert)
 */
router.post('/info', webhookAuthMiddleware, async (req: WebhookRequest, res) => {
  try {
    const resolved = await resolveStoreAndCustomer('post-accrual/info', req, res);
    if (!resolved) return;
    const { store, customer } = resolved;

    let visitSourcePending = false;
    let visitSourceOptions: { id: string; label: string }[] = [];

    if (store.visitSourceSetting?.enabled) {
      const allOptions = (store.visitSourceSetting.options as unknown as VisitSourceOptionRow[]) || [];
      visitSourceOptions = allOptions
        .filter(o => o.enabled)
        .sort((a, b) => a.order - b.order)
        .map(o => ({ id: o.id, label: o.label }));
      visitSourcePending =
        visitSourceOptions.length > 0 && !isVisitSourceRecent(customer.visitSourceUpdatedAt);
    }

    const surveyQuestions = await prisma.surveyQuestion.findMany({
      where: {
        storeId: store.id,
        enabled: true,
        answers: { none: { customerId: customer.id } },
      },
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

    res.json({
      success: true,
      visitSource: {
        pending: visitSourcePending,
        options: visitSourcePending ? visitSourceOptions : [],
      },
      surveyQuestions,
    });
  } catch (error: any) {
    console.error('[PostAccrual Webhook] info error:', error);
    res.status(500).json({
      success: false,
      error: 'server_error',
      message: '후속 프로세스 조회 중 오류가 발생했습니다.',
    });
  }
});

/**
 * POST /api/taghere/webhook/post-accrual/submit
 *
 * 후속 스텝 응답 저장. visitSource / 별점(feedback) / surveyAnswers 는 각각 독립적인
 * 부분 쓰기라 FE 가 한 번에 묶어 보내든 나눠 보내든 동일하게 동작한다.
 */
router.post('/submit', webhookAuthMiddleware, async (req: WebhookRequest, res) => {
  try {
    const resolved = await resolveStoreAndCustomer('post-accrual/submit', req, res);
    if (!resolved) return;
    const { store, customer } = resolved;

    const { visitSource, feedbackRating, feedbackText, surveyAnswers } = req.body || {};

    if (feedbackRating !== undefined && feedbackRating !== null) {
      if (!Number.isInteger(feedbackRating) || feedbackRating < 1 || feedbackRating > 5) {
        return res.status(400).json({
          success: false,
          error: 'invalid_rating',
          message: '별점은 1~5 사이의 정수여야 합니다.',
        });
      }
    }

    if (visitSource && typeof visitSource === 'string') {
      // 공개 API(customers.ts /visit-source)와 동일: 기존 값이 있어도 덮어쓰고 응답 시각을 기록
      await prisma.customer.update({
        where: { id: customer.id },
        data: { visitSource, visitSourceUpdatedAt: new Date() },
      });
    }

    if (feedbackRating || feedbackText) {
      // 공개 API(customers.ts /feedback)와 동일: 이력 누적 + Customer 최신값 갱신
      await prisma.customerFeedback.create({
        data: {
          customerId: customer.id,
          rating: feedbackRating || 0,
          text: feedbackText || null,
        },
      });
      await prisma.customer.update({
        where: { id: customer.id },
        data: {
          feedbackRating: feedbackRating || null,
          feedbackText: feedbackText || null,
          feedbackAt: new Date(),
        },
      });
    }

    if (Array.isArray(surveyAnswers) && surveyAnswers.length > 0) {
      // 공개 API 와 달리 질문이 이 매장 소속인지 검증하고, 아닌 것은 조용히 버린다
      const questionIds = surveyAnswers
        .map((a: any) => a?.questionId)
        .filter((id: any): id is string => typeof id === 'string' && id.length > 0);
      const validQuestions = await prisma.surveyQuestion.findMany({
        where: { id: { in: questionIds }, storeId: store.id },
        select: { id: true },
      });
      const validIds = new Set(validQuestions.map(q => q.id));

      for (const answer of surveyAnswers) {
        if (!answer?.questionId || !validIds.has(answer.questionId)) continue;

        await prisma.surveyAnswer.upsert({
          where: {
            questionId_customerId: {
              questionId: answer.questionId,
              customerId: customer.id,
            },
          },
          create: {
            questionId: answer.questionId,
            customerId: customer.id,
            storeId: store.id,
            valueDate: answer.valueDate ? new Date(answer.valueDate) : null,
            valueText: answer.valueText || null,
          },
          update: {
            valueDate: answer.valueDate ? new Date(answer.valueDate) : null,
            valueText: answer.valueText || null,
          },
        });
      }
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('[PostAccrual Webhook] submit error:', error);
    res.status(500).json({
      success: false,
      error: 'server_error',
      message: '후속 프로세스 저장 중 오류가 발생했습니다.',
    });
  }
});

export default router;
