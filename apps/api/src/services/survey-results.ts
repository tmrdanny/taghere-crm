import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { normalizeScaleConfig, parseScaleValue } from './survey-answers.js';

/**
 * 고객 설문 결과 — 데이터 분석 탭의 "고객 설문 결과 지표" 섹션용.
 * 매장(또는 프랜차이즈 소속 매장들)의 설문 질문별 요약과 응답 목록(1응답 = 1행)을 돌려준다.
 *
 * 개인정보: 고객 이름은 가운데를 가리고, 연락처는 포함하지 않는다.
 */

const MAX_ROWS = 20000;

type QType = 'DATE' | 'TEXT' | 'CHOICE' | 'SCALE';

/** 척도형 점수 구간 — 1~2 부정 / 3 보통 / 4~5 긍정 */
type ScaleBucket = 'negative' | 'neutral' | 'positive';
function scaleBucket(score: number): ScaleBucket {
  if (score >= 4) return 'positive';
  if (score <= 2) return 'negative';
  return 'neutral';
}

export interface ScaleSummary {
  min: number;
  max: number;
  minLabel: string;
  maxLabel: string;
  /** 평균 점수 (응답 없으면 null) */
  average: number | null;
  /** 점수별 응답 수 (min~max 전부 포함) */
  distribution: { score: number; count: number }[];
  /** 구간별 응답 수 */
  buckets: Record<ScaleBucket, number>;
  /** 직전 같은 길이 기간의 평균/응답 수 (기간을 지정했을 때만) */
  previous: { average: number | null; count: number } | null;
  /** 응답 이후 재방문 — 구간별 응답 고객 수와 그중 다시 방문한 수 */
  revisit: Record<ScaleBucket, { respondents: number; revisited: number }>;
}

export interface SurveyQuestionSummary {
  id: string;
  storeId: string;
  storeName: string;
  label: string;
  type: QType;
  enabled: boolean;
  answerCount: number;
  /** CHOICE: 선택지별 응답 수 (설정된 선택지 순서 + 그 외 응답) */
  choices?: { label: string; count: number }[];
  /** SCALE: 평균·분포·구간·이전 기간 비교·재방문 */
  scale?: ScaleSummary;
}

export interface SurveyAnswerRow {
  id: string;
  answeredAt: string; // ISO
  storeName: string;
  customerName: string;
  questionLabel: string;
  type: QType;
  answer: string;
  /** SCALE: 점수 */
  score?: number;
}

export interface SurveyResults {
  questions: SurveyQuestionSummary[];
  rows: SurveyAnswerRow[];
  respondentCount: number;
  totalAnswers: number;
  truncated: boolean;
}

function maskName(name: string | null): string {
  if (!name) return '익명';
  const s = name.trim();
  if (s.length <= 1) return s || '익명';
  if (s.length === 2) return s[0] + '*';
  return s[0] + '*'.repeat(s.length - 2) + s[s.length - 1];
}

