import { prisma } from '../lib/prisma.js';

/**
 * 고객 설문 — 척도형(SCALE) 설정과 답변 저장 공용 로직.
 * 공개 API(routes/taghere/survey.ts)와 V2 웹훅(routes/taghere-post-accrual-webhook.ts)이 같이 쓴다.
 */

export const SCALE_MIN = 1;
export const SCALE_MAX = 5;

export interface ScaleConfig {
  min: number;
  max: number;
  minLabel: string;
  maxLabel: string;
}

export const DEFAULT_SCALE_CONFIG: ScaleConfig = {
  min: SCALE_MIN,
  max: SCALE_MAX,
  minLabel: '매우 별로였다',
  maxLabel: '매우 좋았다',
};

/** 저장값/요청값을 신뢰하지 않고 1~5 고정 범위 + 라벨(최대 20자)만 남긴다. */
export function normalizeScaleConfig(input: unknown): ScaleConfig {
  const c = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const label = (v: unknown, fallback: string) => {
    const s = typeof v === 'string' ? v.trim().slice(0, 20) : '';
    return s || fallback;
  };
  return {
    min: SCALE_MIN,
    max: SCALE_MAX,
    minLabel: label(c.minLabel, DEFAULT_SCALE_CONFIG.minLabel),
    maxLabel: label(c.maxLabel, DEFAULT_SCALE_CONFIG.maxLabel),
  };
}

/** "4", 4, "4점" → 4. 범위를 벗어나거나 정수가 아니면 null. */
export function parseScaleValue(value: unknown): number | null {
  const m = String(value ?? '').trim().match(/^(\d{1,2})(?:\s*점)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= SCALE_MIN && n <= SCALE_MAX ? n : null;
}

interface IncomingAnswer {
  questionId?: unknown;
  valueDate?: unknown;
  valueText?: unknown;
}

/**
 * 제출된 답변을 이 매장 질문에 대해서만 upsert 한다.
 * - 다른 매장 질문 ID 는 조용히 버린다
 * - SCALE 은 1~5 정수만 받고, "4" 형태로 정규화해 valueText 에 저장한다 (범위 밖이면 버림)
 * 저장한 답변 수를 돌려준다.
 */
export async function saveSurveyAnswers(
  storeId: string,
  customerId: string,
  answers: IncomingAnswer[]
): Promise<number> {
  const questionIds = answers
    .map((a) => a?.questionId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (questionIds.length === 0) return 0;

  const questions = await prisma.surveyQuestion.findMany({
    where: { id: { in: questionIds }, storeId },
    select: { id: true, type: true },
  });
  const typeById = new Map(questions.map((q) => [q.id, q.type]));

  let saved = 0;
  for (const answer of answers) {
    const questionId = typeof answer?.questionId === 'string' ? answer.questionId : '';
    const type = typeById.get(questionId);
    if (!type) continue;

    let valueDate: Date | null = answer.valueDate ? new Date(String(answer.valueDate)) : null;
    if (valueDate && Number.isNaN(valueDate.getTime())) valueDate = null;
    let valueText: string | null = typeof answer.valueText === 'string' && answer.valueText ? answer.valueText : null;

    if (type === 'SCALE') {
      const score = parseScaleValue(answer.valueText);
      if (score === null) continue;
      valueText = String(score);
      valueDate = null;
    }

    await prisma.surveyAnswer.upsert({
      where: { questionId_customerId: { questionId, customerId } },
      create: { questionId, customerId, storeId, valueDate, valueText },
      update: { valueDate, valueText },
    });
    saved++;
  }
  return saved;
}
