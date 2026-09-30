'use client';

import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { ClipboardList, Download, Inbox } from 'lucide-react';

// 데이터 분석 탭 — "고객 설문 결과 지표" (사장님 CRM·프랜차이즈 공용)
// 응답 목록은 1응답 = 1행. 고객 이름은 서버에서 가운데를 가린 값으로 내려오고 연락처는 포함하지 않는다.

type QType = 'DATE' | 'TEXT' | 'CHOICE' | 'SCALE';

type ScaleBucket = 'negative' | 'neutral' | 'positive';

interface ScaleSummary {
  min: number;
  max: number;
  minLabel: string;
  maxLabel: string;
  average: number | null;
  distribution: { score: number; count: number }[];
  buckets: Record<ScaleBucket, number>;
  previous: { average: number | null; count: number } | null;
  revisit: Record<ScaleBucket, { respondents: number; revisited: number }>;
}

interface QuestionSummary {
  id: string;
  storeId: string;
  storeName: string;
  label: string;
  type: QType;
  enabled: boolean;
  answerCount: number;
  choices?: { label: string; count: number }[];
  scale?: ScaleSummary;
}

interface AnswerRow {
  id: string;
  answeredAt: string;
  storeName: string;
  customerName: string;
  questionLabel: string;
  type: QType;
  answer: string;
  score?: number;
}

interface SurveyResultsData {
  questions: QuestionSummary[];
  rows: AnswerRow[];
  respondentCount: number;
  totalAnswers: number;
  truncated: boolean;
}

const TYPE_LABEL: Record<QType, string> = { DATE: '날짜', TEXT: '텍스트', CHOICE: '선택', SCALE: '척도' };
const PAGE_SIZE = 20;

