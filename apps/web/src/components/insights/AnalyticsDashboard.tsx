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
  Legend,
} from 'recharts';
import { RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

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
    <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-3">
      <span className="text-sm">💡</span>
      <p className="text-[13px] text-blue-900 leading-relaxed">{text}</p>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-neutral-400 gap-1.5">
      <span className="text-2xl">📊</span>
      <p className="text-sm">{message}</p>
    </div>
  );
}

const PERIODS = [
  { days: 30, label: '최근 30일' },
  { days: 90, label: '최근 90일' },
  { days: 180, label: '최근 180일' },
  { days: 0, label: '전체 기간' },
];

const SEG_COLORS = ['#2F6BD8', '#D8862F', '#3A9A5C', '#B0509E', '#7A6FD0', '#C0574A'];
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

  return (
    <div className="space-y-6">
      {/* 기간 필터 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              onClick={() => onChangeDays(p.days)}
              className={cn(
                'px-3.5 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                days === p.days
                  ? 'bg-neutral-900 text-white border-neutral-900'
                  : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {headerRight}
      </div>

      {isLoading || !data ? (
        <div className="flex items-center justify-center h-64 text-neutral-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> 데이터 분석 중...
        </div>
      ) : (
        <>
          {/* ① 시간대별 메뉴 판매량 */}
          <Card>
            <CardContent className="p-5">
              <h3 className="font-semibold text-neutral-900 mb-1">시간대별 메뉴 판매량</h3>
              <p className="text-xs text-neutral-500 mb-3">주문 데이터 기준 · KST · 메뉴를 선택하면 해당 메뉴만 표시</p>
              <Insight text={insights.menu} />
              <div className="flex gap-1.5 flex-wrap mb-4">
                <button
                  onClick={() => setSelectedMenu('__all__')}
                  className={cn('px-2.5 py-1 rounded-full text-xs border',
                    selectedMenu === '__all__' ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-600 border-neutral-200')}
                >전체</button>
                {data.menuByHour.topMenus.map((m) => (
                  <button key={m} onClick={() => setSelectedMenu(m)}
                    className={cn('px-2.5 py-1 rounded-full text-xs border max-w-[160px] truncate',
                      selectedMenu === m ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-600 border-neutral-200')}
                  >{m}</button>
                ))}
              </div>
              <div className="h-56">
                {data.menuByHour.hourlyTotals.length === 0 ? (
                  <EmptyChart message="아직 주문 메뉴 데이터가 없습니다. 주문 연동 후 자동으로 쌓입니다." />
                ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={menuChart} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
                    <XAxis dataKey="hour" tick={{ fontSize: 11 }} interval={1} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => [`${v}개`, '판매량']} />
                    <Bar dataKey="qty" fill="#2F6BD8" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                )}
              </div>
              {/* 시간대 블록별 TOP3 */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
                {blockTop.map((b) => (
                  <div key={b.label} className="bg-neutral-50 rounded-lg p-3">
                    <p className="text-[11px] font-semibold text-neutral-500 mb-1.5">{b.label}</p>
                    {b.top.length === 0 ? (
                      <p className="text-xs text-neutral-400">데이터 없음</p>
                    ) : b.top.map(([menu, qty], i) => (
                      <p key={menu} className="text-xs text-neutral-800 truncate">
                        <span className="font-bold text-neutral-400 mr-1">{i + 1}</span>{menu}
                        <span className="text-neutral-400 ml-1">{qty}</span>
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* ② 시간대별 × 세그먼트 평균 객단가 */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-semibold text-neutral-900">시간대별 · 고객 세그먼트별 평균 객단가</h3>
                <div className="flex gap-1">
                  {(['age', 'gender'] as const).map((m) => (
                    <button key={m} onClick={() => setTicketMode(m)}
                      className={cn('px-2.5 py-1 rounded-lg text-xs border',
                        ticketMode === m ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-600 border-neutral-200')}
                    >{m === 'age' ? '연령대' : '성별'}</button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-neutral-500 mb-3">결제 금액이 기록된 주문 기준 · 세그먼트 정보 보유 고객만</p>
              <Insight text={insights.ticket} />
              <div className="h-64">
                {ticketChart.segments.length === 0 ? (
                  <EmptyChart message="결제 금액과 고객 정보(연령/성별)가 함께 기록된 주문이 아직 없습니다." />
                ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={ticketChart.rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
                    <XAxis dataKey="hour" tick={{ fontSize: 11 }} interval={1} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}천`} width={42} />
                    <Tooltip formatter={(v: any, name: any) => [fmtWon(v), name]} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {ticketChart.segments.map((s, i) => (
                      <Line key={s} type="monotone" dataKey={s} stroke={SEG_COLORS[i % SEG_COLORS.length]}
                        strokeWidth={2} dot={{ r: 2.5, strokeWidth: 0 }} connectNulls />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ③ 재방문 주기 */}
          <div className="grid md:grid-cols-2 gap-4 [&>*]:min-w-0">
            <Card>
              <CardContent className="p-5">
                <h3 className="font-semibold text-neutral-900 mb-1">재방문 주기 (Weekly)</h3>
                <p className="text-xs text-neutral-500 mb-3">
                  첫 방문 → 두 번째 방문까지 걸린 기간 · 첫 방문 고객 {data.revisitCycle.base.toLocaleString()}명 기준
                </p>
                <Insight text={insights.cycle} />
                <div className="h-48">
                  {data.revisitCycle.base === 0 ? (
                    <EmptyChart message="방문 데이터가 쌓이면 표시됩니다." />
                  ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.revisitCycle.weekly} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
                      <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: any) => [`${v.toLocaleString()}명`, '재방문 고객']} />
                      <Bar dataKey="customers" fill="#2F6BD8" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <h3 className="font-semibold text-neutral-900 mb-1">재방문 주기 (Monthly)</h3>
                <p className="text-xs text-neutral-500 mb-3">
                  30일 경과 후 미재방문 {data.revisitCycle.noRevisit.toLocaleString()}명
                </p>
                <div className="h-48">
                  {data.revisitCycle.base === 0 ? (
                    <EmptyChart message="방문 데이터가 쌓이면 표시됩니다." />
                  ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.revisitCycle.monthly} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
                      <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: any) => [`${v.toLocaleString()}명`, '재방문 고객']} />
                      <Bar dataKey="customers" fill="#D8862F" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ④ 요일 × 시간 히트맵 */}
          <Card>
            <CardContent className="p-5">
              <h3 className="font-semibold text-neutral-900 mb-1">방문 히트맵 (요일 × 시간)</h3>
              <p className="text-xs text-neutral-500 mb-4">색이 진할수록 방문·주문이 많은 시간대</p>
              <Insight text={insights.heat} />
              <div className="overflow-x-auto">
                <div className="min-w-[640px]">
                  <div className="grid" style={{ gridTemplateColumns: '32px repeat(24, 1fr)', gap: 2 }}>
                    <div />
                    {Array.from({ length: 24 }, (_, h) => (
                      <div key={h} className="text-[10px] text-neutral-400 text-center">{h % 3 === 0 ? h : ''}</div>
                    ))}
                    {DOW_LABELS.map((d, dow) => (
                      <React.Fragment key={dow}>
                        <div className="text-[11px] text-neutral-500 flex items-center">{d}</div>
                        {Array.from({ length: 24 }, (_, h) => {
                          const v = heatMap.get(`${dow}-${h}`) || 0;
                          const a = v / heatMax;
                          return (
                            <div key={`${dow}-${h}`} title={`${d}요일 ${h}시 · ${v.toLocaleString()}건`}
                              className="h-5 rounded-[3px]"
                              style={{ background: a === 0 ? '#F1F3F6' : `rgba(47,107,216,${0.15 + a * 0.85})` }} />
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
            <Card>
              <CardContent className="p-5">
                <h3 className="font-semibold text-neutral-900 mb-1">방문 횟수 분포</h3>
                <p className="text-xs text-neutral-500 mb-3">단골화 퍼널 — 기간 내 고객별 방문 횟수</p>
                <Insight text={insights.freq} />
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.visitFrequency} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" vertical={false} />
                      <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: any) => [`${v.toLocaleString()}명`, '고객']} />
                      <Bar dataKey="customers" fill="#3A9A5C" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <h3 className="font-semibold text-neutral-900 mb-1">신규 vs 재방문</h3>
                <p className="text-xs text-neutral-500 mb-3">기간 내 방문·매출 비중</p>
                <Insight text={insights.nvr} />
                <div className="space-y-3 mt-6">
                  {data.newVsReturning.map((r, i) => (
                    <div key={r.label}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-neutral-800">{r.label}</span>
                        <span className="text-neutral-500">{r.visits.toLocaleString()}건 · {fmtWon(r.revenue)}</span>
                      </div>
                      <div className="h-2.5 bg-neutral-100 rounded-full">
                        <div className="h-full rounded-full"
                          style={{ width: `${totalRevenue > 0 ? Math.max(2, Math.round((r.revenue / totalRevenue) * 100)) : 0}%`,
                                   background: i === 0 ? '#2F6BD8' : '#D8862F' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <h3 className="font-semibold text-neutral-900 mb-1">세그먼트별 30일 재방문율</h3>
                <p className="text-xs text-neutral-500 mb-3">표본 10명 이상 세그먼트만 표시</p>
                <Insight text={insights.seg} />
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {data.segmentRevisit.map((s) => (
                    <div key={s.segment} className="flex items-center gap-2">
                      <span className="text-xs text-neutral-700 w-24 truncate">{s.segment}</span>
                      <div className="flex-1 h-2.5 bg-neutral-100 rounded-full">
                        <div className="h-full bg-[#7A6FD0] rounded-full" style={{ width: `${Math.min(s.rate30, 100)}%` }} />
                      </div>
                      <span className="text-xs text-neutral-600 w-12 text-right tabular-nums">{s.rate30}%</span>
                    </div>
                  ))}
                  {data.segmentRevisit.length === 0 && <p className="text-xs text-neutral-400">표본이 충분한 세그먼트가 없습니다.</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
