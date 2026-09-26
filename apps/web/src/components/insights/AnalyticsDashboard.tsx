'use client';

import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import { RefreshCw, Lightbulb, BarChart3 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// ── 차트 공통 스타일 (홈 방문자 차트와 같은 톤) ──
const C = {
  navy: '#2a2d62',
  blue: '#6eadff',
  blue2: '#a5ccff',
  blue3: '#dcebff',
  gray: '#d1d3d6',
  faint: '#91959a',
  bg: '#f2f3f4',
};
const TICK = { fill: '#91959a', fontSize: 11 };
const GRID = { vertical: false, stroke: 'rgba(29,32,34,0.06)', strokeDasharray: '2 4' } as const;
const BAR_CURSOR = { fill: 'rgba(110,173,255,0.08)' };
const LINE_CURSOR = { stroke: 'rgba(29,32,34,0.12)', strokeWidth: 1 };
const BAR_RADIUS: [number, number, number, number] = [6, 6, 2, 2];

// 가장 큰 값의 인덱스 (막대 하이라이트용)
function peakIndex<T>(rows: T[], get: (r: T) => number) {
  let idx = -1;
  let max = 0;
  rows.forEach((r, i) => {
    const v = get(r);
    if (v > max) {
      max = v;
      idx = i;
    }
  });
  return idx;
}

// 흰 카드 툴팁 (홈 ChartTip 과 동일한 모양)
function ChartTip({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean;
  payload?: { name?: string; dataKey?: string | number; value?: number; color?: string; stroke?: string; fill?: string }[];
  label?: string;
  format: (v: number, name: string) => string;
}) {
  if (!active || !payload?.length) return null;
  const items = payload.filter((p) => p.value !== undefined && p.value !== null);
  if (items.length === 0) return null;
  return (
    <div className="rounded-[10px] bg-white/95 px-3 py-2 text-[12px] shadow-[0_0_0_1px_rgba(29,32,34,0.06),0_12px_24px_-12px_rgba(19,22,81,0.3)] backdrop-blur">
      <p className="mb-1 text-[#55595e]">{label}</p>
      {items.map((p) => {
        const name = String(p.name ?? p.dataKey ?? '');
        const dot = p.stroke || p.fill || p.color || C.blue;
        return (
          <p key={name} className="flex items-center gap-1.5 font-medium text-[#1d2022] tabular-nums">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dot }} />
            {format(Number(p.value), name)}
          </p>
        );
      })}
    </div>
  );
}

// 카드 머리 (제목 · 설명 · 우측 컨트롤)
function CardHead({ title, desc, right }: { title: string; desc?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="text-[14px] font-semibold text-[#1d2022]">{title}</h3>
        {desc && <p className="mt-0.5 text-[12px] text-[#91959a]">{desc}</p>}
      </div>
      {right}
    </div>
  );
}

// 회색 트랙 + 흰 선택 pill 세그먼트 컨트롤
function segBtn(active: boolean) {
  return cn(
    'rounded-[8px] px-3 py-1 text-[12.5px] font-medium transition-colors',
    active
      ? 'bg-white text-[#1d2022] shadow-[0_0_0_1px_rgba(29,32,34,0.06),0_1px_2px_rgba(29,32,34,0.08)]'
      : 'text-[#55595e] hover:text-[#1d2022]'
  );
}
const SEG_TRACK = 'inline-flex gap-0.5 rounded-[10px] bg-[#f2f3f4] p-0.5';

// 가로 막대 한 줄 (얇은 트랙)
function ThinBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-[rgba(29,32,34,0.05)]">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

// 히트맵 색: #f2f3f4(0) → 파랑 단계 → #2a2d62(최대)
const HEAT_STOPS: [number, [number, number, number]][] = [
  [0, [242, 243, 244]],
  [0.25, [220, 235, 255]],
  [0.5, [165, 204, 255]],
  [0.75, [110, 173, 255]],
  [1, [42, 45, 98]],
];
function heatColor(a: number) {
  if (a <= 0) return C.bg;
  const t = Math.min(1, 0.08 + a * 0.92);
  for (let i = 1; i < HEAT_STOPS.length; i++) {
    const [t1, c1] = HEAT_STOPS[i];
    const [t0, c0] = HEAT_STOPS[i - 1];
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0);
      const mix = c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
      return `rgb(${mix[0]},${mix[1]},${mix[2]})`;
    }
  }
  return C.navy;
}

