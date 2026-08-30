'use client';

import { API_BASE } from '@/lib/api-config';
import { memo, useEffect, useMemo, useState } from 'react';
import { formatNumber } from '@/lib/utils';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

interface RuleTypeCount {
  enabled: number;
  effective: number;
}

interface AutomationStats {
  totalStores: number;
  crmEnabledStores: number;
  activeStores: number;
  effectiveActiveStores: number;
  totalRulesEnabled: number;
  effectiveRulesEnabled: number;
  totalSentThisMonth: number;
  totalCouponUsed: number;
  usageRate: number;
  ruleTypeBreakdown: Record<string, RuleTypeCount>;
  funnel: {
    totalStores: number;
    visitedStores: number;
    enabledStores: number;
    effectiveStores: number;
    sendingStores30d: number;
  };
}

type StoreStatus = 'EFFECTIVE' | 'ENABLED_BLOCKED' | 'VISITED' | 'NOT_VISITED';

interface StoreAutomation {
  storeId: string;
  storeName: string;
  ownerName: string | null;
  crmEnabled: boolean;
  hasVisited: boolean;
  enabledRules: string[];
  effectiveRules: string[];
  status: StoreStatus;
  totalSent: number;
  couponUsed: number;
  usageRate: number;
  lastSentAt: string | null;
}

interface TrendItem {
  date: string;
  sent: number;
  couponUsed: number;
  newActivations: number;
  deactivations: number;
  activeStores: number | null;
  totalStoresAtDate: number;
  crmEnabledStores: number;
}

const RULE_TYPE_LABELS: Record<string, string> = {
  BIRTHDAY: '생일 축하',
  CHURN_PREVENTION: '이탈 방지',
  ANNIVERSARY: '기념일',
  FIRST_VISIT_FOLLOWUP: '첫 방문 후속',
  VIP_MILESTONE: 'VIP 마일스톤',
  WINBACK: '윈백',
  SLOW_DAY: '비수기',
};

const STATUS_LABELS: Record<StoreStatus, string> = {
  EFFECTIVE: '유효 활성',
  ENABLED_BLOCKED: '발송불가',
  VISITED: '방문만',
  NOT_VISITED: '미방문',
};

const STATUS_BADGE_CLASS: Record<StoreStatus, string> = {
  EFFECTIVE: 'bg-emerald-50 text-emerald-700',
  ENABLED_BLOCKED: 'bg-amber-50 text-amber-700',
  VISITED: 'bg-neutral-100 text-neutral-500',
  NOT_VISITED: 'bg-neutral-50 text-neutral-400',
};

const CHART_COLORS = {
  sent: '#FFD541',
  couponUsed: '#10B981',
};

const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

type SortKey = 'default' | 'storeName' | 'totalSent' | 'usageRate' | 'lastSentAt';
type StatusFilter = 'ALL' | StoreStatus;

