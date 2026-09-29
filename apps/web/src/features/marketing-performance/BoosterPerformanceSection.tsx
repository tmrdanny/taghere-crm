'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, ChevronDown, Rocket } from 'lucide-react';
import { API_BASE } from '@/lib/api-config';
import { cn } from '@/lib/utils';

// 마케팅 성과 하단 — 플레이스 부스터 캠페인 성과 (어드민 리포트와 같은 숫자, 기간 필터와 무관)
interface Week {
  weekNo: number;
  scheduledAt: string;
  status: string;
  sentCount: number;
  clickCount: number;
  clickRate: number;
  couponUsedCount: number | null;
  avgTicket: number | null;
  revenue: number;
}
interface BoosterCampaign {
  id: string;
  storeName: string | null;
  keyword: string;
  couponContent: string;
  status: string;
  totalWeeks: number;
  sentWeeks: number;
  startAt: string | null;
  endAt: string | null;
  totals: { sentCount: number; clickCount: number; clickRate: number; couponUsed: number; revenue: number; adCost: number; roi: number | null };
  weeks: Week[];
}

const STATUS_LABEL: Record<string, string> = { SCHEDULED: '발송 예정', RUNNING: '진행 중', COMPLETED: '완료', CANCELLED: '중지' };
const WEEK_LABEL: Record<string, string> = { SCHEDULED: '예정', SENDING: '예약 중', REGISTERED: '예약됨', SENT: '발송', CANCELLED: '취소' };
const num = (n: number) => n.toLocaleString('ko-KR');
const won = (n: number) => `${num(n)}원`;
const md = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' });
const mdhm = (iso: string) =>
  new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit' });

function Metric({ label, value, sub, className }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <div className={cn('grid content-start gap-0.5 rounded-[12px] bg-[color:var(--ad-bg-alt)] px-3.5 py-3', className)}>
      <span className="text-[12px] text-[color:var(--ad-muted)]">{label}</span>
      <span className="ad-tnum text-[18px] font-medium tracking-[-0.02em] text-[color:var(--ad-ink)]">{value}</span>
      {sub && <span className="text-[11.5px] text-[color:var(--ad-faint)]">{sub}</span>}
    </div>
  );
}