const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(
    d.getHours()
  ).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function SurveyResults({
  url,
  tokenKey,
  showStore = false,
  fileLabel,
  emptyAction,
}: {
  /** 조회 API 전체 URL (쿼리 포함) */
  url: string;
  /** localStorage 토큰 키 ('token' | 'franchiseToken') */
  tokenKey: string;
  /** 매장 칸 표시 (프랜차이즈) */
  showStore?: boolean;
  /** 엑셀 파일명에 붙일 라벨 */
  fileLabel: string;
  /** 응답이 없을 때 보여줄 이동 링크 (사장님: 고객 설문 설정) */
  emptyAction?: { href: string; label: string };
}) {
  const [data, setData] = useState<SurveyResultsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [questionFilter, setQuestionFilter] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    let alive = true;
    setIsLoading(true);
    setError(false);
    const token = localStorage.getItem(tokenKey);
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: SurveyResultsData) => {
        if (!alive) return;
        setData(d);
        setPage(1);
      })
      .catch(() => alive && setError(true))
      .finally(() => alive && setIsLoading(false));
    return () => {
      alive = false;
    };
  }, [url, tokenKey]);

  const filteredRows = useMemo(() => {
    if (!data) return [];
    if (!questionFilter) return data.rows;
    const q = data.questions.find((x) => x.id === questionFilter);
    return q ? data.rows.filter((r) => r.questionLabel === q.label && (!showStore || r.storeName === q.storeName)) : data.rows;
  }, [data, questionFilter, showStore]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pageRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleExport = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();
    const answerSheet = data.rows.map((r) => ({
      응답일시: fmtDateTime(r.answeredAt),
      ...(showStore ? { 매장: r.storeName } : {}),
      고객: r.customerName,
      질문: r.questionLabel,
      유형: TYPE_LABEL[r.type],
      답변: r.answer,
    }));
    const summarySheet = data.questions.flatMap((q): Record<string, unknown>[] => {
      const base = { ...(showStore ? { 매장: q.storeName } : {}), 질문: q.label, 유형: TYPE_LABEL[q.type], 응답수: q.answerCount };
      if (q.type === 'SCALE' && q.scale) {
        const sc = q.scale;
        return sc.distribution.map((d) => ({
          ...base,
          평균: sc.average ?? '',
          선택지: `${d.score}점${d.score === sc.min ? ` (${sc.minLabel})` : d.score === sc.max ? ` (${sc.maxLabel})` : ''}`,
          선택수: d.count,
          비율: q.answerCount ? `${((d.count / q.answerCount) * 100).toFixed(1)}%` : '0%',
        }));
      }
      if (q.type === 'CHOICE' && q.choices?.length) {
        return q.choices.map((c) => ({
          ...base,
          선택지: c.label,
          선택수: c.count,
          비율: q.answerCount ? `${((c.count / q.answerCount) * 100).toFixed(1)}%` : '0%',
        }));
      }
      return [{ ...base, 선택지: '', 선택수: '', 비율: '' }];
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(answerSheet.length ? answerSheet : [{ 안내: '응답이 없습니다' }]), '응답 목록');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summarySheet.length ? summarySheet : [{ 안내: '설문 질문이 없습니다' }]), '질문별 요약');
    XLSX.writeFile(wb, `고객설문결과_${fileLabel}.xlsx`);
  };

  const hasAnswers = !!data && data.totalAnswers > 0;

  return (
    <section className="adm-card p-5">
      {/* 헤더 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <ClipboardList className="mt-0.5 h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
          <div>
            <h2 className="text-[14px] font-semibold tracking-[-0.015em] text-[color:var(--ad-ink)]">고객 설문 결과 지표</h2>
            <p className="mt-0.5 text-[12px] text-[color:var(--ad-faint)]">
              {showStore ? '가맹점별 고객 설문 질문과 답변' : '고객 설문 질문과 답변'} · 고객 이름은 일부 가려서 표시
            </p>
          </div>
        </div>
        <button
          onClick={handleExport}
          disabled={!hasAnswers}
          className="adm-press inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-white px-3.5 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" strokeWidth={1.8} />
          엑셀 다운로드
        </button>
      </div>

      {isLoading ? (
        <div className="mt-5 space-y-3">
          <div className="adm-skel h-16 w-full" />
          <div className="adm-skel h-40 w-full" />
        </div>
      ) : error ? (
        <div className="mt-5 rounded-[12px] bg-[#fff2f5] px-4 py-3 text-[13px] text-[color:var(--ad-neg)]">
          고객 설문 결과를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.
        </div>
      ) : !hasAnswers ? (
        <div className="mt-5 flex flex-col items-center justify-center gap-2 rounded-[12px] bg-[color:var(--ad-bg-alt)] py-10 text-center">
          <Inbox className="h-5 w-5 text-[color:var(--ad-faint)]" strokeWidth={1.7} />
          <p className="text-[13.5px] font-medium text-[color:var(--ad-ink-2)]">이 기간에 받은 설문 응답이 없어요</p>
          <p className="text-[12.5px] text-[color:var(--ad-faint)]">
            {data && data.questions.length === 0 ? '설정된 설문 질문이 없습니다.' : '포인트·스탬프 적립 시 고객 설문 응답이 모입니다.'}
          </p>
          {emptyAction && (
            <a
              href={emptyAction.href}
              className="adm-press mt-2 inline-flex h-9 items-center rounded-[10px] bg-white px-3.5 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
            >
              {emptyAction.label}
            </a>
          )}
        </div>
      ) : (
        <>
          {/* 요약 숫자 */}
          <div className="mt-5 grid grid-cols-3 rounded-[12px] border border-[color:var(--ad-line)]">
            {[
              ['응답 고객', data!.respondentCount, '명'],
              ['응답 수', data!.totalAnswers, '건'],
              ['설문 질문', data!.questions.length, '개'],
            ].map(([label, v, u], k) => (
              <div key={label as string} className={`px-4 py-3 ${k > 0 ? 'border-l border-[color:var(--ad-line)]' : ''}`}>
                <p className="text-[12px] text-[color:var(--ad-muted)]">{label}</p>
                <p className="mt-0.5 text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)] adm-tnum">
                  {(v as number).toLocaleString('ko-KR')}
                  <span className="ml-0.5 text-[12.5px] text-[color:var(--ad-muted)]">{u}</span>
                </p>
              </div>
            ))}
          </div>
          {data!.truncated && (
            <p className="mt-2 text-[12px] text-[color:var(--ad-faint)]">응답이 많아 최근 20,000건까지만 표시·다운로드됩니다.</p>
          )}

          {/* 질문별 요약 */}
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {data!.questions.map((q) => {
              const max = Math.max(1, ...(q.choices || []).map((c) => c.count));
              const recent = q.type === 'TEXT' ? data!.rows.filter((r) => r.questionLabel === q.label && (!showStore || r.storeName === q.storeName)).slice(0, 3) : [];
              if (q.type === 'SCALE' && q.scale) {
                const lowRows = data!.rows
                  .filter((r) => r.questionLabel === q.label && (!showStore || r.storeName === q.storeName) && (r.score ?? 99) <= 2)
                  .slice(0, 3);
                return <ScaleCard key={q.id} q={q} scale={q.scale} showStore={showStore} lowRows={lowRows} />;
              }
              return (
                <div key={q.id} className="rounded-[12px] border border-[color:var(--ad-line)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {showStore && <p className="mb-0.5 truncate text-[11.5px] text-[color:var(--ad-faint)]">{q.storeName}</p>}
                      <p className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">{q.label}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {!q.enabled && (
                        <span className="rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-faint)]">비활성</span>
                      )}
                      <span className="rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">
                        {TYPE_LABEL[q.type]}
                      </span>
                    </div>
                  </div>
                  <p className="mt-1 text-[12px] text-[color:var(--ad-muted)] adm-tnum">응답 {q.answerCount.toLocaleString('ko-KR')}건</p>

                  {q.type === 'CHOICE' && q.choices && q.choices.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {q.choices.map((c) => (
                        <li key={c.label} className="grid grid-cols-[minmax(0,110px)_minmax(0,1fr)_64px] items-center gap-3 text-[12.5px]">
                          <span className="truncate text-[color:var(--ad-ink-2)]">{c.label}</span>
                          <span className="h-1.5 overflow-hidden rounded-full bg-[color:var(--ad-bg)]">
                            <span
                              className="block h-full rounded-full"
                              style={{ width: `${(c.count / max) * 100}%`, background: c.count === max ? '#6eadff' : '#a5ccff' }}
                            />
                          </span>
                          <span className="text-right text-[color:var(--ad-muted)] adm-tnum">
                            {q.answerCount ? Math.round((c.count / q.answerCount) * 100) : 0}%
                            <span className="ml-1 text-[11px] text-[color:var(--ad-faint)]">{c.count}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {q.type === 'TEXT' && recent.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {recent.map((r) => (
                        <li key={r.id} className="truncate rounded-[8px] bg-[color:var(--ad-bg-alt)] px-2.5 py-1.5 text-[12.5px] text-[color:var(--ad-ink-2)]">
                          {r.answer}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>

          {/* 응답 목록 표 */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13.5px] font-semibold text-[color:var(--ad-ink)]">응답 목록</p>
            <select
              value={questionFilter}
              onChange={(e) => {
                setQuestionFilter(e.target.value);
                setPage(1);
              }}
              className="h-9 max-w-full rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13px] text-[color:var(--ad-ink)] focus:border-[color:var(--ad-ink)] focus:outline-none"
            >
              <option value="">전체 질문</option>
              {data!.questions.map((q) => (
                <option key={q.id} value={q.id}>
                  {showStore ? `[${q.storeName}] ` : ''}
                  {q.label}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-3 overflow-x-auto rounded-[12px] border border-[color:var(--ad-line)]">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr className="border-b border-[color:var(--ad-line)] bg-[color:var(--ad-bg-alt)] text-left text-[11.5px] text-[color:var(--ad-muted)]">
                  <th className="whitespace-nowrap px-4 py-2.5 font-medium">응답일시</th>
                  {showStore && <th className="px-3 py-2.5 font-medium">매장</th>}
                  <th className="px-3 py-2.5 font-medium">고객</th>
                  <th className="px-3 py-2.5 font-medium">질문</th>
                  <th className="px-4 py-2.5 font-medium">답변</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--ad-line)]">
                {pageRows.map((r) => (
                  <tr key={r.id} className="hover:bg-[color:var(--ad-bg-alt)]">
                    <td className="whitespace-nowrap px-4 py-2.5 text-[color:var(--ad-muted)] adm-tnum">{fmtDateTime(r.answeredAt)}</td>
                    {showStore && <td className="whitespace-nowrap px-3 py-2.5 text-[color:var(--ad-ink-2)]">{r.storeName}</td>}
                    <td className="whitespace-nowrap px-3 py-2.5 text-[color:var(--ad-ink-2)]">{r.customerName}</td>
                    <td className="px-3 py-2.5 text-[color:var(--ad-ink-2)]">{r.questionLabel}</td>
                    <td className="px-4 py-2.5 text-[color:var(--ad-ink)]">{r.answer}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pageCount > 1 && (
            <div className="mt-3 flex items-center justify-end gap-2 text-[12.5px] text-[color:var(--ad-muted)]">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="adm-press h-8 rounded-[8px] bg-white px-3 shadow-[inset_0_0_0_1px_var(--ad-line-strong)] disabled:opacity-40"
              >
                이전
              </button>
              <span className="adm-tnum">
                {page} / {pageCount}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={page === pageCount}
                className="adm-press h-8 rounded-[8px] bg-white px-3 shadow-[inset_0_0_0_1px_var(--ad-line-strong)] disabled:opacity-40"
              >
                다음
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

// 척도형 결과 카드 — 평균·이전 기간 대비·분포·긍정/부정 비율·점수대별 재방문율·최근 낮은 점수
function ScaleCard({
  q,
  scale,
  showStore,
  lowRows,
}: {
  q: QuestionSummary;
  scale: ScaleSummary;
  showStore: boolean;
  lowRows: AnswerRow[];
}) {
  const total = q.answerCount;
  const maxCount = Math.max(1, ...scale.distribution.map((d) => d.count));
  const prev = scale.previous;
  const delta =
    scale.average !== null && prev && prev.average !== null && prev.count > 0
      ? Math.round((scale.average - prev.average) * 100) / 100
      : null;
  const bucketMeta: { key: ScaleBucket; label: string; color: string }[] = [
    { key: 'positive', label: `긍정 (4~${scale.max}점)`, color: '#6eadff' },
    { key: 'neutral', label: '보통 (3점)', color: '#c9d3de' },
    { key: 'negative', label: `부정 (${scale.min}~2점)`, color: '#ff8a9a' },
  ];
  const rv = scale.revisit;
  const hasRevisit = rv.positive.respondents + rv.negative.respondents + rv.neutral.respondents > 0;

  return (
    <div className="rounded-[12px] border border-[color:var(--ad-line)] p-4 md:col-span-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {showStore && <p className="mb-0.5 truncate text-[11.5px] text-[color:var(--ad-faint)]">{q.storeName}</p>}
          <p className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">{q.label}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {!q.enabled && (
            <span className="rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-faint)]">비활성</span>
          )}
          <span className="rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">척도</span>
        </div>
      </div>

      <div className="mt-4 grid gap-5 md:grid-cols-[180px_minmax(0,1fr)_minmax(0,1fr)]">
        {/* 평균 점수 */}
        <div>
          <p className="text-[12px] text-[color:var(--ad-muted)]">평균 점수</p>
          <p className="mt-0.5 text-[28px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)] adm-tnum">
            {scale.average !== null ? scale.average.toFixed(1) : '-'}
            <span className="ml-1 text-[13px] text-[color:var(--ad-muted)]">/ {scale.max}</span>
          </p>
          <p className="text-[12px] text-[color:var(--ad-muted)] adm-tnum">응답 {total.toLocaleString('ko-KR')}건</p>
          {prev && (
            <p className="mt-1.5 text-[12px] adm-tnum">
              {delta === null ? (
                <span className="text-[color:var(--ad-faint)]">이전 기간 응답 없음</span>
              ) : (
                <>
                  <span className={delta > 0 ? 'text-[#2f7de1]' : delta < 0 ? 'text-[color:var(--ad-neg)]' : 'text-[color:var(--ad-muted)]'}>
                    {delta > 0 ? '▲' : delta < 0 ? '▼' : '–'} {Math.abs(delta).toFixed(2)}
                  </span>
                  <span className="ml-1 text-[color:var(--ad-faint)]">이전 기간 {prev.average!.toFixed(1)}점</span>
                </>
              )}
            </p>
          )}
        </div>

        {/* 점수 분포 */}
        <div>
          <p className="text-[12px] text-[color:var(--ad-muted)]">점수 분포</p>
          <ul className="mt-2 space-y-1.5">
            {[...scale.distribution].reverse().map((d) => (
              <li key={d.score} className="grid grid-cols-[34px_minmax(0,1fr)_64px] items-center gap-2.5 text-[12.5px]">
                <span className="text-[color:var(--ad-ink-2)] adm-tnum">{d.score}점</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-[color:var(--ad-bg)]">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${(d.count / maxCount) * 100}%`, background: d.count === maxCount ? '#6eadff' : '#a5ccff' }}
                  />
                </span>
                <span className="text-right text-[color:var(--ad-muted)] adm-tnum">
                  {pct(d.count, total)}%<span className="ml-1 text-[11px] text-[color:var(--ad-faint)]">{d.count}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-[color:var(--ad-faint)]">
            {scale.max}점 {scale.maxLabel} · {scale.min}점 {scale.minLabel}
          </p>
        </div>

        {/* 긍정/부정 비율 */}
        <div>
          <p className="text-[12px] text-[color:var(--ad-muted)]">긍정 · 부정 비율</p>
          <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-[color:var(--ad-bg)]">
            {bucketMeta.map((b) =>
              scale.buckets[b.key] > 0 ? (
                <span key={b.key} style={{ width: `${pct(scale.buckets[b.key], total)}%`, background: b.color }} />
              ) : null
            )}
          </div>
          <ul className="mt-2.5 space-y-1 text-[12.5px]">
            {bucketMeta.map((b) => (
              <li key={b.key} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[color:var(--ad-ink-2)]">
                  <span className="h-2 w-2 rounded-full" style={{ background: b.color }} />
                  {b.label}
                </span>
                <span className="text-[color:var(--ad-muted)] adm-tnum">
                  {pct(scale.buckets[b.key], total)}%<span className="ml-1 text-[11px] text-[color:var(--ad-faint)]">{scale.buckets[b.key]}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* 점수대별 재방문율 */}
      {hasRevisit && (
        <div className="mt-5 rounded-[10px] bg-[color:var(--ad-bg-alt)] px-4 py-3">
          <p className="text-[12.5px] font-medium text-[color:var(--ad-ink)]">응답 후 재방문율</p>
          <p className="mt-0.5 text-[11.5px] text-[color:var(--ad-faint)]">
            응답한 뒤 다시 방문(주문·적립)한 고객 비율 · 최근 응답은 아직 재방문할 시간이 짧아 낮게 나올 수 있어요
          </p>
          <div className="mt-2.5 grid grid-cols-3 gap-3">
            {bucketMeta.map((b) => {
              const r = rv[b.key];
              return (
                <div key={b.key}>
                  <p className="text-[11.5px] text-[color:var(--ad-muted)]">{b.label}</p>
                  <p className="text-[17px] font-medium text-[color:var(--ad-ink)] adm-tnum">
                    {r.respondents > 0 ? `${pct(r.revisited, r.respondents)}%` : '-'}
                  </p>
                  <p className="text-[11px] text-[color:var(--ad-faint)] adm-tnum">
                    {r.revisited.toLocaleString('ko-KR')} / {r.respondents.toLocaleString('ko-KR')}명
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 최근 낮은 점수 */}
      {lowRows.length > 0 && (
        <div className="mt-4">
          <p className="text-[12px] text-[color:var(--ad-muted)]">최근 낮은 점수 응답</p>
          <ul className="mt-1.5 space-y-1.5">
            {lowRows.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-[8px] bg-[#fff2f5] px-2.5 py-1.5 text-[12.5px] text-[color:var(--ad-ink-2)]"
              >
                <span className="truncate">
                  {r.customerName}
                  {showStore && <span className="ml-1 text-[color:var(--ad-faint)]">· {r.storeName}</span>}
                </span>
                <span className="shrink-0 text-[color:var(--ad-neg)] adm-tnum">
                  {r.answer} <span className="ml-1 text-[color:var(--ad-faint)]">{fmtDateTime(r.answeredAt).slice(0, 10)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
