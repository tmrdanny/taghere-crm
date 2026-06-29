'use client';

import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '@/lib/api-config';
import { Card } from '@/components/ui/card';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Cell,
} from 'recharts';

// ── helpers
const n = (x: unknown) => Number(x ?? 0);
const pad = (v: number) => String(v).padStart(2, '0');
const toYmd = (dashed: string) => dashed.replaceAll('-', '');
const fmtDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);
const FLOW_LABEL: Record<string, string> = { points: '포인트', membership: '멤버십', stamp: '스탬프' };
const ACTION_LABEL: Record<string, string> = {
  coupon_download: '쿠폰 다운', coupon_used: '쿠폰 사용', table_link_confirm: '테이블링크',
  feedback_submit: '피드백 제출', survey_submit: '설문 제출', visit_source_select: '방문경로 선택',
};

interface Funnel { flow_start: number; cta_click: number; kakao_auth: number; success: number; fail: number }
interface FlowRow { flow_type: string; starts: number; success: number }
interface DailyRow { event_date: string; starts: number; success: number }
interface StoreRow { store_slug: string; starts: number; success: number }

export default function InsightsPage() {
  const today = new Date();
  const [from, setFrom] = useState(fmtDateInput(new Date(today.getTime() - 13 * 86400000)));
  const [to, setTo] = useState(fmtDateInput(today));
  const [flowType, setFlowType] = useState('');
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [flows, setFlows] = useState<FlowRow[]>([]);
  const [actions, setActions] = useState<Record<string, number>>({});
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = localStorage.getItem('adminToken');
    const headers = { Authorization: `Bearer ${token}` };
    const qs = `from=${toYmd(from)}&to=${toYmd(to)}`;
    try {
      const [f, u, d, s] = await Promise.all([
        fetch(`${API_BASE}/api/admin/insights/funnel?${qs}${flowType ? `&flow_type=${flowType}` : ''}`, { headers }).then((r) => r.json()),
        fetch(`${API_BASE}/api/admin/insights/feature-usage?${qs}`, { headers }).then((r) => r.json()),
        fetch(`${API_BASE}/api/admin/insights/daily?${qs}`, { headers }).then((r) => r.json()),
        fetch(`${API_BASE}/api/admin/insights/stores?${qs}`, { headers }).then((r) => r.json()),
      ]);
      const err = f?.error || u?.error || d?.error || s?.error;
      if (err) throw new Error(err);
      setFunnel(f);
      setFlows(u.flows || []);
      setActions(u.actions || {});
      setDaily(d.rows || []);
      setStores(s.rows || []);
    } catch (e: any) {
      setError(e?.message || '데이터 조회에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [from, to, flowType]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // 퍼널 단계 (flow_start 대비 %)
  const fs = n(funnel?.flow_start);
  const funnelSteps = funnel
    ? [
        { label: '플로우 진입', key: 'flow_start', value: n(funnel.flow_start) },
        { label: 'CTA 클릭', key: 'cta_click', value: n(funnel.cta_click) },
        { label: '카카오 로그인', key: 'kakao_auth', value: n(funnel.kakao_auth) },
        { label: '적립 성공', key: 'success', value: n(funnel.success) },
      ]
    : [];

  const flowChart = flows.map((r) => ({
    name: FLOW_LABEL[r.flow_type] || r.flow_type,
    시작: n(r.starts), 완주: n(r.success), conv: pct(n(r.success), n(r.starts)),
  }));
  const dailyChart = daily.map((r) => ({
    date: `${r.event_date.slice(4, 6)}/${r.event_date.slice(6, 8)}`,
    시작: n(r.starts), 완주: n(r.success),
  }));
  const storeRows = stores
    .map((r) => ({ slug: r.store_slug, starts: n(r.starts), success: n(r.success), conv: pct(n(r.success), n(r.starts)) }))
    .sort((a, b) => a.conv - b.conv);

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto w-full space-y-5">
      {/* 헤더 + 기간 필터 */}
      <div className="flex flex-wrap items-end gap-3 justify-between">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">고객 행동 인사이트</h1>
          <p className="text-sm text-neutral-500 mt-0.5">CRM(prod) 고객 적립 플로우 · 기능 사용 분석</p>
        </div>
        <div className="flex items-end gap-2">
          <label className="text-xs text-neutral-500">시작
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="block border rounded px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-neutral-500">종료
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="block border rounded px-2 py-1.5 text-sm" />
          </label>
          <button onClick={fetchAll} className="px-3 py-1.5 rounded bg-neutral-900 text-white text-sm font-medium">새로고침</button>
        </div>
      </div>

      <p className="text-xs text-amber-600 bg-amber-50 rounded px-3 py-2">
        ※ CTA 클릭 이벤트는 2026-06-30부터 정확히 집계됩니다(하단 버튼 누락 수정 반영). 이전 기간은 과소 집계될 수 있어요.
      </p>

      {error && <div className="rounded bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}
      {loading && <div className="text-neutral-400 text-sm py-10 text-center">불러오는 중…</div>}

      {!loading && !error && (
        <>
          {/* 1. 적립 퍼널 */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-neutral-800">적립 퍼널 (이탈 지점)</h2>
              <div className="flex gap-1">
                {['', 'points', 'membership', 'stamp'].map((ft) => (
                  <button key={ft} onClick={() => setFlowType(ft)}
                    className={`px-2.5 py-1 rounded text-xs ${flowType === ft ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'}`}>
                    {ft === '' ? '전체' : FLOW_LABEL[ft]}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2.5">
              {funnelSteps.map((s, i) => {
                const prev = i > 0 ? funnelSteps[i - 1].value : s.value;
                return (
                  <div key={s.key}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-neutral-700">{s.label}</span>
                      <span className="text-neutral-900 font-medium">
                        {s.value.toLocaleString()}
                        <span className="text-neutral-400 font-normal ml-2">
                          {i === 0 ? '100%' : `전단계 ${pct(s.value, prev)}%`}
                        </span>
                      </span>
                    </div>
                    <div className="h-3 bg-neutral-100 rounded">
                      <div className="h-3 rounded bg-[#FFD541]" style={{ width: `${fs > 0 ? (s.value / fs) * 100 : 0}%` }} />
                    </div>
                  </div>
                );
              })}
              {funnel && (
                <p className="text-xs text-neutral-500 pt-1">실패(이미적립 등): {n(funnel.fail).toLocaleString()}건</p>
              )}
            </div>
          </Card>

          {/* 2. 기능별 사용 (적립방식) */}
          <Card className="p-5">
            <h2 className="font-semibold text-neutral-800 mb-1">적립방식별 사용 · 전환율</h2>
            <p className="text-xs text-neutral-400 mb-3">어떤 적립 방식이 많이 시작되고, 완주가 잘 되나</p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={flowChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any, k: any) => [Number(v).toLocaleString(), k]} />
                <Legend />
                <Bar dataKey="시작" fill="#C7CCD1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="완주" fill="#FFD541" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-4 text-sm mt-1">
              {flowChart.map((r) => (
                <span key={r.name} className="text-neutral-600">{r.name} 전환율 <b className="text-neutral-900">{r.conv}%</b></span>
              ))}
            </div>
          </Card>

          {/* 3. 핵심 액션 */}
          <Card className="p-5">
            <h2 className="font-semibold text-neutral-800 mb-3">핵심 액션 사용량</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Object.keys(ACTION_LABEL).map((key) => (
                <div key={key} className="rounded-lg bg-neutral-50 p-3">
                  <div className="text-xs text-neutral-500">{ACTION_LABEL[key]}</div>
                  <div className="text-lg font-bold text-neutral-900">{n(actions[key]).toLocaleString()}</div>
                </div>
              ))}
            </div>
            <p className="text-sm text-neutral-600 mt-3">
              쿠폰 발급→사용 전환율: <b className="text-neutral-900">{pct(n(actions.coupon_used), n(actions.coupon_download))}%</b>
              <span className="text-neutral-400"> (다운 {n(actions.coupon_download).toLocaleString()} → 사용 {n(actions.coupon_used).toLocaleString()})</span>
            </p>
          </Card>

          {/* 4. 일별 추이 */}
          <Card className="p-5">
            <h2 className="font-semibold text-neutral-800 mb-3">일별 추이 (진입 · 성공)</h2>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={dailyChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any, k: any) => [Number(v).toLocaleString(), k]} />
                <Legend />
                <Line type="monotone" dataKey="시작" stroke="#C7CCD1" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="완주" stroke="#FFB300" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* 5. 매장별 전환율 (개선 타겟) */}
          <Card className="p-5">
            <h2 className="font-semibold text-neutral-800 mb-1">매장별 전환율 (개선 타겟)</h2>
            <p className="text-xs text-neutral-400 mb-3">시작 20건 이상 · 전환율 낮은 순. 낮은 매장이 개선 후보</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-neutral-500 border-b">
                    <th className="py-2 font-medium">매장(slug)</th>
                    <th className="py-2 font-medium text-right">진입</th>
                    <th className="py-2 font-medium text-right">성공</th>
                    <th className="py-2 font-medium text-right">전환율</th>
                  </tr>
                </thead>
                <tbody>
                  {storeRows.slice(0, 20).map((r) => (
                    <tr key={r.slug} className="border-b border-neutral-100">
                      <td className="py-2 text-neutral-800 break-all">{r.slug}</td>
                      <td className="py-2 text-right text-neutral-600">{r.starts.toLocaleString()}</td>
                      <td className="py-2 text-right text-neutral-600">{r.success.toLocaleString()}</td>
                      <td className={`py-2 text-right font-medium ${r.conv < 10 ? 'text-red-600' : 'text-neutral-900'}`}>{r.conv}%</td>
                    </tr>
                  ))}
                  {storeRows.length === 0 && (
                    <tr><td colSpan={4} className="py-6 text-center text-neutral-400">데이터 없음</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
