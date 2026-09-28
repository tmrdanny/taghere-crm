import { prisma } from '../lib/prisma.js';

/**
 * 고객 설문 결과 — 데이터 분석 탭의 "고객 설문 결과 지표" 섹션용.
 * 매장(또는 프랜차이즈 소속 매장들)의 설문 질문별 요약과 응답 목록(1응답 = 1행)을 돌려준다.
 *
 * 개인정보: 고객 이름은 가운데를 가리고, 연락처는 포함하지 않는다.
 */

const MAX_ROWS = 20000;

export interface SurveyQuestionSummary {
  id: string;
  storeId: string;
  storeName: string;
  label: string;
  type: 'DATE' | 'TEXT' | 'CHOICE';
  enabled: boolean;
  answerCount: number;
  /** CHOICE: 선택지별 응답 수 (설정된 선택지 순서 + 그 외 응답) */
  choices?: { label: string; count: number }[];
}

export interface SurveyAnswerRow {
  id: string;
  answeredAt: string; // ISO
  storeName: string;
  customerName: string;
  questionLabel: string;
  type: 'DATE' | 'TEXT' | 'CHOICE';
  answer: string;
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
      select: { id: true, storeId: true, label: true, type: true, enabled: true, choiceOptions: true },
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
    rows.push({
      id: a.id,
      answeredAt: a.updatedAt.toISOString(),
      storeName: storeName.get(a.storeId) || '',
      customerName: maskName(a.customer?.name ?? null),
      questionLabel: q.label,
      type: q.type,
      answer: text,
    });
  }

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