// 데이터 분석 탭 공용 대시보드 (매장 / 프랜차이즈)
// 데이터는 부모가 fetch해서 내려준다.

export interface AnalyticsData {
  period: { days: number | null; from: string | null };
  menuByHour: {
    topMenus: string[];
    rows: { menu: string; hour: number; qty: number }[];
    hourlyTotals: { hour: number; qty: number }[];
  };
  avgTicketBySegment: {
    byAgeHour: { hour: number; segment: string; avgAmount: number; orders: number }[];
    byGenderHour: { hour: number; segment: string; avgAmount: number; orders: number }[];
  };
  revisitCycle: {
    weekly: { bucket: string; customers: number }[];
    monthly: { bucket: string; customers: number }[];
    noRevisit: number;
    base: number;
  };
  visitHeatmap: { dow: number; hour: number; visits: number }[];
  visitFrequency: { bucket: string; customers: number }[];
  newVsReturning: { label: string; visits: number; revenue: number }[];
  segmentRevisit: { segment: string; base: number; rate30: number }[];
}

// 차트 상단 핵심 인사이트 (점주가 차트를 해석하지 않아도 되도록 한 줄 요약)
function Insight({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="mb-4 flex items-start gap-2 rounded-[12px] bg-[#f8f9fa] px-4 py-3">
      <Lightbulb className="mt-[2px] h-4 w-4 shrink-0 text-[#91959a]" strokeWidth={1.8} />
      <p className="text-[13px] leading-relaxed text-[#55595e]">{text}</p>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 rounded-[12px] bg-[#f8f9fa] px-4 text-center">
      <BarChart3 className="h-5 w-5 text-[#91959a]" strokeWidth={1.7} />
      <p className="text-[12.5px] text-[#91959a]">{message}</p>
    </div>
  );
}

const PERIODS = [
  { days: 30, label: '최근 30일' },
  { days: 90, label: '최근 90일' },
  { days: 180, label: '최근 180일' },
  { days: 0, label: '전체 기간' },
];

const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function fmtWon(n: number) {
  return `${n.toLocaleString()}원`;
}

export function AnalyticsDashboard({
  data,
  isLoading,
  days,
  onChangeDays,
  headerRight,
}: {
  data: AnalyticsData | null;
  isLoading: boolean;
  days: number;
  onChangeDays: (d: number) => void;
  headerRight?: React.ReactNode;
}) {
  const [selectedMenu, setSelectedMenu] = useState<string>('__all__');
  const [ticketMode, setTicketMode] = useState<'age' | 'gender'>('age');
  // 객단가 선 차트에서 강조할 세그먼트 (표시 전용 — 데이터에는 영향 없음)
  const [highlighted, setHighlighted] = useState<string | null>(null);

  // ① 시간대별 메뉴 판매량 차트 데이터
  const menuChart = useMemo(() => {
    if (!data) return [];
    const source =
      selectedMenu === '__all__'
        ? data.menuByHour.hourlyTotals
        : data.menuByHour.rows.filter((r) => r.menu === selectedMenu).map((r) => ({ hour: r.hour, qty: r.qty }));
    const byHour = new Map(source.map((r) => [r.hour, r.qty]));
    return Array.from({ length: 24 }, (_, h) => ({ hour: `${h}시`, qty: byHour.get(h) || 0 }));
  }, [data, selectedMenu]);

  // ① 시간대 블록별 TOP3 메뉴
  const blockTop = useMemo(() => {
    if (!data) return [];
    const blocks = [
      { label: '아침 (06~11시)', from: 6, to: 11 },
      { label: '점심 (11~14시)', from: 11, to: 14 },
      { label: '오후 (14~17시)', from: 14, to: 17 },
      { label: '저녁 (17~21시)', from: 17, to: 21 },
      { label: '심야 (21~02시)', from: 21, to: 26 },
    ];
    return blocks.map((b) => {
      const agg = new Map<string, number>();
      for (const r of data.menuByHour.rows) {
        const h = r.hour < 6 ? r.hour + 24 : r.hour;
        if (h >= b.from && h < b.to) agg.set(r.menu, (agg.get(r.menu) || 0) + r.qty);
      }
      const top = Array.from(agg.entries()).sort((a, z) => z[1] - a[1]).slice(0, 3);
      return { label: b.label, top };
    });
  }, [data]);

  // ② 객단가 차트: hour → {segment: avg}
  const ticketChart = useMemo(() => {
    if (!data) return { rows: [] as any[], segments: [] as string[] };
    const src = ticketMode === 'age' ? data.avgTicketBySegment.byAgeHour : data.avgTicketBySegment.byGenderHour;
    const segments = Array.from(new Set(src.map((r) => r.segment))).sort();
    const byHour = new Map<number, any>();
    for (const r of src) {
      if (!byHour.has(r.hour)) byHour.set(r.hour, { hour: `${r.hour}시` });
      byHour.get(r.hour)[r.segment] = r.avgAmount;
    }
    const rows = Array.from({ length: 24 }, (_, h) => byHour.get(h) || { hour: `${h}시` });
    return { rows, segments };
  }, [data, ticketMode]);

  // ④ 히트맵 최대값
  const heatMax = useMemo(
    () => (data ? Math.max(1, ...data.visitHeatmap.map((r) => r.visits)) : 1),
    [data]
  );
  const heatMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of data?.visitHeatmap || []) m.set(`${r.dow}-${r.hour}`, r.visits);
    return m;
  }, [data]);

  const totalRevenue = (data?.newVsReturning || []).reduce((s, r) => s + r.revenue, 0);

  // ── 핵심 인사이트 자동 계산 ──
  const insights = useMemo(() => {
    if (!data) return {} as Record<string, string | null>;
    const out: Record<string, string | null> = {};

    // ① 메뉴: 피크 시간 + 그 시간대 최다 메뉴
    if (data.menuByHour.hourlyTotals.length > 0) {
      const peak = [...data.menuByHour.hourlyTotals].sort((a, b) => b.qty - a.qty)[0];
      const peakMenu = [...data.menuByHour.rows.filter((r) => r.hour === peak.hour)].sort((a, b) => b.qty - a.qty)[0];
      out.menu = `판매 피크는 ${peak.hour}시 (${peak.qty.toLocaleString()}개)` +
        (peakMenu ? ` — 이 시간대 1등 메뉴는 "${peakMenu.menu}"입니다.` : '입니다.');
    } else out.menu = null;

    // ② 객단가: 가장 돈을 많이 내는 유형×시간대 (표본 3건 이상)
    const src2 = ticketMode === 'age' ? data.avgTicketBySegment.byAgeHour : data.avgTicketBySegment.byGenderHour;
    const solid = src2.filter((r) => r.orders >= 3);
    if (solid.length > 0) {
      const best = [...solid].sort((a, b) => b.avgAmount - a.avgAmount)[0];
      // 세그먼트 전체 평균 1위 (시간 무관, 주문수 가중)
      const segAgg = new Map<string, { sum: number; n: number }>();
      for (const r of solid) {
        const s = segAgg.get(r.segment) || { sum: 0, n: 0 };
        s.sum += r.avgAmount * r.orders; s.n += r.orders;
        segAgg.set(r.segment, s);
      }
      const bestSeg = [...segAgg.entries()].map(([k, v]) => ({ k, avg: v.sum / v.n })).sort((a, b) => b.avg - a.avg)[0];
      out.ticket = `객단가가 가장 높은 손님은 ${best.hour}시의 ${best.segment} — 평균 ${best.avgAmount.toLocaleString()}원. ` +
        `전체 시간대 기준으로는 ${bestSeg.k} 고객이 평균 ${Math.round(bestSeg.avg).toLocaleString()}원으로 가장 높습니다.`;
    } else out.ticket = null;

    // ③ 재방문 주기
    const wSum = data.revisitCycle.weekly.reduce((s, w) => s + w.customers, 0);
    const mAll = data.revisitCycle.monthly.reduce((s, w) => s + w.customers, 0);
    if (mAll > 0) {
      const w1 = data.revisitCycle.weekly[0]?.customers || 0;
      out.cycle = `재방문 고객의 ${Math.round((w1 / mAll) * 100)}%가 첫 방문 후 1주일 안에 다시 옵니다` +
        (wSum > 0 ? ` (1개월 내 재방문 ${Math.round((wSum / mAll) * 100)}%).` : '.');
    } else out.cycle = null;

    // ④ 히트맵: 최다 방문 요일×시간
    if (data.visitHeatmap.length > 0) {
      const top = [...data.visitHeatmap].sort((a, b) => b.visits - a.visits)[0];
      out.heat = `가장 붐비는 시간은 ${DOW_LABELS[top.dow]}요일 ${top.hour}시 (${top.visits.toLocaleString()}건) — 이 시간대에 인력·재고를 집중하세요.`;
    } else out.heat = null;

    // ⑤ 단골 비중
    const fTotal = data.visitFrequency.reduce((s, f) => s + f.customers, 0);
    if (fTotal > 0) {
      const regulars = data.visitFrequency.slice(2).reduce((s, f) => s + f.customers, 0);
      out.freq = `기간 내 3회 이상 방문한 단골이 ${Math.round((regulars / fTotal) * 100)}% (${regulars.toLocaleString()}명)입니다.`;
    } else out.freq = null;

    // ⑥ 재방문 매출 비중
    if (totalRevenue > 0) {
      const ret = data.newVsReturning.find((r) => r.label === '재방문');
      if (ret) out.nvr = `매출의 ${Math.round((ret.revenue / totalRevenue) * 100)}%를 재방문 고객이 만듭니다 — 단골 관리가 곧 매출입니다.`;
      else out.nvr = null;
    } else out.nvr = null;

    // ⑦ 세그먼트 재방문율 1위
    if (data.segmentRevisit.length > 0) {
      const t = data.segmentRevisit[0];
      out.seg = `재방문율이 가장 높은 고객층은 ${t.segment} (${t.rate30}%) — 이 고객층 대상 마케팅 효율이 가장 좋습니다.`;
    } else out.seg = null;

    return out;
  }, [data, ticketMode, totalRevenue]);

  // ── 표시 전용 파생값 (하이라이트 막대 · 강조 선) ──
  const menuPeak = peakIndex(menuChart, (r) => r.qty);
  const weeklyPeak = data ? peakIndex(data.revisitCycle.weekly, (r) => r.customers) : -1;
  const monthlyPeak = data ? peakIndex(data.revisitCycle.monthly, (r) => r.customers) : -1;
  const freqPeak = data ? peakIndex(data.visitFrequency, (r) => r.customers) : -1;
  const activeSeg =
    highlighted && ticketChart.segments.includes(highlighted) ? highlighted : ticketChart.segments[0] ?? null;
  const orderedSegs = [...ticketChart.segments.filter((s) => s !== activeSeg), ...(activeSeg ? [activeSeg] : [])];
  const segMax = data ? Math.max(1, ...data.segmentRevisit.map((s) => s.rate30)) : 1;

  const cardCls = 'rounded-[16px] border-[#ebeced] shadow-none';

  return (
    <div className="space-y-5">
      {/* 기간 필터 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className={SEG_TRACK}>
          {PERIODS.map((p) => (
            <button
              key={p.days}
              onClick={() => onChangeDays(p.days)}
              className={segBtn(days === p.days)}
            >
              {p.label}
            </button>
          ))}
        </div>
        {headerRight}
      </div>

      {isLoading || !data ? (
        <div className="flex h-64 items-center justify-center text-[13px] text-[#91959a]">
          <RefreshCw className="mr-2 h-4 w-4 animate-spin" strokeWidth={1.8} /> 데이터 분석 중...
        </div>
      ) : (
        <>
          {/* ① 시간대별 메뉴 판매량 */}
          <Card className={cardCls}>
            <CardContent className="p-5">
              <CardHead title="시간대별 메뉴 판매량" desc="주문 데이터 기준 · KST · 메뉴를 선택하면 해당 메뉴만 표시" />
              <Insight text={insights.menu} />
              <div className="mb-4 flex flex-wrap gap-1.5">
                <button
                  onClick={() => setSelectedMenu('__all__')}
                  className={cn('rounded-full px-3 py-1 text-[12px] font-medium transition-colors',
                    selectedMenu === '__all__'
                      ? 'bg-[#1d2022] text-white'
                      : 'bg-white text-[#55595e] shadow-[inset_0_0_0_1px_#e1e3e5] hover:bg-[#f8f9fa]')}
                >전체</button>
                {data.menuByHour.topMenus.map((m) => (
                  <button key={m} onClick={() => setSelectedMenu(m)}
                    className={cn('max-w-[160px] truncate rounded-full px-3 py-1 text-[12px] font-medium transition-colors',
                      selectedMenu === m
                        ? 'bg-[#1d2022] text-white'
                        : 'bg-white text-[#55595e] shadow-[inset_0_0_0_1px_#e1e3e5] hover:bg-[#f8f9fa]')}
                  >{m}</button>
                ))}
              </div>
              <div className="h-56">
                {data.menuByHour.hourlyTotals.length === 0 ? (
                  <EmptyChart message="아직 주문 메뉴 데이터가 없습니다. 주문 연동 후 자동으로 쌓입니다." />
                ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={menuChart} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={TICK} interval={2} dy={6} />
                    <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={TICK} width={40}
                      tickFormatter={(v: number) => v.toLocaleString()} />
                    <Tooltip cursor={BAR_CURSOR}
                      content={<ChartTip format={(v) => `판매량 ${v.toLocaleString()}개`} />} />
                    <Bar dataKey="qty" name="판매량" radius={BAR_RADIUS} maxBarSize={28} fill={C.blue2}>
                      {menuChart.map((_, i) => (
                        <Cell key={i} fill={i === menuPeak ? C.blue : C.blue2} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                )}
              </div>
              {/* 시간대 블록별 TOP3 */}
              <div className="mt-4 grid grid-cols-2 gap-2.5 md:grid-cols-5">
                {blockTop.map((b) => (
                  <div key={b.label} className="rounded-[12px] bg-[#f8f9fa] p-3">
                    <p className="mb-1.5 text-[11.5px] font-medium text-[#55595e]">{b.label}</p>
                    {b.top.length === 0 ? (
                      <p className="text-[12px] text-[#91959a]">데이터 없음</p>
                    ) : b.top.map(([menu, qty], i) => (
                      <p key={menu} className="truncate text-[12px] leading-[1.7] text-[#1d2022]">
                        <span className="mr-1.5 tabular-nums text-[#91959a]">{i + 1}</span>{menu}
                        <span className="ml-1 tabular-nums text-[#91959a]">{qty}</span>
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* ② 시간대별 × 세그먼트 평균 객단가 */}
          <Card className={cardCls}>
            <CardContent className="p-5">
              <CardHead
                title="시간대별 · 고객 세그먼트별 평균 객단가"
                desc="결제 금액이 기록된 주문 기준 · 세그먼트 정보 보유 고객만"
                right={
                  <div className={SEG_TRACK}>
                    {(['age', 'gender'] as const).map((m) => (
                      <button key={m} onClick={() => setTicketMode(m)} className={segBtn(ticketMode === m)}
                      >{m === 'age' ? '연령대' : '성별'}</button>
                    ))}
                  </div>
                }
              />
              <Insight text={insights.ticket} />
              {ticketChart.segments.length > 0 && (
                <div className="mb-3 flex flex-wrap items-center gap-1.5">
                  {ticketChart.segments.map((s) => {
                    const on = s === activeSeg;
                    return (
                      <button
                        key={s}
                        onClick={() => setHighlighted(s)}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] transition-colors',
                          on ? 'bg-[#f2f3f4] font-medium text-[#1d2022]' : 'text-[#55595e] hover:bg-[#f8f9fa]'
                        )}
                      >
                        <span className="h-2 w-2 rounded-full" style={{ background: on ? C.navy : C.gray }} />
                        {s}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="h-64">
                {ticketChart.segments.length === 0 ? (
                  <EmptyChart message="결제 금액과 고객 정보(연령/성별)가 함께 기록된 주문이 아직 없습니다." />
                ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={ticketChart.rows} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={TICK} interval={2} dy={6} />
                    <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={TICK} width={48}
                      tickFormatter={(v) => `${Math.round(v / 1000).toLocaleString()}천`} />
                    <Tooltip cursor={LINE_CURSOR}
                      content={<ChartTip format={(v, name) => `${name} ${fmtWon(v)}`} />} />
                    {orderedSegs.map((s) => {
                      const on = s === activeSeg;
                      return (
                        <Line key={s} type="monotone" dataKey={s} name={s}
                          stroke={on ? C.navy : C.gray} strokeWidth={on ? 2 : 1.25}
                          dot={false}
                          activeDot={on ? { r: 4, fill: '#fff', stroke: C.navy, strokeWidth: 2 } : { r: 2.5, fill: C.gray, strokeWidth: 0 }}
                          connectNulls isAnimationActive={false} />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ③ 재방문 주기 */}
          <div className="grid md:grid-cols-2 gap-4 [&>*]:min-w-0">
            <Card className={cardCls}>
              <CardContent className="p-5">
                <CardHead
                  title="재방문 주기 (Weekly)"
                  desc={<>첫 방문 → 두 번째 방문까지 걸린 기간 · 첫 방문 고객 {data.revisitCycle.base.toLocaleString()}명 기준</>}
                />
                <Insight text={insights.cycle} />
                <div className="h-48">
                  {data.revisitCycle.base === 0 ? (
                    <EmptyChart message="방문 데이터가 쌓이면 표시됩니다." />
                  ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.revisitCycle.weekly} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid {...GRID} />
                      <XAxis dataKey="bucket" axisLine={false} tickLine={false} tick={TICK} dy={6} />
                      <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={TICK} width={40}
                        tickFormatter={(v: number) => v.toLocaleString()} />
                      <Tooltip cursor={BAR_CURSOR}
                        content={<ChartTip format={(v) => `재방문 고객 ${v.toLocaleString()}명`} />} />
                      <Bar dataKey="customers" name="재방문 고객" radius={BAR_RADIUS} maxBarSize={36} fill={C.blue2}>
                        {data.revisitCycle.weekly.map((_, i) => (
                          <Cell key={i} fill={i === weeklyPeak ? C.blue : C.blue2} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card className={cardCls}>
              <CardContent className="p-5">
                <CardHead
                  title="재방문 주기 (Monthly)"
                  desc={<>30일 경과 후 미재방문 {data.revisitCycle.noRevisit.toLocaleString()}명</>}
                />
                <div className="h-48">
                  {data.revisitCycle.base === 0 ? (
                    <EmptyChart message="방문 데이터가 쌓이면 표시됩니다." />
                  ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.revisitCycle.monthly} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid {...GRID} />
                      <XAxis dataKey="bucket" axisLine={false} tickLine={false} tick={TICK} dy={6} />
                      <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={TICK} width={40}
                        tickFormatter={(v: number) => v.toLocaleString()} />
                      <Tooltip cursor={BAR_CURSOR}
                        content={<ChartTip format={(v) => `재방문 고객 ${v.toLocaleString()}명`} />} />
                      <Bar dataKey="customers" name="재방문 고객" radius={BAR_RADIUS} maxBarSize={36} fill={C.blue2}>
                        {data.revisitCycle.monthly.map((_, i) => (
                          <Cell key={i} fill={i === monthlyPeak ? C.blue : C.blue2} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ④ 요일 × 시간 히트맵 */}
          <Card className={cardCls}>
            <CardContent className="p-5">
              <CardHead
                title="방문 히트맵 (요일 × 시간)"
                desc="색이 진할수록 방문·주문이 많은 시간대"
                right={
                  <div className="flex items-center gap-1.5 text-[11px] text-[#91959a]">
                    적음
                    {[0, 0.25, 0.5, 0.75, 1].map((a) => (
                      <span key={a} className="h-2.5 w-2.5 rounded-[3px]" style={{ background: heatColor(a) }} />
                    ))}
                    많음
                  </div>
                }
              />
              <Insight text={insights.heat} />
              <div className="overflow-x-auto">
                <div className="min-w-[640px]">
                  <div className="grid" style={{ gridTemplateColumns: '28px repeat(24, 1fr)', gap: 3 }}>
                    <div />
                    {Array.from({ length: 24 }, (_, h) => (
                      <div key={h} className="text-center text-[10.5px] tabular-nums text-[#91959a]">{h % 3 === 0 ? h : ''}</div>
                    ))}
                    {DOW_LABELS.map((d, dow) => (
                      <React.Fragment key={dow}>
                        <div className="flex items-center text-[11px] text-[#55595e]">{d}</div>
                        {Array.from({ length: 24 }, (_, h) => {
                          const v = heatMap.get(`${dow}-${h}`) || 0;
                          const a = v / heatMax;
                          return (
                            <div key={`${dow}-${h}`} title={`${d}요일 ${h}시 · ${v.toLocaleString()}건`}
                              className="h-6 rounded-[5px]"
                              style={{ background: heatColor(a) }} />
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ⑤⑥⑦ 하단 3종 */}
          <div className="grid md:grid-cols-3 gap-4 [&>*]:min-w-0">
            <Card className={cardCls}>
              <CardContent className="p-5">
                <CardHead title="방문 횟수 분포" desc="단골화 퍼널 — 기간 내 고객별 방문 횟수" />
                <Insight text={insights.freq} />
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.visitFrequency} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid {...GRID} />
                      <XAxis dataKey="bucket" axisLine={false} tickLine={false} tick={TICK} dy={6} />
                      <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={TICK} width={40}
                        tickFormatter={(v: number) => v.toLocaleString()} />
                      <Tooltip cursor={BAR_CURSOR}
                        content={<ChartTip format={(v) => `고객 ${v.toLocaleString()}명`} />} />
                      <Bar dataKey="customers" name="고객" radius={BAR_RADIUS} maxBarSize={32} fill={C.blue2}>
                        {data.visitFrequency.map((_, i) => (
                          <Cell key={i} fill={i === freqPeak ? C.blue : C.blue2} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card className={cardCls}>
              <CardContent className="p-5">
                <CardHead title="신규 vs 재방문" desc="기간 내 방문·매출 비중" />
                <Insight text={insights.nvr} />
                <div className="mt-5 space-y-4">
                  {data.newVsReturning.map((r, i) => (
                    <div key={r.label}>
                      <div className="mb-1.5 flex items-center justify-between gap-2 text-[12.5px]">
                        <span className="flex items-center gap-1.5 text-[#1d2022]">
                          <span className="h-2 w-2 rounded-full" style={{ background: i === 0 ? C.blue2 : C.navy }} />
                          {r.label}
                        </span>
                        <span className="tabular-nums text-[#91959a]">{r.visits.toLocaleString()}건 · {fmtWon(r.revenue)}</span>
                      </div>
                      <ThinBar
                        pct={totalRevenue > 0 ? Math.max(2, Math.round((r.revenue / totalRevenue) * 100)) : 0}
                        color={i === 0 ? C.blue2 : C.navy}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card className={cardCls}>
              <CardContent className="p-5">
                <CardHead title="세그먼트별 30일 재방문율" desc="표본 10명 이상 세그먼트만 표시" />
                <Insight text={insights.seg} />
                <div className="max-h-52 space-y-2.5 overflow-y-auto pr-1">
                  {data.segmentRevisit.map((s, i) => (
                    <div key={s.segment} className="grid grid-cols-[88px_minmax(0,1fr)_44px] items-center gap-2.5">
                      <span className="truncate text-[12px] text-[#55595e]">{s.segment}</span>
                      <ThinBar pct={(Math.min(s.rate30, 100) / Math.min(segMax, 100)) * 100} color={i === 0 ? C.blue : C.blue2} />
                      <span className="text-right text-[12px] font-medium tabular-nums text-[#1d2022]">{s.rate30}%</span>
                    </div>
                  ))}
                  {data.segmentRevisit.length === 0 && <p className="text-[12px] text-[#91959a]">표본이 충분한 세그먼트가 없습니다.</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
