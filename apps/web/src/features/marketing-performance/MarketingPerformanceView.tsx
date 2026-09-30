'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Check, Copy, Sparkles } from 'lucide-react';
import { API_BASE } from '@/lib/api-config';
import { cn } from '@/lib/utils';
import { BoosterPerformanceSection } from './BoosterPerformanceSection';

// 마케팅 성과 — 사장님 CRM / 프랜차이즈 CRM 공용 화면
interface Campaign {
  id: string;
  channel: string;
  channelLabel: string;
  title: string;
  targetLabel: string | null;
  sentAt: string;
  recipients: number;
  cost: number;
  couponEnabled: boolean;
  couponIssued: number;
  couponUsed: number;
  couponUseRate: number | null;
  revisited: number;
  revisitRate: number | null;
  revenue: number;
  roi: number | null;
  maturing: boolean;
}
interface Automation { type: string; label: string; enabled: boolean; sent: number; couponUsed: number; revisited: number; revisitRate: number | null; revenue: number }
interface Channel { channel: string; label: string; campaigns: number; recipients: number; revisitRate: number | null; couponUseRate: number | null; costPerRevisit: number | null }
interface Recommendation { id: string; priority: 'high' | 'medium' | 'low'; title: string; body: string; evidence?: string; action?: { label: string; href: string }; copyIdeas?: string[] }
interface Data {
  days: number;
  windowDays: number;
  summary: {
    campaigns: number; recipients: number; cost: number; couponIssued: number; couponUsed: number; couponUseRate: number | null;
    revisited: number; revisitRate: number | null; revenue: number; roi: number | null; baselineRevisitRate: number | null;
  };
  campaigns: Campaign[];
  automation: Automation[];
  channels: Channel[];
  recommendations: Recommendation[];
}

const PERIODS = [30, 90, 180];
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
// KPI 큰 숫자는 만원 단위로 줄여 한 줄에 들어가게
const wonShort = (n: number) => (n >= 100000 ? `${(n / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}만원` : won(n));
const pct = (v: number | null) => (v === null ? '-' : `${v}%`);
const date = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });

function Kpi({ label, value, sub, hint }: { label: string; value: string; sub?: React.ReactNode; hint?: string }) {
  return (
    <div className="adm-card grid content-start gap-1 p-5">
      <span className="text-[12.5px] text-[color:var(--ad-muted)]" title={hint}>{label}</span>
      <span className="adm-tnum text-[26px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">{value}</span>
      {sub && <span className="text-[12px] text-[color:var(--ad-faint)]">{sub}</span>}
    </div>
  );
}

function CopyLine({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-start gap-2 rounded-[10px] bg-[color:var(--ad-bg-alt)] px-3 py-2">
      <p className="flex-1 text-[12.5px] leading-[1.55] text-[color:var(--ad-ink-2)]">{text}</p>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(text).then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          }).catch(() => {});
        }}
        className="flex-none p-1 text-[color:var(--ad-faint)] hover:text-[color:var(--ad-ink)]"
        aria-label="문구 복사"
      >
        {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function Bar({ value, max }: { value: number | null; max: number }) {
  const w = value === null || max <= 0 ? 0 : Math.max(2, (value / max) * 100);
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[color:var(--ad-bg)]">
      <div className="h-full rounded-full bg-[#6eadff]" style={{ width: `${w}%` }} />
    </div>
  );
}

