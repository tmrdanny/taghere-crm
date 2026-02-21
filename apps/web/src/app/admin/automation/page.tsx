'use client';

import { useEffect, useState } from 'react';
import { formatNumber } from '@/lib/utils';

interface AutomationStats {
  totalStores: number;
  activeStores: number;
  totalRulesEnabled: number;
  totalSentThisMonth: number;
  totalCouponUsed: number;
  usageRate: number;
  ruleTypeBreakdown: Record<string, number>;
}

interface StoreAutomation {
  storeId: string;
  storeName: string;
  ownerName: string;
  enabledRules: string[];
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

const CHART_COLORS = {
  sent: '#FFD541',
  couponUsed: '#10B981',
};

export default function AdminAutomationPage() {
  const [stats, setStats] = useState<AutomationStats | null>(null);
  const [stores, setStores] = useState<StoreAutomation[]>([]);
  const [trend, setTrend] = useState<TrendItem[]>([]);
  const [trendDays, setTrendDays] = useState(30);
  const [isLoading, setIsLoading] = useState(true);
  const [hoveredTrendIndex, setHoveredTrendIndex] = useState<number | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  useEffect(() => {
    const fetchData = async () => {
      const token = localStorage.getItem('adminToken');
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}` };

      try {
        const [statsRes, storesRes, trendRes] = await Promise.all([
          fetch(`${apiUrl}/api/admin/automation-stats`, { headers }),
          fetch(`${apiUrl}/api/admin/automation-stores`, { headers }),
          fetch(`${apiUrl}/api/admin/automation-trend?days=${trendDays}`, { headers }),
        ]);

        if (statsRes.ok) setStats(await statsRes.json());
        if (storesRes.ok) {
          const data = await storesRes.json();
          setStores(data.stores);
        }
        if (trendRes.ok) {
          const data = await trendRes.json();
          setTrend(data.trend);
        }
      } catch (error) {
        console.error('Failed to fetch automation data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [apiUrl, trendDays]);

  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // 추세 차트 데이터 계산
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
  const maxRuleCount = Math.max(...ruleTypes.map(t => stats?.ruleTypeBreakdown[t] || 0), 1);

  return (
    <div>
      <h1 className="text-[22px] font-semibold text-neutral-900 mb-6">자동 마케팅 현황</h1>

      {/* 요약 통계 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-6">
          <p className="text-[14px] text-neutral-500 mb-2">사용 매장</p>
          <p className="text-[28px] font-semibold text-neutral-900">
            {stats?.activeStores ?? 0}
            <span className="text-[16px] font-normal text-neutral-400 ml-1">/ {stats?.totalStores ?? 0}</span>
          </p>
          <p className="text-[13px] text-neutral-400 mt-1">
            {stats && stats.totalStores > 0 ? Math.round((stats.activeStores / stats.totalStores) * 100) : 0}% 채택률
          </p>
        </div>
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-6">
          <p className="text-[14px] text-neutral-500 mb-2">활성 룰</p>
          <p className="text-[28px] font-semibold text-neutral-900">
            {formatNumber(stats?.totalRulesEnabled ?? 0)}
            <span className="text-[16px] font-normal text-neutral-400 ml-1">개</span>
          </p>
        </div>
        <div className="bg-white border border-[#EAEAEA] rounded-xl p-6">
          <p className="text-[14px] text-neutral-500 mb-2">이번 달 발송</p>
          <p className="text-[28px] font-semibold text-neutral-900">
            {formatNumber(stats?.totalSentThisMonth ?? 0)}
            <span className="text-[16px] font-normal text-neutral-400 ml-1">건</span>
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

      {/* 추세 차트 + 룰 타입별 현황 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        {/* 추세 차트 */}
        <div className="lg:col-span-2 bg-white border border-[#EAEAEA] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[14px] font-medium text-neutral-900">발송 추세</p>
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
              const count = stats?.ruleTypeBreakdown[type] || 0;
              const width = maxRuleCount > 0 ? (count / maxRuleCount) * 100 : 0;
              return (
                <div key={type}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] text-neutral-600">{RULE_TYPE_LABELS[type]}</span>
                    <span className="text-[12px] font-medium text-neutral-900">{count}개</span>
                  </div>
                  <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${width}%`, backgroundColor: '#FFD541' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 매장 리스트 */}
      <div className="bg-white border border-[#EAEAEA] rounded-xl overflow-hidden">
        <div className="p-6 border-b border-[#EAEAEA]">
          <p className="text-[14px] font-medium text-neutral-900">
            매장별 현황
            <span className="text-neutral-400 font-normal ml-2">{stores.length}개 매장</span>
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#EAEAEA] bg-neutral-50">
                <th className="text-left text-[12px] font-medium text-neutral-500 px-6 py-3">매장명</th>
                <th className="text-left text-[12px] font-medium text-neutral-500 px-6 py-3">대표자</th>
                <th className="text-left text-[12px] font-medium text-neutral-500 px-6 py-3">활성 룰</th>
                <th className="text-right text-[12px] font-medium text-neutral-500 px-6 py-3">이번달 발송</th>
                <th className="text-right text-[12px] font-medium text-neutral-500 px-6 py-3">사용률</th>
                <th className="text-right text-[12px] font-medium text-neutral-500 px-6 py-3">마지막 발송</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((store) => {
                const isActive = store.enabledRules.length > 0;
                return (
                  <tr
                    key={store.storeId}
                    className={`border-b border-[#F5F5F5] ${isActive ? '' : 'opacity-40'}`}
                  >
                    <td className="px-6 py-3 text-[13px] text-neutral-900 font-medium">{store.storeName}</td>
                    <td className="px-6 py-3 text-[13px] text-neutral-600">{store.ownerName || '-'}</td>
                    <td className="px-6 py-3">
                      {isActive ? (
                        <div className="flex flex-wrap gap-1">
                          {store.enabledRules.map(rule => (
                            <span
                              key={rule}
                              className="inline-block px-2 py-0.5 text-[11px] font-medium bg-[#FFF8E1] text-[#B7860E] rounded"
                            >
                              {RULE_TYPE_LABELS[rule] || rule}
                            </span>
                          ))}
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
              {stores.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-neutral-400 text-sm">
                    매장 데이터가 없습니다
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
