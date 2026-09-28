'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowUpRight,
  ChartNoAxesColumn,
  ChevronRight,
  Image as ImageIcon,
  Megaphone,
  Plus,
  Store,
  type LucideIcon,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '@/lib/utils';
import { CountUp, Empty, SectionHead, Skel, Tabs, rise, won } from '@/features/admin-ui';
import type { DemographicItem, ExternalPeriodType, VisitSourceDistribution } from '@/features/admin-charts';
import type {
  CorporateAdStats,
  CustomerTrend,
  DemographicStats,
  ExternalCustomerStats,
  PaymentStats,
  PeriodType,
  PointStats,
  Stats,
  StoreOrder,
  VisitSourceStats,
} from '../page';

// taghere-v2 토큰
const NAVY = '#2a2d62';
const BLUE = '#6eadff';
const BLUE_2 = '#a5ccff';
const BLUE_SOFT = '#dcebff';
const GREEN = '#4dbc3a';
const tick = { fill: '#91959a', fontSize: 11 };

const mmdd = (date: string) => date.slice(5).replace('-', '/');

function Unit({ children }: { children: React.ReactNode }) {
  return <span className="ml-0.5 text-[13px] font-medium text-[color:var(--ad-muted)]">{children}</span>;
}

// ─── 핵심 지표 ───