// KST 기준 YYYY-MM-DD
function kstDate(d: Date): string {
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function answerText(a: { valueDate: Date | null; valueText: string | null; valueJson: unknown }, type: string): string {
  if (type === 'SCALE') {
    const score = parseScaleValue(a.valueText);
    return score === null ? '' : `${score}점`;
  }
  if (type === 'DATE' && a.valueDate) return kstDate(a.valueDate);
  if (a.valueText && a.valueText.trim()) return a.valueText.trim();
  if (a.valueJson !== null && a.valueJson !== undefined) {
    return Array.isArray(a.valueJson) ? a.valueJson.join(', ') : String(a.valueJson);
  }
  if (a.valueDate) return kstDate(a.valueDate);
  return '';
}

/** range: KST 기준 'YYYY-MM-DD' 시작/종료일 (둘 다 선택, 없으면 전체 기간) */
export async function computeSurveyResults(
  storeIds: string[],
  range: { startDate?: string; endDate?: string } = {}
): Promise<SurveyResults> {
  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (range.startDate && /^\d{4}-\d{2}-\d{2}$/.test(range.startDate)) dateFilter.gte = new Date(`${range.startDate}T00:00:00+09:00`);
  if (range.endDate && /^\d{4}-\d{2}-\d{2}$/.test(range.endDate)) dateFilter.lte = new Date(`${range.endDate}T23:59:59.999+09:00`);

  const [stores, questions] = await Promise.all([
    prisma.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true } }),
    prisma.surveyQuestion.findMany({
      where: { storeId: { in: storeIds } },
      orderBy: [{ storeId: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, storeId: true, label: true, type: true, enabled: true, choiceOptions: true, scaleConfig: true },
    }),
  ]);
  const storeName = new Map(stores.map((s) => [s.id, s.name]));
  const questionById = new Map(questions.map((q) => [q.id, q]));

  const answers = await prisma.surveyAnswer.findMany({
    where: { storeId: { in: storeIds }, ...(dateFilter.gte || dateFilter.lte ? { updatedAt: dateFilter } : {}) },
    orderBy: { updatedAt: 'desc' },
    take: MAX_ROWS + 1,
    select: {
      id: true,
      questionId: true,
      customerId: true,
      storeId: true,
      valueDate: true,
      valueText: true,
      valueJson: true,
      updatedAt: true,
      customer: { select: { name: true } },
    },
  });
  const truncated = answers.length > MAX_ROWS;
  const list = truncated ? answers.slice(0, MAX_ROWS) : answers;

  // 질문별 집계
  const countByQuestion = new Map<string, number>();
  const choiceCounts = new Map<string, Map<string, number>>();
  const scaleScores = new Map<string, number[]>();
  const respondents = new Set<string>();
  const rows: SurveyAnswerRow[] = [];

  for (const a of list) {
    const q = questionById.get(a.questionId);
    if (!q) continue;
    const text = answerText(a, q.type);
    if (!text) continue;
    respondents.add(a.customerId);
    countByQuestion.set(q.id, (countByQuestion.get(q.id) || 0) + 1);
    if (q.type === 'CHOICE') {
      const m = choiceCounts.get(q.id) || new Map<string, number>();
      // 다중 선택이 콤마로 저장된 경우도 각각 집계
      for (const part of text.split(',').map((s) => s.trim()).filter(Boolean)) {
        m.set(part, (m.get(part) || 0) + 1);
      }
      choiceCounts.set(q.id, m);
    }
    const score = q.type === 'SCALE' ? parseScaleValue(a.valueText) : null;
    if (score !== null) {
      const list = scaleScores.get(q.id) || [];
      list.push(score);
      scaleScores.set(q.id, list);
    }
    rows.push({
      id: a.id,
      answeredAt: a.updatedAt.toISOString(),
      storeName: storeName.get(a.storeId) || '',
      customerName: maskName(a.customer?.name ?? null),
      questionLabel: q.label,
      type: q.type,
      answer: text,
      ...(score !== null ? { score } : {}),
    });
  }

  const scaleQuestionIds = questions.filter((q) => q.type === 'SCALE').map((q) => q.id);
  const [previousByQuestion, revisitByQuestion] = scaleQuestionIds.length
    ? await Promise.all([
        computePreviousScale(scaleQuestionIds, range),
        computeScaleRevisit(scaleQuestionIds, dateFilter),
      ])
    : [new Map(), new Map()];

  const summaries: SurveyQuestionSummary[] = questions.map((q) => {
    const base: SurveyQuestionSummary = {
      id: q.id,
      storeId: q.storeId,
      storeName: storeName.get(q.storeId) || '',
      label: q.label,
      type: q.type,
      enabled: q.enabled,
      answerCount: countByQuestion.get(q.id) || 0,
    };
    if (q.type === 'CHOICE') {
      const counted = choiceCounts.get(q.id) || new Map<string, number>();
      const options = Array.isArray(q.choiceOptions) ? (q.choiceOptions as unknown[]).map(String) : [];
      const choices = options.map((label) => ({ label, count: counted.get(label) || 0 }));
      for (const [label, count] of counted) {
        if (!options.includes(label)) choices.push({ label, count });
      }
      base.choices = choices;
    }
    if (q.type === 'SCALE') {
      const cfg = normalizeScaleConfig(q.scaleConfig);
      const scores = scaleScores.get(q.id) || [];
      const buckets: Record<ScaleBucket, number> = { negative: 0, neutral: 0, positive: 0 };
      for (const sc of scores) buckets[scaleBucket(sc)]++;
      base.scale = {
        min: cfg.min,
        max: cfg.max,
        minLabel: cfg.minLabel,
        maxLabel: cfg.maxLabel,
        average: average(scores),
        distribution: Array.from({ length: cfg.max - cfg.min + 1 }, (_, i) => {
          const score = cfg.min + i;
          return { score, count: scores.filter((x) => x === score).length };
        }),
        buckets,
        previous: previousByQuestion.get(q.id) ?? (range.startDate && range.endDate ? { average: null, count: 0 } : null),
        revisit: revisitByQuestion.get(q.id) ?? emptyRevisit(),
      };
    }
    return base;
  });

  return {
    questions: summaries,
    rows,
    respondentCount: respondents.size,
    totalAnswers: rows.length,
    truncated,
  };
}