function CampaignBlock({ c, showStore, manageHref }: { c: BoosterCampaign; showStore: boolean; manageHref: string }) {
  const [open, setOpen] = useState(false);
  const t = c.totals;
  const needsInput = c.weeks.some((w) => w.status === 'SENT' && w.couponUsedCount == null);
  return (
    <article className="grid gap-3 border-t border-[color:var(--ad-line)] px-5 py-5 first:border-t-0 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {showStore && c.storeName && <span className="text-[13px] font-semibold text-[color:var(--ad-ink)]">{c.storeName}</span>}
            <span className="text-[13px] text-[color:var(--ad-ink-2)]">‘{c.keyword}’ 유입</span>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px]',
                c.status === 'RUNNING' ? 'bg-[color:var(--ad-ink)] text-white' : 'bg-[color:var(--ad-bg)] text-[color:var(--ad-ink-2)]'
              )}
            >
              {STATUS_LABEL[c.status] ?? c.status}
            </span>
          </div>
          <p className="ad-tnum mt-0.5 text-[12px] text-[color:var(--ad-faint)]">
            {c.startAt && c.endAt ? `${md(c.startAt)} ~ ${md(c.endAt)} · ` : ''}
            {c.sentWeeks}/{c.totalWeeks}주차 발송
          </p>
          <p className="mt-0.5 line-clamp-1 max-w-[640px] text-[12px] text-[color:var(--ad-faint)]" title={c.couponContent}>
            쿠폰 · {c.couponContent}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Metric label="발송" value={`${num(t.sentCount)}명`} />
        <Metric label="플레이스 클릭" value={`${num(t.clickCount)}회`} sub={`클릭율 ${t.clickRate}%`} />
        <Metric label="쿠폰 사용" value={`${num(t.couponUsed)}장`} />
        <Metric label="매출" value={won(t.revenue)} sub="쿠폰 사용 × 평균 객단" />
        <Metric label="ROI" value={t.roi === null ? '-' : `${num(t.roi)}%`} sub={`광고비 ${won(t.adCost)}`} className="col-span-2 sm:col-span-1" />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[color:var(--ad-ink)]"
        >
          주차별 성과
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
        </button>
        {needsInput && (
          <Link href={manageHref} className="inline-flex items-center gap-1 text-[12.5px] text-[color:var(--ad-muted)] hover:text-[color:var(--ad-ink)]">
            쿠폰 사용·객단을 입력하면 매출과 ROI가 계산돼요
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      {open && (
        <div className="-mx-5 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="border-y border-[color:var(--ad-line)] bg-[color:var(--ad-bg-alt)] text-left text-[12px] text-[color:var(--ad-muted)]">
                <th className="px-5 py-2.5 font-medium sm:px-6">주차</th>
                <th className="px-3 py-2.5 font-medium">발송 일시</th>
                <th className="px-3 py-2.5 text-right font-medium">발송</th>
                <th className="px-3 py-2.5 text-right font-medium">클릭</th>
                <th className="px-3 py-2.5 text-right font-medium">클릭율</th>
                <th className="px-3 py-2.5 text-right font-medium">쿠폰 사용</th>
                <th className="px-3 py-2.5 text-right font-medium">평균 객단</th>
                <th className="px-5 py-2.5 text-right font-medium sm:px-6">매출</th>
              </tr>
            </thead>
            <tbody>
              {c.weeks.map((w) => (
                <tr key={w.weekNo} className="border-b border-[color:var(--ad-line)] last:border-b-0">
                  <td className="whitespace-nowrap px-5 py-2.5 sm:px-6">
                    {w.weekNo}주차
                    <span className="ml-1.5 text-[11.5px] text-[color:var(--ad-faint)]">{WEEK_LABEL[w.status] ?? w.status}</span>
                  </td>
                  <td className="ad-tnum whitespace-nowrap px-3 py-2.5 text-[color:var(--ad-muted)]">{mdhm(w.scheduledAt)}</td>
                  <td className="ad-tnum px-3 py-2.5 text-right">{num(w.sentCount)}</td>
                  <td className="ad-tnum px-3 py-2.5 text-right">{num(w.clickCount)}</td>
                  <td className="ad-tnum px-3 py-2.5 text-right">{w.clickRate}%</td>
                  <td className="ad-tnum px-3 py-2.5 text-right">{w.couponUsedCount == null ? '-' : num(w.couponUsedCount)}</td>
                  <td className="ad-tnum px-3 py-2.5 text-right">{w.avgTicket == null ? '-' : won(w.avgTicket)}</td>
                  <td className="ad-tnum px-5 py-2.5 text-right sm:px-6">{won(w.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

export function BoosterPerformanceSection({
  apiUrl,
  tokenKey = 'token',
  manageHref,
  showStore = false,
}: {
  /** /api/marketing-performance 또는 /api/franchise/marketing-performance */
  apiUrl: string;
  tokenKey?: string;
  /** 부스터 캠페인 관리(결과 입력) 화면 */
  manageHref: string;
  /** 프랜차이즈: 캠페인마다 매장명 표시 */
  showStore?: boolean;
}) {
  const [campaigns, setCampaigns] = useState<BoosterCampaign[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}${apiUrl}/place-booster`, { headers: { Authorization: `Bearer ${localStorage.getItem(tokenKey) || ''}` } });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || '불러오지 못했어요');
        setCampaigns(d.campaigns ?? []);
      } catch (e: any) {
        setError(e.message);
      }
    })();
  }, [apiUrl, tokenKey]);

  return (
    <section className="ad-card overflow-hidden" aria-labelledby="booster-perf-title">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-5 sm:px-6">
        <div>
          <div className="flex items-center gap-2">
            <Rocket className="h-4 w-4 text-[color:var(--ad-ink)]" strokeWidth={1.8} />
            <h2 id="booster-perf-title" className="text-[15px] font-semibold text-[color:var(--ad-ink)]">
              플레이스 부스터 성과
            </h2>
          </div>
          <p className="mt-0.5 text-[12px] text-[color:var(--ad-faint)]">네이버 플레이스로 손님을 보낸 캠페인 · 기간과 관계없이 전체</p>
        </div>
        <Link href={manageHref} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[color:var(--ad-ink)] hover:underline">
          플레이스 부스터 관리
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {error ? (
        <p className="px-6 pb-6 text-[13px] text-[color:var(--ad-neg)]">{error}</p>
      ) : campaigns === null ? (
        <div className="mx-5 mb-5 h-[120px] animate-pulse rounded-[12px] bg-[color:var(--ad-bg-alt)] sm:mx-6" aria-hidden />
      ) : campaigns.length === 0 ? (
        <p className="px-5 pb-6 pt-1 text-[13px] text-[color:var(--ad-muted)] sm:px-6">
          아직 진행한 플레이스 부스터가 없어요. 동네 손님에게 쿠폰을 보내 네이버 플레이스 방문을 늘려 보세요.
        </p>
      ) : (
        <div className="border-t border-[color:var(--ad-line)]">
          {campaigns.map((c) => (
            <CampaignBlock key={c.id} c={c} showStore={showStore} manageHref={manageHref} />
          ))}
        </div>
      )}
    </section>
  );
}