export function MarketingPerformanceView({
  apiUrl,
  tokenKey = 'token',
  sendHref,
  boosterHref,
  franchise = false,
}: {
  apiUrl: string;
  tokenKey?: string;
  sendHref: string;
  /** 플레이스 부스터 관리 화면 */
  boosterHref: string;
  /** 프랜차이즈: 부스터 캠페인에 매장명 표시 */
  franchise?: boolean;
}) {
  const [days, setDays] = useState(90);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch(`${API_BASE}${apiUrl}?days=${days}`, { headers: { Authorization: `Bearer ${localStorage.getItem(tokenKey) || ''}` } });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '불러오지 못했어요');
      setData(d);
    } catch (e: any) {
      setError(e.message);
    }
  }, [apiUrl, days, tokenKey]);

  useEffect(() => {
    load();
  }, [load]);

  const s = data?.summary;
  const lift = s && s.revisitRate !== null && s.baselineRevisitRate !== null ? Math.round((s.revisitRate - s.baselineRevisitRate) * 10) / 10 : null;
  const maxRate = Math.max(1, ...(data?.channels.map((c) => c.revisitRate ?? 0) ?? [0]));

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 sm:px-8 lg:pt-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-[color:var(--ad-ink)]">마케팅 성과</h1>
          <p className="mt-1 text-[13px] text-[color:var(--ad-muted)]">보낸 메시지로 손님이 얼마나 다시 왔는지 봐요 · 발송 후 {data?.windowDays ?? 14}일 기준</p>
        </div>
        <div className="flex rounded-[10px] bg-[color:var(--ad-bg)] p-1" role="tablist" aria-label="기간">
          {PERIODS.map((d) => (
            <button
              key={d}
              role="tab"
              aria-selected={days === d}
              onClick={() => setDays(d)}
              className={cn('rounded-[8px] px-3 py-1.5 text-[12.5px] font-medium', days === d ? 'bg-white text-[color:var(--ad-ink)] shadow-sm' : 'text-[color:var(--ad-muted)]')}
            >
              최근 {d}일
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mb-4 text-[13px] text-[color:var(--ad-neg)]">{error}</p>}

      {!data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="adm-card h-[112px] animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid gap-6">
          {/* KPI */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              label="다시 온 손님"
              value={`${s!.revisited.toLocaleString()}명`}
              sub={
                <>
                  재방문율 {pct(s!.revisitRate)}
                  {lift !== null && (
                    <span className={cn('ml-1', lift > 0 ? 'text-[color:var(--ad-pos)]' : 'text-[color:var(--ad-muted)]')}>
                      · 평소보다 {lift > 0 ? `+${lift}` : lift}%p
                    </span>
                  )}
                </>
              }
              hint="발송 후 14일 안에 방문한 손님 (집계가 끝난 캠페인 기준)"
            />
            <Kpi label="쿠폰 사용 (직원 확인)" value={`${s!.couponUsed.toLocaleString()}장`} sub={`사용률 ${pct(s!.couponUseRate)} · ${s!.couponIssued.toLocaleString()}장 발급`} />
            <Kpi label="재방문 매출" value={wonShort(s!.revenue)} sub={s!.roi !== null ? `비용 대비 ${s!.roi}배` : '비용 없음'} hint="메시지를 받은 손님이 발송 후 14일 안에 결제한 금액" />
            <Kpi label="마케팅 비용" value={wonShort(s!.cost)} sub={`캠페인 ${s!.campaigns}개 · ${s!.recipients.toLocaleString()}명에게 발송`} />
          </div>

          {/* 추천 */}
          <section className="adm-card p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[color:var(--ad-ink)]" strokeWidth={1.8} />
              <h2 className="text-[15px] font-semibold text-[color:var(--ad-ink)]">다음 캠페인 추천</h2>
              <span className="text-[12px] text-[color:var(--ad-faint)]">최근 성과와 매장 데이터를 분석했어요</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {data.recommendations.map((r) => (
                <article key={r.id} className="grid content-start gap-2 rounded-[14px] border border-[color:var(--ad-line)] p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-[14px] font-semibold leading-snug text-[color:var(--ad-ink)]">{r.title}</h3>
                    <span className="flex-none rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] text-[color:var(--ad-ink-2)]">
                      {r.priority === 'high' ? '먼저 해 보세요' : r.priority === 'medium' ? '추천' : '참고'}
                    </span>
                  </div>
                  <p className="text-[13px] leading-[1.6] text-[color:var(--ad-ink-2)]">{r.body}</p>
                  {r.evidence && <p className="adm-tnum text-[12px] text-[color:var(--ad-muted)]">근거 · {r.evidence}</p>}
                  {r.copyIdeas && (
                    <div className="grid gap-1.5 pt-1">
                      <span className="text-[12px] font-medium text-[color:var(--ad-ink-2)]">써 볼 만한 문구</span>
                      {r.copyIdeas.map((t) => (
                        <CopyLine key={t} text={t} />
                      ))}
                    </div>
                  )}
                  {r.action && (
                    <Link href={r.action.href} className="mt-1 inline-flex w-max items-center gap-1 text-[12.5px] font-medium text-[color:var(--ad-ink)] hover:underline">
                      {r.action.label}
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </article>
              ))}
            </div>
          </section>

          {/* 채널 비교 */}
          {data.channels.some((c) => c.recipients > 0) && (
            <section className="adm-card p-5 sm:p-6">
              <h2 className="mb-1 text-[15px] font-semibold text-[color:var(--ad-ink)]">채널별 재방문율</h2>
              <p className="mb-4 text-[12px] text-[color:var(--ad-faint)]">발송 후 14일이 지난 캠페인 기준</p>
              <div className="grid gap-3">
                {data.channels.filter((c) => c.recipients > 0).map((c) => (
                  <div key={c.channel} className="grid grid-cols-[110px_minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[140px_minmax(0,1fr)_260px]">
                    <span className="text-[13px] text-[color:var(--ad-ink-2)]">{c.label}</span>
                    <Bar value={c.revisitRate} max={maxRate} />
                    <span className="adm-tnum text-right text-[12.5px] text-[color:var(--ad-muted)]">
                      <b className="font-semibold text-[color:var(--ad-ink)]">{pct(c.revisitRate)}</b>
                      <span className="hidden sm:inline"> · 쿠폰 사용 {pct(c.couponUseRate)}{c.costPerRevisit !== null ? ` · 1명당 ${won(c.costPerRevisit)}` : ''}</span>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 캠페인 목록 */}
          <section className="adm-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5 sm:px-6">
              <h2 className="text-[15px] font-semibold text-[color:var(--ad-ink)]">캠페인별 성과</h2>
              <Link href={sendHref} className="adm-press inline-flex h-9 items-center rounded-[10px] bg-[color:var(--ad-ink)] px-3.5 text-[13px] font-semibold text-white hover:bg-[#383c40]">
                새 캠페인 보내기
              </Link>
            </div>
            {data.campaigns.length === 0 ? (
              <p className="px-6 pb-8 pt-2 text-[13px] text-[color:var(--ad-muted)]">
                이 기간에 보낸 캠페인이 없어요. 메시지를 보낼 때 <b>직원 확인</b>을 켜 두면 쿠폰을 들고 온 손님까지 여기서 셀 수 있어요.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px] text-[13px]">
                  <thead>
                    <tr className="border-y border-[color:var(--ad-line)] bg-[color:var(--ad-bg-alt)] text-left text-[12px] text-[color:var(--ad-muted)]">
                      <th className="px-5 py-2.5 font-medium">발송일</th>
                      <th className="px-3 py-2.5 font-medium">캠페인</th>
                      <th className="px-3 py-2.5 text-right font-medium">받은 손님</th>
                      <th className="px-3 py-2.5 text-right font-medium">쿠폰 사용</th>
                      <th className="px-3 py-2.5 text-right font-medium">재방문율</th>
                      <th className="px-3 py-2.5 text-right font-medium">재방문 매출</th>
                      <th className="px-3 py-2.5 text-right font-medium">비용</th>
                      <th className="px-5 py-2.5 text-right font-medium">ROI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.campaigns.map((c) => (
                      <tr key={c.id} className="border-b border-[color:var(--ad-line)] last:border-b-0">
                        <td className="adm-tnum whitespace-nowrap px-5 py-3 text-[color:var(--ad-muted)]">{date(c.sentAt)}</td>
                        <td className="max-w-[320px] px-3 py-3">
                          <div className="truncate text-[color:var(--ad-ink)]">{c.title}</div>
                          <div className="mt-0.5 flex flex-wrap gap-1 text-[11.5px] text-[color:var(--ad-faint)]">
                            <span className="rounded bg-[color:var(--ad-bg)] px-1.5 text-[color:var(--ad-ink-2)]">{c.channelLabel}</span>
                            {c.targetLabel && <span>{c.targetLabel}</span>}
                            {c.maturing && <span>· 집계 중</span>}
                          </div>
                        </td>
                        <td className="adm-tnum px-3 py-3 text-right">{c.recipients.toLocaleString()}</td>
                        <td className="adm-tnum px-3 py-3 text-right">
                          {c.couponEnabled ? (
                            <>
                              {c.couponUsed.toLocaleString()}
                              <span className="ml-1 text-[11.5px] text-[color:var(--ad-faint)]">{pct(c.couponUseRate)}</span>
                            </>
                          ) : (
                            <span className="text-[color:var(--ad-faint)]">쿠폰 없음</span>
                          )}
                        </td>
                        <td className="adm-tnum px-3 py-3 text-right">{pct(c.revisitRate)}</td>
                        <td className="adm-tnum px-3 py-3 text-right">{won(c.revenue)}</td>
                        <td className="adm-tnum px-3 py-3 text-right text-[color:var(--ad-muted)]">{won(c.cost)}</td>
                        <td className="adm-tnum px-5 py-3 text-right font-medium">{c.roi !== null ? `${c.roi}배` : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* 자동 마케팅 */}
          <section className="adm-card overflow-hidden">
            <div className="px-5 pb-3 pt-5 sm:px-6">
              <h2 className="text-[15px] font-semibold text-[color:var(--ad-ink)]">자동 마케팅</h2>
              <p className="mt-0.5 text-[12px] text-[color:var(--ad-faint)]">최근 {data.days}일 동안 자동으로 나간 쿠폰</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-[13px]">
                <thead>
                  <tr className="border-y border-[color:var(--ad-line)] bg-[color:var(--ad-bg-alt)] text-left text-[12px] text-[color:var(--ad-muted)]">
                    <th className="px-5 py-2.5 font-medium">시나리오</th>
                    <th className="px-3 py-2.5 font-medium">상태</th>
                    <th className="px-3 py-2.5 text-right font-medium">발송</th>
                    <th className="px-3 py-2.5 text-right font-medium">쿠폰 사용</th>
                    <th className="px-3 py-2.5 text-right font-medium">재방문율</th>
                    <th className="px-5 py-2.5 text-right font-medium">재방문 매출</th>
                  </tr>
                </thead>
                <tbody>
                  {data.automation.map((a) => (
                    <tr key={a.type} className="border-b border-[color:var(--ad-line)] last:border-b-0">
                      <td className="px-5 py-3 text-[color:var(--ad-ink)]">{a.label}</td>
                      <td className="px-3 py-3">
                        <span className={cn('rounded-full px-2 py-0.5 text-[11.5px]', a.enabled ? 'bg-[color:var(--ad-ink)] text-white' : 'bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)]')}>
                          {a.enabled ? '켜짐' : '꺼짐'}
                        </span>
                      </td>
                      <td className="adm-tnum px-3 py-3 text-right">{a.sent.toLocaleString()}</td>
                      <td className="adm-tnum px-3 py-3 text-right">{a.couponUsed.toLocaleString()}</td>
                      <td className="adm-tnum px-3 py-3 text-right">{pct(a.revisitRate)}</td>
                      <td className="adm-tnum px-5 py-3 text-right">{won(a.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <BoosterPerformanceSection apiUrl={apiUrl} tokenKey={tokenKey} manageHref={boosterHref} showStore={franchise} />

          <p className="text-[12px] leading-[1.6] text-[color:var(--ad-faint)]">
            재방문은 메시지를 받은 손님이 발송 후 {data.windowDays}일 안에 방문(주문)한 경우예요. 쿠폰 사용은 매장 직원이 직원 확인 화면에서 “사용 완료”를 누른 건수예요.
            평소 재방문율은 최근 {data.windowDays}일 동안 기존 손님이 다시 온 비율로, 메시지 효과를 비교하는 기준이에요.
          </p>
        </div>
      )}
    </div>
  );
}