export default function AdminAutomationPage() {
  const [stats, setStats] = useState<AutomationStats | null>(null);
  const [stores, setStores] = useState<StoreAutomation[]>([]);
  const [trend, setTrend] = useState<TrendItem[]>([]);
  const [trendDays, setTrendDays] = useState(30);
  const [isLoading, setIsLoading] = useState(true);
  const [hoveredTrendIndex, setHoveredTrendIndex] = useState<number | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    let ignore = false;

    const fetchData = async () => {
      try {
        const [statsRes, storesRes] = await Promise.all([
          fetch(`${API_BASE}/api/admin/automation-stats`, { headers }),
          fetch(`${API_BASE}/api/admin/automation-stores`, { headers }),
        ]);

        if (statsRes.ok) {
          const data = await statsRes.json();
          if (!ignore) setStats(data);
        }
        if (storesRes.ok) {
          const data = await storesRes.json();
          if (!ignore) setStores(data.stores);
        }
      } catch (error) {
        console.error('Failed to fetch automation data:', error);
      } finally {
        if (!ignore) setIsLoading(false);
      }
    };

    fetchData();
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    let ignore = false; // 30↔90 빠른 토글 시 늦게 도착한 이전 응답이 최신 상태를 덮지 않도록

    const fetchTrend = async () => {
      try {
        const trendRes = await fetch(`${API_BASE}/api/admin/automation-trend?days=${trendDays}`, { headers });
        if (trendRes.ok) {
          const data = await trendRes.json();
          if (!ignore) setTrend(data.trend);
        }
      } catch (error) {
        console.error('Failed to fetch automation trend:', error);
      }
    };

    fetchTrend();
    return () => { ignore = true; };
  }, [trendDays]);

  // 최근 30일 활성화 변동 (추세 데이터 뒤 30일 구간 합산)
  const recentChange = useMemo(() => {
    const recent = trend.slice(-30);
    return {
      newActivations: recent.reduce((sum, t) => sum + t.newActivations, 0),
      deactivations: recent.reduce((sum, t) => sum + t.deactivations, 0),
    };
  }, [trend]);

  // 활성화 추세 차트 데이터 (활성화율은 FE 계산)
  const activationChartData = useMemo(
    () =>
      trend.map(t => ({
        ...t,
        label: t.date.slice(5),
        activationRate: t.activeStores !== null ? pct(t.activeStores, t.totalStoresAtDate) : null,
      })),
    [trend]
  );
  const hasActivationHistory = activationChartData.some(t => t.activeStores !== null);
  // 이력 시작이 조회 구간 중간이면(선행 null 구간 존재) 첫 집계일 캡션 표시
  const firstHistoryDate =
    activationChartData[0]?.activeStores === null
      ? activationChartData.find(t => t.activeStores !== null)?.date
      : undefined;

  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // 발송 추세 차트 데이터 계산
  const maxSent = Math.max(...trend.map(t => t.sent), 1);
  const trendPoints = trend.map((t, i) => {
    const x = trend.length > 1 ? (i / (trend.length - 1)) * 92 + 4 : 50;
    const y = 85 - (t.sent / maxSent) * 70;
    return { x, y, ...t };
  });
  const trendLine = trendPoints.map(p => `${p.x},${p.y}`).join(' ');
  const trendArea = trendPoints.length > 0
    ? `M ${trendPoints[0].x},85 L ${trendPoints.map(p => `${p.x},${p.y}`).join(' L ')} L ${trendPoints[trendPoints.length - 1].x},85 Z`
    : '';

  // 쿠폰 사용 라인
  const maxCoupon = Math.max(...trend.map(t => t.couponUsed), 1);
  const couponPoints = trend.map((t, i) => {
    const x = trend.length > 1 ? (i / (trend.length - 1)) * 92 + 4 : 50;
    const y = 85 - (t.couponUsed / maxCoupon) * 70;
    return { x, y };
  });
  const couponLine = couponPoints.map(p => `${p.x},${p.y}`).join(' ');

  // 룰 타입별 바 차트 데이터
  const ruleTypes = Object.keys(RULE_TYPE_LABELS);
  const maxRuleCount = Math.max(...ruleTypes.map(t => stats?.ruleTypeBreakdown[t]?.enabled || 0), 1);

  // 퍼널 데이터
  const funnelSteps = stats
    ? [
        { label: '전체 매장', value: stats.funnel.totalStores },
        { label: '자동화 룰 생성 (방문·본사설정)', value: stats.funnel.visitedStores },
        { label: '룰 활성화', value: stats.funnel.enabledStores },
        { label: '유효 활성 (발송 가능)', value: stats.funnel.effectiveStores },
        { label: '유효 활성 중 30일 내 발송', value: stats.funnel.sendingStores30d },
      ]
    : [];

  return (
    <div>
      <h1 className="text-[22px] font-semibold text-neutral-900 mb-6">자동 마케팅 현황</h1>

      {/* KPI 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-6">
          <p className="text-[14px] text-neutral-500 mb-2">유효 활성 매장</p>
          <p className="text-[28px] font-semibold text-neutral-900">
            {stats?.effectiveActiveStores ?? 0}
            <span className="text-[16px] font-normal text-neutral-400 ml-1">/ {stats?.totalStores ?? 0}</span>
          </p>
          <p className="text-[13px] text-neutral-400 mt-1">
            전체 {stats ? pct(stats.effectiveActiveStores, stats.totalStores) : 0}% · CRM 매장 {stats ? pct(stats.effectiveActiveStores, stats.crmEnabledStores) : 0}%
          </p>
          <p className="text-[12px] text-neutral-400 mt-0.5">
            켜진 매장 {stats?.activeStores ?? 0}곳 (발송불가 포함)
          </p>
        </div>
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-6">
          <p className="text-[14px] text-neutral-500 mb-2">최근 30일 활성화 변동</p>
          <p className="text-[28px] font-semibold">
            <span className="text-emerald-600">+{recentChange.newActivations}</span>
            <span className="text-[20px] text-neutral-300 mx-1">/</span>
            <span className="text-red-500">−{recentChange.deactivations}</span>
          </p>
          <p className="text-[13px] text-neutral-400 mt-1">
            신규 활성화 {recentChange.newActivations}곳 · 이탈 {recentChange.deactivations}곳
          </p>
        </div>
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-6">
          <p className="text-[14px] text-neutral-500 mb-2">이번 달 발송</p>
          <p className="text-[28px] font-semibold text-neutral-900">
            {formatNumber(stats?.totalSentThisMonth ?? 0)}
            <span className="text-[16px] font-normal text-neutral-400 ml-1">건</span>
          </p>
          <p className="text-[13px] text-neutral-400 mt-1">
            유효 활성 룰 {formatNumber(stats?.effectiveRulesEnabled ?? 0)}개 / 켜진 룰 {formatNumber(stats?.totalRulesEnabled ?? 0)}개
          </p>
        </div>
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-6">
          <p className="text-[14px] text-neutral-500 mb-2">쿠폰 사용률</p>
          <p className="text-[28px] font-semibold text-neutral-900">
            {stats?.usageRate ?? 0}
            <span className="text-[16px] font-normal text-neutral-400 ml-1">%</span>
          </p>
          <p className="text-[13px] text-neutral-400 mt-1">
            {formatNumber(stats?.totalCouponUsed ?? 0)}건 사용
          </p>
        </div>
      </div>

      {/* 활성화 퍼널 + 활성화 추세 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        {/* 퍼널 */}
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-6">
          <p className="text-[14px] font-medium text-neutral-900 mb-4">활성화 퍼널</p>
          <div className="space-y-4">
            {funnelSteps.map((step, i) => {
              const base = funnelSteps[0]?.value || 1;
              const prev = i > 0 ? funnelSteps[i - 1].value : null;
              const width = Math.max((step.value / base) * 100, step.value > 0 ? 2 : 0);
              return (
                <div key={step.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] text-neutral-600">{step.label}</span>
                    <span className="text-[12px] font-medium text-neutral-900">
                      {formatNumber(step.value)}곳
                      {prev !== null && (
                        <span className="text-neutral-400 font-normal ml-1.5">{pct(step.value, prev)}%</span>
                      )}
                    </span>
                  </div>
                  <div className="h-3 bg-neutral-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${width}%`, backgroundColor: '#FFD541' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-neutral-400 mt-4">
            유효 활성 = 룰이 켜져 있고 쿠폰 내용이 입력되어 실제 발송 가능한 매장
          </p>
        </div>

        {/* 활성화 추세 차트 */}
        <div className="lg:col-span-2 bg-white border border-[#EAEAEA] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[14px] font-medium text-neutral-900">활성화 추세</p>
            <div className="flex gap-1">
              {[30, 90].map(days => (
                <button
                  key={days}
                  onClick={() => setTrendDays(days)}
                  className={`px-3 py-1.5 text-[13px] rounded-lg transition-colors ${
                    trendDays === days
                      ? 'bg-neutral-900 text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  {days}일
                </button>
              ))}
            </div>
          </div>
          {hasActivationHistory ? (
            <>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={activationChartData} margin={{ top: 4, right: 0, bottom: 0, left: -20 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#a3a3a3' }} tickLine={false} axisLine={{ stroke: '#f0f0f0' }} minTickGap={24} />
                    <YAxis yAxisId="count" tick={{ fontSize: 10, fill: '#a3a3a3' }} tickLine={false} axisLine={false} allowDecimals={false} />
                    {/* 신규/이탈 바 전용 숨김 축 — 활성 매장 수(수백 단위)와 축을 공유하면 일 단위 바가 안 보임 */}
                    <YAxis yAxisId="delta" hide allowDecimals={false} />
                    <YAxis yAxisId="rate" orientation="right" tick={{ fontSize: 10, fill: '#a3a3a3' }} tickLine={false} axisLine={false} unit="%" width={40} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      formatter={(value: any, name: any) => {
                        if (value === null || value === undefined) return ['-', name];
                        if (name === '활성화율') return [`${value}%`, name];
                        return [`${value}곳`, name];
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar yAxisId="delta" dataKey="newActivations" name="신규 활성화" fill="#10B981" maxBarSize={6} radius={[2, 2, 0, 0]} />
                    <Bar yAxisId="delta" dataKey="deactivations" name="이탈" fill="#F87171" maxBarSize={6} radius={[2, 2, 0, 0]} />
                    <Line yAxisId="count" type="monotone" dataKey="activeStores" name="활성 매장" stroke="#171717" strokeWidth={1.5} dot={false} connectNulls={false} />
                    <Line yAxisId="rate" type="monotone" dataKey="activationRate" name="활성화율" stroke="#FFD541" strokeWidth={1.5} dot={false} connectNulls={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[11px] text-neutral-400 mt-2">
                활성 매장·활성화율은 켜짐(enabled) 기준 — 발송불가 매장 포함
                {firstHistoryDate && ` · 이력은 ${firstHistoryDate}부터 집계 (이전 구간 미표시)`}
              </p>
            </>
          ) : (
            <div className="h-64 flex items-center justify-center text-neutral-400 text-sm">
              아직 활성화 이력 데이터가 없습니다
            </div>
          )}
        </div>
      </div>

      {/* 발송 추세 차트 + 룰 타입별 현황 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        {/* 발송 추세 차트 */}
        <div className="lg:col-span-2 bg-white border border-[#EAEAEA] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[14px] font-medium text-neutral-900">발송 추세</p>
            <span className="text-[12px] text-neutral-400">최근 {trendDays}일</span>
          </div>

          {/* 범례 */}
          <div className="flex gap-4 mb-3">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-1 rounded-full" style={{ backgroundColor: CHART_COLORS.sent }} />
              <span className="text-[12px] text-neutral-500">발송</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-1 rounded-full" style={{ backgroundColor: CHART_COLORS.couponUsed }} />
              <span className="text-[12px] text-neutral-500">쿠폰 사용</span>
            </div>
          </div>

          <div className="h-64 relative">
            {trend.length === 0 ? (
              <div className="h-full flex items-center justify-center text-neutral-400 text-sm">
                데이터가 없습니다
              </div>
            ) : (
              <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="sentGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FFD541" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#FFD541" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {/* 가로 그리드 */}
                {[0, 1, 2, 3].map(i => (
                  <line key={i} x1="4" y1={15 + i * 23.3} x2="96" y2={15 + i * 23.3} stroke="#f0f0f0" strokeWidth="0.3" />
                ))}
                {/* 발송 영역 */}
                {trendArea && <path d={trendArea} fill="url(#sentGradient)" />}
                {/* 발송 라인 */}
                <polyline points={trendLine} fill="none" stroke={CHART_COLORS.sent} strokeWidth="1.5" strokeLinejoin="round" />
                {/* 쿠폰 사용 라인 */}
                <polyline points={couponLine} fill="none" stroke={CHART_COLORS.couponUsed} strokeWidth="1" strokeLinejoin="round" strokeDasharray="2,1" />
                {/* 호버 포인트 */}
                {hoveredTrendIndex !== null && trendPoints[hoveredTrendIndex] && (
                  <>
                    <line
                      x1={trendPoints[hoveredTrendIndex].x}
                      y1="10"
                      x2={trendPoints[hoveredTrendIndex].x}
                      y2="85"
                      stroke="#ccc"
                      strokeWidth="0.3"
                      strokeDasharray="1,1"
                    />
                    <circle
                      cx={trendPoints[hoveredTrendIndex].x}
                      cy={trendPoints[hoveredTrendIndex].y}
                      r="1.5"
                      fill={CHART_COLORS.sent}
                    />
                  </>
                )}
                {/* 투명 호버 영역 */}
                {trendPoints.map((p, i) => (
                  <rect
                    key={i}
                    x={p.x - (trend.length > 1 ? 46 / trend.length : 10)}
                    y="0"
                    width={trend.length > 1 ? 92 / trend.length : 20}
                    height="100"
                    fill="transparent"
                    onMouseEnter={() => setHoveredTrendIndex(i)}
                    onMouseLeave={() => setHoveredTrendIndex(null)}
                  />
                ))}
              </svg>
            )}

            {/* 호버 툴팁 */}
            {hoveredTrendIndex !== null && trendPoints[hoveredTrendIndex] && (
              <div
                className="absolute bg-neutral-900 text-white text-xs px-2.5 py-1.5 rounded-lg shadow-lg whitespace-nowrap z-10 pointer-events-none"
                style={{
                  left: `${trendPoints[hoveredTrendIndex].x}%`,
                  top: '8px',
                  transform: 'translateX(-50%)',
                }}
              >
                <p className="font-medium">{trendPoints[hoveredTrendIndex].date}</p>
                <p>발송 {trendPoints[hoveredTrendIndex].sent}건</p>
                <p>사용 {trendPoints[hoveredTrendIndex].couponUsed}건</p>
              </div>
            )}

            {/* X축 라벨 */}
            {trend.length > 0 && (
              <div className="absolute bottom-0 left-0 right-0 flex justify-between px-2">
                <span className="text-[10px] text-neutral-400">{trend[0]?.date.slice(5)}</span>
                {trend.length > 2 && (
                  <span className="text-[10px] text-neutral-400">
                    {trend[Math.floor(trend.length / 2)]?.date.slice(5)}
                  </span>
                )}
                <span className="text-[10px] text-neutral-400">{trend[trend.length - 1]?.date.slice(5)}</span>
              </div>
            )}
          </div>
        </div>

        {/* 룰 타입별 활성화 현황 */}
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-6">
          <p className="text-[14px] font-medium text-neutral-900 mb-4">룰 타입별 활성 매장</p>
          <div className="space-y-3">
            {ruleTypes.map(type => {
              const counts = stats?.ruleTypeBreakdown[type];
              const enabled = counts?.enabled || 0;
              const effective = counts?.effective || 0;
              const enabledWidth = maxRuleCount > 0 ? (enabled / maxRuleCount) * 100 : 0;
              const effectiveWidth = maxRuleCount > 0 ? (effective / maxRuleCount) * 100 : 0;
              return (
                <div key={type}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] text-neutral-600">{RULE_TYPE_LABELS[type]}</span>
                    <span className="text-[12px] font-medium text-neutral-900">
                      {effective}
                      <span className="text-neutral-400 font-normal"> / {enabled}개</span>
                    </span>
                  </div>
                  <div className="h-2 bg-neutral-100 rounded-full overflow-hidden relative">
                    {/* 켜진 룰 (연한색) 위에 유효 활성 룰 (진한색) */}
                    <div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{ width: `${enabledWidth}%`, backgroundColor: '#FFF3C2' }}
                    />
                    <div
                      className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                      style={{ width: `${effectiveWidth}%`, backgroundColor: '#FFD541' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-neutral-400 mt-4">진한색 = 유효 활성 / 연한색 = 켜짐 (발송불가 포함)</p>
        </div>
      </div>

      {/* 매장 리스트 */}
      <StoreTable stores={stores} />
    </div>
  );
}

// 검색/필터/정렬 상태를 격리 — 키스트로크마다 차트까지 리렌더되는 것 방지.
// memo: 부모의 차트 호버 state 변경 시 테이블(수백 행) 재조정 차단
const StoreTable = memo(function StoreTable({ stores }: { stores: StoreAutomation[] }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [crmOnly, setCrmOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('default');
  const [sortDesc, setSortDesc] = useState(true);

  const filteredStores = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    let rows = stores.filter(store => {
      if (statusFilter !== 'ALL' && store.status !== statusFilter) return false;
      if (crmOnly && !store.crmEnabled) return false;
      if (keyword) {
        const name = store.storeName?.toLowerCase() ?? '';
        const owner = store.ownerName?.toLowerCase() ?? '';
        if (!name.includes(keyword) && !owner.includes(keyword)) return false;
      }
      return true;
    });

    if (sortKey !== 'default') {
      const dir = sortDesc ? -1 : 1;
      rows = [...rows].sort((a, b) => {
        switch (sortKey) {
          case 'storeName':
            return dir * (a.storeName ?? '').localeCompare(b.storeName ?? '', 'ko');
          case 'totalSent':
            return dir * (a.totalSent - b.totalSent);
          case 'usageRate':
            return dir * (a.usageRate - b.usageRate);
          case 'lastSentAt': {
            const av = a.lastSentAt ? new Date(a.lastSentAt).getTime() : 0;
            const bv = b.lastSentAt ? new Date(b.lastSentAt).getTime() : 0;
            return dir * (av - bv);
          }
          default:
            return 0;
        }
      });
    }
    return rows;
  }, [stores, search, statusFilter, crmOnly, sortKey, sortDesc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDesc(prev => !prev);
    } else {
      setSortKey(key);
      setSortDesc(key !== 'storeName');
    }
  };

  const sortIndicator = (key: SortKey) => (sortKey === key ? (sortDesc ? ' ↓' : ' ↑') : '');

  return (
      <div className="bg-white border border-[#EAEAEA] rounded-xl overflow-hidden">
        <div className="p-6 border-b border-[#EAEAEA]">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[14px] font-medium text-neutral-900">
              매장별 현황
              <span className="text-neutral-400 font-normal ml-2">{filteredStores.length} / {stores.length}개 매장</span>
            </p>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="매장명·대표자 검색"
              className="ml-auto w-52 px-3 py-1.5 text-[13px] border border-[#EAEAEA] rounded-lg focus:outline-none focus:border-neutral-400"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            {(['ALL', 'EFFECTIVE', 'ENABLED_BLOCKED', 'VISITED', 'NOT_VISITED'] as StatusFilter[]).map(filter => (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter)}
                className={`px-2.5 py-1 text-[12px] rounded-full transition-colors ${
                  statusFilter === filter
                    ? 'bg-neutral-900 text-white'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                {filter === 'ALL' ? '전체' : STATUS_LABELS[filter]}
              </button>
            ))}
            <label className="flex items-center gap-1.5 ml-2 cursor-pointer">
              <input
                type="checkbox"
                checked={crmOnly}
                onChange={e => setCrmOnly(e.target.checked)}
                className="accent-neutral-900"
              />
              <span className="text-[12px] text-neutral-600">CRM 활성 매장만</span>
            </label>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#EAEAEA] bg-neutral-50">
                <th
                  className="text-left text-[12px] font-medium text-neutral-500 px-6 py-3 cursor-pointer select-none hover:text-neutral-700"
                  onClick={() => toggleSort('storeName')}
                >
                  매장명{sortIndicator('storeName')}
                </th>
                <th className="text-left text-[12px] font-medium text-neutral-500 px-6 py-3">대표자</th>
                <th className="text-left text-[12px] font-medium text-neutral-500 px-6 py-3">상태</th>
                <th className="text-left text-[12px] font-medium text-neutral-500 px-6 py-3">활성 룰</th>
                <th
                  className="text-right text-[12px] font-medium text-neutral-500 px-6 py-3 cursor-pointer select-none hover:text-neutral-700"
                  onClick={() => toggleSort('totalSent')}
                >
                  이번달 발송{sortIndicator('totalSent')}
                </th>
                <th
                  className="text-right text-[12px] font-medium text-neutral-500 px-6 py-3 cursor-pointer select-none hover:text-neutral-700"
                  onClick={() => toggleSort('usageRate')}
                >
                  사용률{sortIndicator('usageRate')}
                </th>
                <th
                  className="text-right text-[12px] font-medium text-neutral-500 px-6 py-3 cursor-pointer select-none hover:text-neutral-700"
                  onClick={() => toggleSort('lastSentAt')}
                >
                  마지막 발송{sortIndicator('lastSentAt')}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredStores.map((store) => {
                const isActive = store.enabledRules.length > 0;
                return (
                  <tr
                    key={store.storeId}
                    className={`border-b border-[#F5F5F5] ${isActive ? '' : 'opacity-40'}`}
                  >
                    <td className="px-6 py-3 text-[13px] text-neutral-900 font-medium">{store.storeName}</td>
                    <td className="px-6 py-3 text-[13px] text-neutral-600">{store.ownerName || '-'}</td>
                    <td className="px-6 py-3">
                      <span className={`inline-block px-2 py-0.5 text-[11px] font-medium rounded ${STATUS_BADGE_CLASS[store.status]}`}>
                        {STATUS_LABELS[store.status]}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      {isActive ? (
                        <div className="flex flex-wrap gap-1">
                          {store.enabledRules.map(rule => {
                            const blocked = !store.effectiveRules.includes(rule);
                            return (
                              <span
                                key={rule}
                                title={blocked ? '쿠폰 내용 미입력 — 발송되지 않음' : undefined}
                                className={`inline-block px-2 py-0.5 text-[11px] font-medium rounded ${
                                  blocked ? 'bg-amber-50 text-amber-700' : 'bg-[#FFF8E1] text-[#B7860E]'
                                }`}
                              >
                                {RULE_TYPE_LABELS[rule] || rule}
                                {blocked && ' ⚠'}
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-[13px] text-neutral-400">미사용</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-[13px] text-neutral-900 text-right">{store.totalSent}건</td>
                    <td className="px-6 py-3 text-[13px] text-right">
                      {store.totalSent > 0 ? (
                        <span className="text-emerald-600 font-medium">{store.usageRate}%</span>
                      ) : (
                        <span className="text-neutral-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-[13px] text-neutral-500 text-right">
                      {store.lastSentAt
                        ? new Date(store.lastSentAt).toLocaleDateString('ko-KR')
                        : '-'}
                    </td>
                  </tr>
                );
              })}
              {filteredStores.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-neutral-400 text-sm">
                    조건에 맞는 매장이 없습니다
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
  );
});