export function MetricsCard({
  stats,
  paymentStats,
  pointStats,
  onAddRevenue,
}: {
  stats: Stats | null;
  paymentStats: PaymentStats | null;
  pointStats: PointStats | null;
  onAddRevenue: () => void;
}) {
  const b = paymentStats?.breakdown;
  const monthly = b
    ? [
        { label: '매장 충전', value: b.monthlyStore, color: NAVY },
        { label: '프랜차이즈 충전', value: b.monthlyFranchise, color: BLUE },
        { label: '외부 매출', value: b.monthlyExternal, color: BLUE_SOFT },
      ]
    : [];
  const monthlyTotal = monthly.reduce((s, m) => s + m.value, 0);

  return (
    <section className="ad-card ad-rise grid lg:grid-cols-[1.5fr_1fr_1fr_1fr]" style={rise(1)}>
      <div className="p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] text-[color:var(--ad-muted)]">이번 달 CRM 매출</p>
          <button
            onClick={onAddRevenue}
            className="ad-press inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium text-[color:var(--ad-link)] hover:bg-[color:var(--ad-bg)]"
          >
            <Plus size={12} strokeWidth={2} />
            외부 매출 추가
          </button>
        </div>
        <p className="mt-1 text-[26px] font-semibold tracking-[-0.035em]">
          <CountUp value={paymentStats?.monthlyRealPayments || 0} />
          <Unit>원</Unit>
        </p>
        {monthly.length > 0 && (
          <>
            <div className="mt-4 flex h-1.5 overflow-hidden rounded-full bg-[rgba(29,32,34,0.05)]">
              {monthlyTotal > 0 &&
                monthly.map((m, k) => (
                  <span
                    key={m.label}
                    className="ad-grow-x h-full"
                    style={{ ...rise(k), width: `${(m.value / monthlyTotal) * 100}%`, background: m.color }}
                  />
                ))}
            </div>
            <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
              {monthly.map((m) => (
                <li key={m.label} className="flex items-center gap-1.5 text-[11.5px] text-[color:var(--ad-muted)]">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.color }} />
                  {m.label}
                  <span className="text-[color:var(--ad-ink-2)] ad-tnum">{won(m.value)}원</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="ad-hair border-t p-5 lg:border-l lg:border-t-0">
        <p className="text-[12px] text-[color:var(--ad-muted)]">누적 CRM 매출</p>
        <p className="mt-1 text-[22px] font-semibold tracking-[-0.03em]">
          <CountUp value={paymentStats?.totalRealPayments || 0} />
          <Unit>원</Unit>
        </p>
        {b && (
          <dl className="mt-3 space-y-1 text-[12px]">
            {[
              ['매장 충전', b.store],
              ['프랜차이즈 충전', b.franchise],
              ['외부 매출', b.external],
            ].map(([label, v]) => (
              <div key={label as string} className="flex justify-between gap-2">
                <dt className="text-[color:var(--ad-faint)]">{label}</dt>
                <dd className="text-[color:var(--ad-ink-2)] ad-tnum">{won(v as number)}원</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div className="ad-hair border-t p-5 lg:border-l lg:border-t-0">
        <p className="text-[12px] text-[color:var(--ad-muted)]">누적 적립 포인트</p>
        <p className="mt-1 text-[22px] font-semibold tracking-[-0.03em]">
          <CountUp value={pointStats?.totalEarnedPoints || 0} />
          <Unit>P</Unit>
        </p>
        <p className="mt-0.5 text-[12px] text-[color:var(--ad-muted)] ad-tnum">
          이번 달 +{won(pointStats?.monthlyEarnedPoints || 0)}P
        </p>
      </div>

      <div className="ad-hair border-t p-5 lg:border-l lg:border-t-0">
        <p className="text-[12px] text-[color:var(--ad-muted)]">플랫폼 현황</p>
        <dl className="mt-2 space-y-1.5 text-[13px]">
          {[
            ['전체 매장', stats?.storeCount || 0, '개'],
            ['전체 고객', stats?.customerCount || 0, '명'],
            ['전체 사용자', stats?.userCount || 0, '명'],
          ].map(([label, v, u]) => (
            <div key={label as string} className="flex items-baseline justify-between">
              <dt className="text-[color:var(--ad-muted)]">{label}</dt>
              <dd className="font-semibold">
                <CountUp value={v as number} />
                <span className="ml-0.5 text-[12px] font-normal text-[color:var(--ad-muted)]">{u}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

// ─── 인사이트: 기존 차트 5개를 탭 하나로 ───

const insightTabs = ['고객 추이', '기업광고', '신규 수집', '방문 경로', '성별·연령'] as const;
type InsightTab = (typeof insightTabs)[number];
const trendPeriods = ['1', '7', '30', '90', 'all'] as const;
const adPeriods = ['7', '30', '90', 'all'] as const;
const externalPeriods = ['daily', 'weekly', 'monthly'] as const;
const periodLabel = (p: string) => (p === 'all' ? 'All' : `${p}일`);
const externalLabel = (p: string) => (p === 'daily' ? '일별' : p === 'weekly' ? '주별' : '월별');

function ChartTip({
  active,
  payload,
  label,
  unit = '',
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[10px] bg-white/95 px-3 py-2 text-[12px] shadow-[0_0_0_1px_rgba(29,32,34,0.06),0_12px_24px_-12px_rgba(19,22,81,0.3)] backdrop-blur">
      <p className="mb-1 text-[color:var(--ad-muted)]">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-1.5 font-medium ad-tnum">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />
          {p.name} {won(p.value)}
          {unit}
        </p>
      ))}
    </div>
  );
}

function Summary({ items }: { items: { label: string; value: string; tone?: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-8 gap-y-2">
      {items.map((it) => (
        <div key={it.label}>
          <p className="text-[12px] text-[color:var(--ad-muted)]">{it.label}</p>
          <p className="text-[20px] font-semibold tracking-[-0.03em] ad-tnum" style={{ color: it.tone }}>
            {it.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function PercentBars({ data, color = BLUE }: { data: (VisitSourceDistribution | DemographicItem)[]; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.percentage));
  return (
    <ul className="space-y-3">
      {data.map((d, k) => (
        <li key={d.label} className="grid grid-cols-[84px_minmax(0,1fr)_88px] items-center gap-3 text-[12.5px]">
          <span className="truncate text-[color:var(--ad-ink-2)]">{d.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-[rgba(29,32,34,0.05)]">
            <span
              className="ad-grow-x block h-full rounded-full"
              style={{ ...rise(k), width: `${(d.percentage / max) * 100}%`, background: color, opacity: Math.max(0.35, 1 - k * 0.1) }}
            />
          </span>
          <span className="text-right ad-tnum">
            <span className="font-medium">{d.percentage.toFixed(1)}%</span>
            <span className="ml-1 text-[11px] text-[color:var(--ad-faint)]">{won(d.count)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function ChartSkeleton() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex gap-8">
        <Skel className="h-10 w-28" />
        <Skel className="h-10 w-28" />
      </div>
      <Skel className="mt-4 min-h-[220px] flex-1 !rounded-[12px]" />
    </div>
  );
}

export function InsightsCard(props: {
  customerTrend: CustomerTrend | null;
  isTrendLoading: boolean;
  selectedPeriod: PeriodType;
  onSelectedPeriod: (p: PeriodType) => void;
  corporateAdStats: CorporateAdStats | null;
  isCorporateAdLoading: boolean;
  corporateAdPeriod: PeriodType;
  onCorporateAdPeriod: (p: PeriodType) => void;
  externalStats: ExternalCustomerStats | null;
  isExternalLoading: boolean;
  externalPeriod: ExternalPeriodType;
  onExternalPeriod: (p: ExternalPeriodType) => void;
  visitSourceStats: VisitSourceStats | null;
  isVisitSourceLoading: boolean;
  demographicStats: DemographicStats | null;
  isDemographicLoading: boolean;
}) {
  const [tab, setTab] = useState<InsightTab>('고객 추이');
  const {
    customerTrend,
    corporateAdStats,
    externalStats,
    visitSourceStats,
    demographicStats,
  } = props;

  const periodControl =
    tab === '고객 추이' ? (
      <Tabs options={trendPeriods} value={props.selectedPeriod} onChange={props.onSelectedPeriod} label="기간" format={periodLabel} />
    ) : tab === '기업광고' ? (
      <Tabs
        options={adPeriods}
        value={props.corporateAdPeriod as (typeof adPeriods)[number]}
        onChange={props.onCorporateAdPeriod}
        label="기간"
        format={periodLabel}
      />
    ) : tab === '신규 수집' ? (
      <Tabs options={externalPeriods} value={props.externalPeriod} onChange={props.onExternalPeriod} label="기간" format={externalLabel} />
    ) : null;

  return (
    <section className="ad-card ad-rise flex min-h-[380px] flex-col p-5" style={rise(2)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="ad-noscroll -mx-1 max-w-full overflow-x-auto px-1">
          <Tabs options={insightTabs} value={tab} onChange={setTab} label="인사이트" />
        </div>
        {periodControl && <div className="ad-noscroll max-w-full overflow-x-auto">{periodControl}</div>}
      </div>

      <div key={tab} className="ad-rise mt-5 flex flex-1 flex-col">
        {tab === '고객 추이' &&
          (props.isTrendLoading && !customerTrend ? (
            <ChartSkeleton />
          ) : customerTrend && customerTrend.trend.length > 0 ? (
            <>
              <Summary
                items={[
                  { label: '현재 총 고객', value: `${won(customerTrend.totalCustomers)}명` },
                  { label: '기간 내 신규', value: `+${won(customerTrend.periodNew)}명`, tone: 'var(--ad-pos)' },
                ]}
              />
              <div className="mt-4 min-h-[220px] flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={customerTrend.trend.map((d) => ({ ...d, label: mmdd(d.date) }))} margin={{ top: 6, right: 4, left: -4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="adTrendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={BLUE} stopOpacity={0.28} />
                        <stop offset="100%" stopColor={BLUE} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="rgba(29,32,34,0.06)" strokeDasharray="2 4" />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={tick} minTickGap={28} dy={6} />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={tick}
                      width={56}
                      domain={['dataMin', 'dataMax']}
                      tickFormatter={(v: number) => (v >= 10000 ? `${Math.round(v / 1000)}k` : won(v))}
                    />
                    <Tooltip content={<ChartTip unit="명" />} cursor={{ stroke: 'rgba(29,32,34,0.12)' }} />
                    <Area
                      name="총 고객"
                      type="monotone"
                      dataKey="cumulative"
                      stroke={BLUE}
                      strokeWidth={2}
                      fill="url(#adTrendFill)"
                      activeDot={{ r: 4, fill: '#fff', stroke: BLUE, strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <Empty className="flex-1" />
          ))}

        {tab === '기업광고' &&
          (props.isCorporateAdLoading && !corporateAdStats ? (
            <ChartSkeleton />
          ) : corporateAdStats && corporateAdStats.trend.length > 0 ? (
            <>
              <Summary
                items={[
                  { label: '알림톡 발송', value: `${won(corporateAdStats.summary.totalSent)}건`, tone: 'var(--ad-link)' },
                  { label: '발송 실패', value: `${won(corporateAdStats.summary.totalFailed)}건`, tone: 'var(--ad-neg)' },
                  { label: '멤버십 가입', value: `${won(corporateAdStats.summary.totalMembership)}명`, tone: 'var(--ad-pos)' },
                ]}
              />
              <div className="mt-4 min-h-[220px] flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={corporateAdStats.trend.map((d) => ({ ...d, label: mmdd(d.date) }))} margin={{ top: 6, right: 4, left: -4, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="rgba(29,32,34,0.06)" strokeDasharray="2 4" />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={tick} minTickGap={28} dy={6} />
                    <YAxis yAxisId="l" axisLine={false} tickLine={false} tick={tick} width={44} />
                    <YAxis yAxisId="r" orientation="right" axisLine={false} tickLine={false} tick={tick} width={36} />
                    <Tooltip content={<ChartTip />} cursor={{ stroke: 'rgba(29,32,34,0.12)' }} />
                    <Line yAxisId="l" name="알림톡 발송" type="monotone" dataKey="alimTalkSent" stroke={BLUE} strokeWidth={2} dot={false} />
                    <Line yAxisId="r" name="멤버십 가입" type="monotone" dataKey="membershipCount" stroke={GREEN} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 flex items-center gap-4 text-[12px] text-[color:var(--ad-muted)]">
                <span className="flex items-center gap-1.5">
                  <span className="h-[3px] w-3 rounded-full" style={{ background: BLUE }} />
                  알림톡 발송
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-[3px] w-3 rounded-full" style={{ background: GREEN }} />
                  멤버십 가입
                </span>
              </div>
            </>
          ) : (
            <Empty className="flex-1" />
          ))}

        {tab === '신규 수집' &&
          (props.isExternalLoading && !externalStats ? (
            <ChartSkeleton />
          ) : externalStats ? (
            <>
              <div className="flex flex-wrap items-end justify-between gap-2">
                <Summary
                  items={[
                    { label: '전체 수집', value: won(externalStats.summary.total) },
                    { label: '1/18 이후', value: won(externalStats.summary.periodTotal), tone: 'var(--ad-link)' },
                    { label: '일평균', value: won(externalStats.summary.averagePerDay) },
                  ]}
                />
                <span className="text-[12px] text-[color:var(--ad-faint)]">gain_customer 페이지 수집 통계</span>
              </div>
              {externalStats.data.length > 0 ? (
                <div className="mt-4 min-h-[220px] flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={externalStats.data.map((d) => ({
                        ...d,
                        label: props.externalPeriod === 'monthly' ? `${parseInt(d.date.split('-')[1], 10)}월` : mmdd(d.date),
                      }))}
                      margin={{ top: 6, right: 4, left: -12, bottom: 0 }}
                    >
                      <CartesianGrid vertical={false} stroke="rgba(29,32,34,0.06)" strokeDasharray="2 4" />
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={tick} minTickGap={16} dy={6} />
                      <YAxis axisLine={false} tickLine={false} tick={tick} width={44} />
                      <Tooltip content={<ChartTip unit="명" />} cursor={{ fill: 'rgba(110,173,255,0.08)' }} />
                      <Bar name="수집" dataKey="count" fill={BLUE_2} radius={[6, 6, 2, 2]} maxBarSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <Empty className="min-h-[220px] flex-1">기간 내 데이터가 없습니다</Empty>
              )}
            </>
          ) : (
            <Empty className="flex-1" />
          ))}

        {tab === '방문 경로' &&
          (props.isVisitSourceLoading && !visitSourceStats ? (
            <ChartSkeleton />
          ) : visitSourceStats && visitSourceStats.distribution.length > 0 ? (
            <div className="grid gap-8 md:grid-cols-[150px_minmax(0,1fr)]">
              <div className="flex flex-wrap gap-x-8 gap-y-3 md:flex-col">
                <Summary items={[{ label: '전체 고객', value: won(visitSourceStats.totalCustomers) }]} />
                <Summary items={[{ label: '방문경로 있음', value: won(visitSourceStats.totalWithSource), tone: 'var(--ad-link)' }]} />
                <Summary items={[{ label: '미입력', value: won(visitSourceStats.noSourceCount), tone: 'var(--ad-faint)' }]} />
              </div>
              <PercentBars data={visitSourceStats.distribution} />
            </div>
          ) : (
            <Empty className="flex-1" />
          ))}

        {tab === '성별·연령' &&
          (props.isDemographicLoading && !demographicStats ? (
            <ChartSkeleton />
          ) : demographicStats && demographicStats.totalCustomers > 0 ? (
            <div className="grid gap-8 md:grid-cols-2">
              <div>
                <p className="mb-3 text-[12px] text-[color:var(--ad-muted)]">성별</p>
                <PercentBars data={demographicStats.genderDistribution} color={NAVY} />
              </div>
              <div>
                <p className="mb-3 text-[12px] text-[color:var(--ad-muted)]">연령대</p>
                <PercentBars data={demographicStats.ageGroupDistribution} />
              </div>
            </div>
          ) : (
            <Empty className="flex-1" />
          ))}
      </div>
    </section>
  );
}

// ─── 바로가기 ───

const quickLinks: { href?: string; label: string; detail: string; icon: LucideIcon }[] = [
  { href: '/admin/stores', label: '매장 관리', detail: '매장 목록 및 설정', icon: Store },
  { href: '/admin/announcements', label: '공지사항', detail: '공지 관리', icon: Megaphone },
  { href: '/admin/banners', label: '배너 관리', detail: '주문완료 배너', icon: ImageIcon },
  { label: '통계 분석', detail: '준비 중', icon: ChartNoAxesColumn },
];

export function QuickLinks() {
  return (
    <section className="ad-card ad-rise flex flex-col p-5" style={rise(3)}>
      <SectionHead title="바로가기" />
      <ul className="mt-3 divide-y divide-[color:var(--ad-line)]">
        {quickLinks.map((q) => {
          const Icon = q.icon;
          const body = (
            <>
              <span
                className={cn(
                  'grid h-9 w-9 shrink-0 place-items-center rounded-[10px] transition-colors',
                  q.href
                    ? 'bg-[color:var(--ad-yellow-soft)] text-[color:var(--ad-navy)] group-hover:bg-[color:var(--ad-yellow)]'
                    : 'bg-[color:var(--ad-bg)] text-[color:var(--ad-faint)]'
                )}
              >
                <Icon size={16} strokeWidth={1.7} />
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className={cn('text-[13.5px] font-medium', !q.href && 'text-[color:var(--ad-faint)]')}>{q.label}</p>
                <p className="mt-0.5 text-[12px] text-[color:var(--ad-faint)]">{q.detail}</p>
              </div>
            </>
          );
          return (
            <li key={q.label}>
              {q.href ? (
                <Link href={q.href} className="ad-press group flex items-center gap-3 py-3">
                  {body}
                  <ChevronRight size={15} strokeWidth={1.7} className="text-[color:var(--ad-faint)] transition-transform group-hover:translate-x-0.5" />
                </Link>
              ) : (
                <div className="flex cursor-not-allowed items-center gap-3 py-3" aria-disabled>
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ─── 스토어 주문 ───

const statusStyle = {
  PAID: { label: '결제완료', cls: 'text-[color:var(--ad-pos)] bg-[#d9fad3]' },
  PENDING: { label: '대기중', cls: 'text-[#993d1f] bg-[#ffdace]' },
  CANCELLED: { label: '취소됨', cls: 'text-[color:var(--ad-muted)] bg-[color:var(--ad-bg)]' },
} as const;

export function StoreOrdersCard({ orders, isLoading }: { orders: StoreOrder[]; isLoading: boolean }) {
  return (
    <section className="ad-card ad-rise overflow-hidden" style={rise(4)}>
      <div className="p-5 pb-3">
        <SectionHead
          title="스토어 주문 내역"
          meta="최근 20개 주문"
          action={
            <Link href="/admin/store-products" className="inline-flex items-center gap-0.5 text-[12px] font-medium text-[color:var(--ad-link)]">
              전체 보기
              <ArrowUpRight size={13} strokeWidth={1.8} />
            </Link>
          }
        />
      </div>
      {isLoading && orders.length === 0 ? (
        <div className="space-y-2 px-5 pb-5">
          {[0, 1, 2, 3].map((k) => (
            <Skel key={k} className="h-9 w-full" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <Empty className="h-40">주문 내역이 없습니다</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[12.5px]">
            <thead>
              <tr className="border-y border-[color:var(--ad-line)] bg-[color:var(--ad-bg-alt)] text-left text-[11.5px] text-[color:var(--ad-muted)]">
                <th className="px-5 py-2 font-medium">주문번호</th>
                <th className="px-3 py-2 font-medium">매장</th>
                <th className="px-3 py-2 font-medium">고객정보</th>
                <th className="px-3 py-2 font-medium">상품</th>
                <th className="px-3 py-2 text-right font-medium">금액</th>
                <th className="px-3 py-2 font-medium">상태</th>
                <th className="px-5 py-2 text-right font-medium">주문일시</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--ad-line)]">
              {orders.map((o) => {
                const st = statusStyle[o.status];
                const created = new Date(o.createdAt);
                return (
                  <tr key={o.id} className="transition-colors hover:bg-[rgba(110,173,255,0.05)]">
                    <td className="px-5 py-2.5 font-mono text-[12px] text-[color:var(--ad-ink-2)]">{o.orderNumber}</td>
                    <td className="px-3 py-2.5 font-medium">{o.store?.name || '-'}</td>
                    <td className="px-3 py-2.5">
                      {o.customerName} <span className="text-[color:var(--ad-faint)] ad-tnum">{o.customerPhone}</span>
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-2.5 text-[color:var(--ad-ink-2)]">
                      {o.items.map((item) => `${item.productName} x${item.quantity}`).join(', ')}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium ad-tnum">{won(o.totalAmount)}원</td>
                    <td className="px-3 py-2.5">
                      <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium', st.cls)}>{st.label}</span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right text-[color:var(--ad-muted)] ad-tnum">
                      {created.toLocaleDateString('ko-KR')}{' '}
                      {created.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