function average(scores: number[]): number | null {
  if (scores.length === 0) return null;
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100;
}

function emptyRevisit(): ScaleSummary['revisit'] {
  return {
    negative: { respondents: 0, revisited: 0 },
    neutral: { respondents: 0, revisited: 0 },
    positive: { respondents: 0, revisited: 0 },
  };
}

/**
 * 직전 같은 길이 기간의 척도 평균 (기간 비교용).
 * 시작·종료일이 모두 있을 때만 계산한다 — 전체 기간 조회는 비교 대상이 없다.
 */
async function computePreviousScale(
  questionIds: string[],
  range: { startDate?: string; endDate?: string }
): Promise<Map<string, { average: number | null; count: number }>> {
  const out = new Map<string, { average: number | null; count: number }>();
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!range.startDate || !range.endDate || !re.test(range.startDate) || !re.test(range.endDate)) return out;

  const start = new Date(`${range.startDate}T00:00:00+09:00`);
  const end = new Date(`${range.endDate}T23:59:59.999+09:00`);
  const lengthMs = end.getTime() - start.getTime() + 1;
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(start.getTime() - lengthMs);

  const prev = await prisma.surveyAnswer.findMany({
    where: { questionId: { in: questionIds }, updatedAt: { gte: prevStart, lte: prevEnd } },
    select: { questionId: true, valueText: true },
  });
  const byQuestion = new Map<string, number[]>();
  for (const a of prev) {
    const score = parseScaleValue(a.valueText);
    if (score === null) continue;
    const list = byQuestion.get(a.questionId) || [];
    list.push(score);
    byQuestion.set(a.questionId, list);
  }
  for (const id of questionIds) {
    const scores = byQuestion.get(id) || [];
    out.set(id, { average: average(scores), count: scores.length });
  }
  return out;
}

/**
 * 응답 이후 재방문 — 점수 구간별로 "응답한 뒤 같은 매장에 다시 방문(주문/적립)한 고객" 비율.
 * 응답은 방문 직후에 받으므로 같은 방문을 재방문으로 세지 않도록 응답 시각 + 1시간 이후 방문만 센다.
 */
async function computeScaleRevisit(
  questionIds: string[],
  dateFilter: { gte?: Date; lte?: Date }
): Promise<Map<string, ScaleSummary['revisit']>> {
  const conds: Prisma.Sql[] = [Prisma.sql`a."questionId" IN (${Prisma.join(questionIds)})`];
  if (dateFilter.gte) conds.push(Prisma.sql`a."updatedAt" >= ${dateFilter.gte}`);
  if (dateFilter.lte) conds.push(Prisma.sql`a."updatedAt" <= ${dateFilter.lte}`);

  const rows = await prisma.$queryRaw<Array<{ questionId: string; valueText: string | null; revisited: boolean }>>`
    SELECT a."questionId", a."valueText",
           EXISTS (
             SELECT 1 FROM visits_orders v
             WHERE v."customerId" = a."customerId"
               AND v."storeId" = a."storeId"
               AND v."visitedAt" > a."updatedAt" + interval '1 hour'
           ) AS revisited
    FROM survey_answers a
    WHERE ${Prisma.join(conds, ' AND ')}`;

  const out = new Map<string, ScaleSummary['revisit']>();
  for (const r of rows) {
    const score = parseScaleValue(r.valueText);
    if (score === null) continue;
    const agg = out.get(r.questionId) || emptyRevisit();
    const b = agg[scaleBucket(score)];
    b.respondents++;
    if (r.revisited) b.revisited++;
    out.set(r.questionId, agg);
  }
  return out;
}
