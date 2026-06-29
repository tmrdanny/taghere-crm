'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
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

interface Funnel { flow_start: number; cta_click: number; kakao_auth: number; success: number; success_manual: number; success_auto: number; fail: number }
interface FlowRow { flow_type: string; starts: number; success: number }
interface DailyRow { event_date: string; starts: number; success: number }
interface StoreRow { store_slug: string; store_name: string | null; starts: number; success: number }
interface Retention { earners: { once: number; twice: number; three_plus: number; total: number }; visitors: { new_visitors: number; total_visitors: number } }
interface Dropoff { consent: { agreed: number; not_agreed: number }; failReasons: { reason: string; cnt: number }[] }
interface HeatRow { dow: number; hour: number; cnt: number }
interface StoreDetail { flow_start: number; cta_click: number; kakao_auth: number; success: number; fail: number; coupon_download: number; feedback_submit: number }
interface OwnerUsageRow { event_name: string; cnt: number; owners: number }
interface OwnerStoreRow { name: string; cnt: number }
interface SegmentRow { segment: string; starts: number; success: number }
interface CouponEffect { total: { download: number; used: number }; daily: { event_date: string; download: number; used: number }[] }
interface RatingRow { rating: number; cnt: number }
interface NewCustRow { event_date: string; cnt: number }

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-lg bg-neutral-50 p-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-lg font-bold text-neutral-900">{value.toLocaleString()}</div>
      {sub && <div className="text-xs text-neutral-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function SegTable({ rows }: { rows: SegmentRow[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-neutral-400 border-b">
          <th className="py-1 font-medium">세그먼트</th>
          <th className="py-1 font-medium text-right">진입</th>
          <th className="py-1 font-medium text-right">성공</th>
          <th className="py-1 font-medium text-right">전환율</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const st = Number(r.starts), su = Number(r.success);
          const c = st > 0 ? Math.round((su / st) * 1000) / 10 : 0;
          return (
            <tr key={r.segment} className="border-b border-neutral-100">
              <td className="py-1.5 text-neutral-800 break-all">{r.segment}</td>
              <td className="py-1.5 text-right text-neutral-600">{st.toLocaleString()}</td>
              <td className="py-1.5 text-right text-neutral-600">{su.toLocaleString()}</td>
              <td className="py-1.5 text-right font-medium text-neutral-900">{c}%</td>
            </tr>
          );
        })}
        {rows.length === 0 && <tr><td colSpan={4} className="py-3 text-center text-neutral-400">데이터 없음</td></tr>}
      </tbody>
    </table>
  );
}

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
  const [retention, setRetention] = useState<Retention | null>(null);
  const [dropoff, setDropoff] = useState<Dropoff | null>(null);
  const [heat, setHeat] = useState<HeatRow[]>([]);
  const [openStore, setOpenStore] = useState<string | null>(null);
  const [storeDetail, setStoreDetail] = useState<StoreDetail | null>(null);
  const [ownerUsage, setOwnerUsage] = useState<OwnerUsageRow[]>([]);
  const [totalStores, setTotalStores] = useState(0);
  const [ownerStores, setOwnerStores] = useState<OwnerStoreRow[]>([]);
  const [coupon, setCoupon] = useState<CouponEffect | null>(null);
  const [segByDevice, setSegByDevice] = useState<SegmentRow[]>([]);
  const [segBySource, setSegBySource] = useState<SegmentRow[]>([]);
  const [ratings, setRatings] = useState<RatingRow[]>([]);
  const [newCust, setNewCust] = useState<NewCustRow[]>([]);
  const [prevFunnel, setPrevFunnel] = useState<Funnel | null>(null);
  const [prevRetention, setPrevRetention] = useState<Retention | null>(null);
  const [storeSort, setStoreSort] = useState<'asc' | 'desc'>('asc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = localStorage.getItem('adminToken');
    const headers = { Authorization: `Bearer ${token}` };
    const qs = `from=${toYmd(from)}&to=${toYmd(to)}`;
    // 직전 동일 기간(WoW 비교)
    const fromD = new Date(from), toD = new Date(to);
    const days = Math.round((toD.getTime() - fromD.getTime()) / 86400000) + 1;
    const pTo = new Date(fromD.getTime() - 86400000);
    const pFrom = new Date(pTo.getTime() - (days - 1) * 86400000);
    const pqs = `from=${toYmd(fmtDateInput(pFrom))}&to=${toYmd(fmtDateInput(pTo))}`;
    const get = (p: string, q = qs) => fetch(`${API_BASE}/api/admin/insights/${p}${p.includes('?') ? '&' : '?'}${q}`, { headers }).then((r) => r.json());
    try {
      const [f, u, d, s, ret, drp, hm, ou, os, ce, seg, rt, nc, pf, pr] = await Promise.all([
        get(`funnel${flowType ? `?flow_type=${flowType}` : ''}`),
        get('feature-usage'), get('daily'), get('stores'), get('retention'), get('dropoff'), get('heatmap'),
        get('owner-usage'), get('owner-stores'), get('coupon-effect'), get('segments'), get('ratings'), get('new-customers'),
        get('funnel', pqs), get('retention', pqs),
      ]);
      const err = f?.error || u?.error || d?.error || s?.error || ret?.error || drp?.error || hm?.error || ou?.error || os?.error || ce?.error || seg?.error || rt?.error || nc?.error;
      if (err) throw new Error(err);
      setFunnel(f);
      setFlows(u.flows || []);
      setActions(u.actions || {});
      setDaily(d.rows || []);
      setStores(s.rows || []);
      setRetention(ret);
      setDropoff(drp);
      setHeat(hm.rows || []);
      setOwnerUsage(ou.usage || []); setTotalStores(ou.totalStores || 0); setOwnerStores(os.rows || []);
      setCoupon(ce); setSegByDevice(seg.byDevice || []); setSegBySource(seg.bySource || []);
      setRatings(rt.rows || []); setNewCust(nc.rows || []);
      setPrevFunnel(pf); setPrevRetention(pr);
      setOpenStore(null);
      setStoreDetail(null);
    } catch (e: any) {
      setError(e?.message || '데이터 조회에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [from, to, flowType]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const toggleStore = async (slug: string) => {
    if (openStore === slug) { setOpenStore(null); setStoreDetail(null); return; }
    setOpenStore(slug);
    setStoreDetail(null);
    const token = localStorage.getItem('adminToken');
    const qs = `from=${toYmd(from)}&to=${toYmd(to)}&slug=${encodeURIComponent(slug)}`;
    try {
      const d = await fetch(`${API_BASE}/api/admin/insights/store-detail?${qs}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
      if (!d.error) setStoreDetail(d);
    } catch { /* noop */ }
  };

  // 히트맵 helpers (dow: 1=일 ~ 7=토)
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  const heatMax = Math.max(1, ...heat.map((h) => n(h.cnt)));
  const heatAt = (dow: number, hour: number) => n(heat.find((h) => h.dow === dow && h.hour === hour)?.cnt);

  // WoW 증감(%) — null이면 비교 불가
  const deltaPct = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);
  const OWNER_LABEL: Record<string, string> = {
    owner_message_send: '메시지 발송', owner_message_test_send: '메시지 테스트',
    owner_booster_create: '부스터 생성', owner_booster_payment: '부스터 결제', owner_booster_test_send: '부스터 테스트', owner_booster_report_save: '부스터 성과저장',
    owner_points_earn: '포인트 적립', owner_points_deduct: '포인트 차감', owner_stamps_earn: '스탬프 적립',
    owner_customer_add: '고객 추가', owner_customer_update: '고객 수정', owner_customer_delete: '고객 삭제', owner_customer_bulk_upload: '고객 대량등록',
    owner_automation_toggle: '자동화 토글', owner_automation_quickstart: '자동화 일괄시작',
    owner_localmkt_send: '지역마케팅 발송', owner_visit_source_save: '방문경로 설정',
    owner_settings_save: '설정 저장', owner_stamp_rewards_save: '스탬프 보상설정',
    owner_waiting_add: '웨이팅 추가', owner_waiting_call: '웨이팅 호출', owner_waiting_seat: '웨이팅 착석', owner_waiting_cancel: '웨이팅 취소',
  };

  // 퍼널 단계 (flow_start 대비 %)
  const fs = n(funnel?.flow_start);
  const funnelSteps = funnel
    ? [
        { label: '플로우 진입', key: 'flow_start', value: n(funnel.flow_start) },
        { label: 'CTA 클릭', key: 'cta_click', value: n(funnel.cta_click) },
        { label: '카카오 로그인', key: 'kakao_auth', value: n(funnel.kakao_auth) },
        { label: '적립 성공(수동)', key: 'success_manual', value: n(funnel.success_manual) },
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
    .map((r) => ({ slug: r.store_slug, name: r.store_name || r.store_slug, starts: n(r.starts), success: n(r.success), conv: pct(n(r.success), n(r.starts)) }))
    .sort((a, b) => (storeSort === 'asc' ? a.conv - b.conv : b.conv - a.conv));

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
          {/* 0. KPI 요약 (+WoW) */}
          {funnel && retention && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {(() => {
                const cur = { earn: n(funnel.success), conv: pct(n(funnel.success), n(funnel.flow_start)), nv: n(retention.visitors.new_visitors), re: pct(n(retention.earners.twice) + n(retention.earners.three_plus), n(retention.earners.total)) };
                const prev = prevFunnel && prevRetention
                  ? { earn: n(prevFunnel.success), conv: pct(n(prevFunnel.success), n(prevFunnel.flow_start)), nv: n(prevRetention.visitors.new_visitors), re: pct(n(prevRetention.earners.twice) + n(prevRetention.earners.three_plus), n(prevRetention.earners.total)) }
                  : null;
                const cards = [
                  { label: '총 적립 성공', value: cur.earn, prev: prev?.earn, unit: '' },
                  { label: '적립 전환율', value: cur.conv, prev: prev?.conv, unit: '%' },
                  { label: '신규 방문자', value: cur.nv, prev: prev?.nv, unit: '' },
                  { label: '재적립률', value: cur.re, prev: prev?.re, unit: '%' },
                ];
                return cards.map((c) => {
                  const dp = c.prev != null ? deltaPct(c.value, c.prev) : null;
                  return (
                    <Card key={c.label} className="p-4">
                      <div className="text-xs text-neutral-500">{c.label}</div>
                      <div className="text-xl font-bold text-neutral-900">{c.value.toLocaleString()}{c.unit}</div>
                      {dp != null && (
                        <div className={`text-xs mt-0.5 ${dp > 0 ? 'text-emerald-600' : dp < 0 ? 'text-red-600' : 'text-neutral-400'}`}>
                          {dp > 0 ? '▲' : dp < 0 ? '▼' : '–'} {Math.abs(dp)}% <span className="text-neutral-400">vs 직전</span>
                        </div>
                      )}
                    </Card>
                  );
                });
              })()}
            </div>
          )}

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
                <div className="text-xs text-neutral-500 pt-1 space-y-0.5">
                  <p>+ 자동 적립(재방문·로그인 생략): <b className="text-neutral-700">{n(funnel.success_auto).toLocaleString()}</b>건 → 총 적립 <b className="text-neutral-700">{n(funnel.success).toLocaleString()}</b>건</p>
                  <p>실패(이미적립 등): {n(funnel.fail).toLocaleString()}건</p>
                </div>
              )}
            </div>
          </Card>

          {/* 1b. 이탈 상세 (동의/실패) */}
          {dropoff && (
            <Card className="p-5">
              <h2 className="font-semibold text-neutral-800 mb-3">이탈 상세</h2>
              <div className="grid sm:grid-cols-2 gap-5">
                <div>
                  <div className="text-sm text-neutral-600 mb-1">동의 단계 이탈 (CTA 클릭 중 미동의)</div>
                  {(() => {
                    const a = n(dropoff.consent.agreed), na = n(dropoff.consent.not_agreed), tot = a + na;
                    return (
                      <>
                        <div className="text-2xl font-bold text-neutral-900">{pct(na, tot)}%</div>
                        <div className="text-xs text-neutral-400">미동의 {na.toLocaleString()} / 클릭 {tot.toLocaleString()}</div>
                      </>
                    );
                  })()}
                </div>
                <div>
                  <div className="text-sm text-neutral-600 mb-1">적립 실패 사유</div>
                  {dropoff.failReasons.length === 0 && <div className="text-sm text-neutral-400">없음</div>}
                  {dropoff.failReasons.map((r) => (
                    <div key={r.reason || 'unknown'} className="flex justify-between text-sm py-0.5">
                      <span className="text-neutral-700">{r.reason || '(미상)'}</span>
                      <span className="font-medium text-neutral-900">{n(r.cnt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

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

          {/* 2b. 신규/재방문 + 재적립 */}
          {retention && (
            <Card className="p-5">
              <h2 className="font-semibold text-neutral-800 mb-1">신규 · 재방문 · 재적립</h2>
              <p className="text-xs text-neutral-400 mb-3">user_id 기반 — 같은 고객이 다시 적립하나(충성도)</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(() => {
                  const nv = n(retention.visitors.new_visitors), tv = n(retention.visitors.total_visitors);
                  const e = retention.earners, repeat = n(e.twice) + n(e.three_plus);
                  return (
                    <>
                      <Stat label="순 방문자" value={tv} />
                      <Stat label="신규 방문" value={nv} sub={`${pct(nv, tv)}%`} />
                      <Stat label="적립 고객(식별)" value={n(e.total)} />
                      <Stat label="재적립 고객" value={repeat} sub={`재적립률 ${pct(repeat, n(e.total))}%`} />
                    </>
                  );
                })()}
              </div>
              <div className="text-sm mt-3 text-neutral-600">
                재적립 횟수 — 1회 <b className="text-neutral-900">{n(retention.earners.once).toLocaleString()}</b>
                {' · '}2회 <b className="text-neutral-900">{n(retention.earners.twice).toLocaleString()}</b>
                {' · '}3회+ <b className="text-neutral-900">{n(retention.earners.three_plus).toLocaleString()}</b>
              </div>
            </Card>
          )}

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

          {/* 4b. 시간대·요일 히트맵 */}
          <Card className="p-5">
            <h2 className="font-semibold text-neutral-800 mb-1">시간대 · 요일 히트맵 (적립 진입)</h2>
            <p className="text-xs text-neutral-400 mb-3">KST 기준 · 진한 칸 = 진입 많음</p>
            <div className="overflow-x-auto">
              <div className="inline-grid" style={{ gridTemplateColumns: '32px repeat(24, 18px)', gap: 2 }}>
                <div />
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={`hh${h}`} className="text-[9px] text-neutral-400 text-center">{h % 6 === 0 ? h : ''}</div>
                ))}
                {[1, 2, 3, 4, 5, 6, 7].flatMap((dow) => [
                  <div key={`l${dow}`} className="text-[10px] text-neutral-500 flex items-center">{DOW[dow - 1]}</div>,
                  ...Array.from({ length: 24 }, (_, h) => {
                    const c = heatAt(dow, h);
                    const op = c > 0 ? 0.12 + 0.88 * (c / heatMax) : 0;
                    return <div key={`${dow}-${h}`} title={`${DOW[dow - 1]} ${h}시 · ${c.toLocaleString()}건`} style={{ height: 18, borderRadius: 2, background: c > 0 ? `rgba(255,179,0,${op})` : '#f3f4f6' }} />;
                  }),
                ])}
              </div>
            </div>
          </Card>

          {/* 5. 매장별 전환율 (개선 타겟) */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold text-neutral-800">매장별 전환율 {storeSort === 'asc' ? '(개선 타겟)' : '(우수 매장)'}</h2>
              <div className="flex gap-1">
                <button onClick={() => setStoreSort('asc')} className={`px-2.5 py-1 rounded text-xs ${storeSort === 'asc' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'}`}>개선 타겟</button>
                <button onClick={() => setStoreSort('desc')} className={`px-2.5 py-1 rounded text-xs ${storeSort === 'desc' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'}`}>우수 매장</button>
              </div>
            </div>
            <p className="text-xs text-neutral-400 mb-3">시작 20건 이상 · {storeSort === 'asc' ? '전환율 낮은 순(개선 후보)' : '전환율 높은 순(잘 쓰는 매장)'}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-neutral-500 border-b">
                    <th className="py-2 font-medium">매장</th>
                    <th className="py-2 font-medium text-right">진입</th>
                    <th className="py-2 font-medium text-right">성공</th>
                    <th className="py-2 font-medium text-right">전환율</th>
                  </tr>
                </thead>
                <tbody>
                  {storeRows.slice(0, 20).map((r) => (
                    <Fragment key={r.slug}>
                      <tr onClick={() => toggleStore(r.slug)} className="border-b border-neutral-100 cursor-pointer hover:bg-neutral-50">
                        <td className="py-2 text-neutral-800 break-all">
                          <span className="text-neutral-400 mr-1">{openStore === r.slug ? '▾' : '▸'}</span>
                          {r.name}
                          {r.name !== r.slug && <span className="block text-xs text-neutral-400 ml-4">{r.slug}</span>}
                        </td>
                        <td className="py-2 text-right text-neutral-600">{r.starts.toLocaleString()}</td>
                        <td className="py-2 text-right text-neutral-600">{r.success.toLocaleString()}</td>
                        <td className={`py-2 text-right font-medium ${r.conv < 10 ? 'text-red-600' : 'text-neutral-900'}`}>{r.conv}%</td>
                      </tr>
                      {openStore === r.slug && (
                        <tr className="bg-neutral-50">
                          <td colSpan={4} className="py-3 px-3">
                            {!storeDetail ? (
                              <div className="text-xs text-neutral-400">불러오는 중…</div>
                            ) : (
                              <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-neutral-600">
                                <span>진입 <b className="text-neutral-900">{n(storeDetail.flow_start).toLocaleString()}</b></span>
                                <span>CTA <b className="text-neutral-900">{n(storeDetail.cta_click).toLocaleString()}</b></span>
                                <span>카카오 <b className="text-neutral-900">{n(storeDetail.kakao_auth).toLocaleString()}</b></span>
                                <span>성공 <b className="text-neutral-900">{n(storeDetail.success).toLocaleString()}</b></span>
                                <span>실패 <b className="text-neutral-900">{n(storeDetail.fail).toLocaleString()}</b></span>
                                <span>쿠폰다운 <b className="text-neutral-900">{n(storeDetail.coupon_download).toLocaleString()}</b></span>
                                <span>피드백 <b className="text-neutral-900">{n(storeDetail.feedback_submit).toLocaleString()}</b></span>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                  {storeRows.length === 0 && (
                    <tr><td colSpan={4} className="py-6 text-center text-neutral-400">데이터 없음</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* 6. 별점 분포 */}
          {ratings.length > 0 && (
            <Card className="p-5">
              <h2 className="font-semibold text-neutral-800 mb-3">피드백 별점 분포</h2>
              {(() => {
                const tot = ratings.reduce((s, r) => s + n(r.cnt), 0);
                const avg = tot > 0 ? Math.round((ratings.reduce((s, r) => s + n(r.rating) * n(r.cnt), 0) / tot) * 100) / 100 : 0;
                const five = n(ratings.find((r) => n(r.rating) === 5)?.cnt);
                const max = Math.max(1, ...ratings.map((r) => n(r.cnt)));
                return (
                  <>
                    <div className="flex gap-4 text-sm mb-3">
                      <span>평균 <b className="text-neutral-900">{avg}점</b></span>
                      <span>5점 비율 <b className="text-neutral-900">{pct(five, tot)}%</b></span>
                      <span className="text-neutral-400">총 {tot.toLocaleString()}건</span>
                    </div>
                    <div className="space-y-1.5">
                      {[5, 4, 3, 2, 1].map((star) => {
                        const c = n(ratings.find((r) => n(r.rating) === star)?.cnt);
                        return (
                          <div key={star} className="flex items-center gap-2 text-sm">
                            <span className="w-8 text-neutral-500">{star}점</span>
                            <div className="flex-1 h-3 bg-neutral-100 rounded"><div className="h-3 rounded bg-[#FFD541]" style={{ width: `${(c / max) * 100}%` }} /></div>
                            <span className="w-14 text-right text-neutral-700">{c.toLocaleString()}</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </Card>
          )}

          {/* 7. 쿠폰 효과 */}
          {coupon && (
            <Card className="p-5">
              <h2 className="font-semibold text-neutral-800 mb-3">쿠폰 효과 (다운 → 사용)</h2>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <Stat label="다운로드" value={n(coupon.total.download)} />
                <Stat label="사용" value={n(coupon.total.used)} />
                <Stat label="사용 전환율" value={pct(n(coupon.total.used), n(coupon.total.download))} sub="다운 대비 %" />
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={coupon.daily.map((r) => ({ date: `${r.event_date.slice(4, 6)}/${r.event_date.slice(6, 8)}`, 다운: n(r.download), 사용: n(r.used) }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Legend />
                  <Line type="monotone" dataKey="다운" stroke="#C7CCD1" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="사용" stroke="#10B981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* 8. 기기/유입경로별 전환 */}
          <Card className="p-5">
            <h2 className="font-semibold text-neutral-800 mb-3">기기 · 유입경로별 전환</h2>
            <div className="grid md:grid-cols-2 gap-5">
              <div>
                <div className="text-sm text-neutral-600 mb-2">기기별</div>
                <SegTable rows={segByDevice} />
              </div>
              <div>
                <div className="text-sm text-neutral-600 mb-2">유입경로별 (source / medium)</div>
                <SegTable rows={segBySource} />
              </div>
            </div>
          </Card>

          {/* 9. 신규 고객 획득 추이 */}
          <Card className="p-5">
            <h2 className="font-semibold text-neutral-800 mb-3">신규 고객 획득 추이 (first_visit)</h2>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={newCust.map((r) => ({ date: `${r.event_date.slice(4, 6)}/${r.event_date.slice(6, 8)}`, 신규: n(r.cnt) }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Legend />
                <Line type="monotone" dataKey="신규" stroke="#6BA3FF" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* 10. 사장님 기능 사용 현황 */}
          <Card className="p-5">
            <h2 className="font-semibold text-neutral-800 mb-1">사장님 기능 사용 현황</h2>
            <p className="text-xs text-neutral-400 mb-3">owner 이벤트 · 부스터는 06-30부터 데이터 · 채택률 = 쓴 사장님 / 전체 매장({totalStores.toLocaleString()})</p>
            {ownerUsage.length === 0 ? (
              <div className="text-sm text-neutral-400">기간 내 사장님 활동 없음</div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  {ownerUsage.map((r) => (
                    <div key={r.event_name} className="rounded-lg bg-neutral-50 p-3">
                      <div className="text-xs text-neutral-500">{OWNER_LABEL[r.event_name] || r.event_name}</div>
                      <div className="text-lg font-bold text-neutral-900">{n(r.cnt).toLocaleString()}</div>
                      <div className="text-xs text-neutral-400">사장님 {n(r.owners)} · 채택 {pct(n(r.owners), totalStores)}%</div>
                    </div>
                  ))}
                </div>
                {ownerStores.length > 0 && (
                  <div>
                    <div className="text-sm text-neutral-600 mb-2">기능 활발한 매장 Top</div>
                    <div className="space-y-1">
                      {ownerStores.map((st, i) => (
                        <div key={i} className="flex justify-between text-sm border-b border-neutral-100 py-1">
                          <span className="text-neutral-800 break-all">{st.name}</span>
                          <span className="font-medium text-neutral-900">{n(st.cnt).toLocaleString()}건</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
