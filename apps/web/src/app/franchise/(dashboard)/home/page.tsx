'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Building2,
  Users2,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
  ChevronRight,
  MapPin,
  Contact,
  Link2,
  Calendar,
  RefreshCw,
  ChartPie,
  BarChart3,
} from 'lucide-react';

interface OverviewData {
  totalStores: number;
  totalCustomers: number;
  newCustomersThisMonth: number;
  walletBalance: number;
  storeGrowth?: number;
  customerGrowth?: number;
  newCustomerGrowth?: number;
}

interface VisitSourceData {
  source: string;
  label: string;
  count: number;
  percentage: number;
}

// 방문경로 색상 매핑
const visitSourceColors: Record<string, string> = {
  naver: '#03C75A',
  instagram: '#E4405F',
  friend: '#6366f1',
  revisit: '#64748b',
  passby: '#f59e0b',
  kakao: '#FEE500',
  youtube: '#FF0000',
  daangn: '#FF6F0F',
  sms: '#0EA5E9',
};

// Demo 방문경로 데이터
const DEMO_VISIT_SOURCE: VisitSourceData[] = [
  { source: 'naver', label: '네이버', count: 81, percentage: 33 },
  { source: 'revisit', label: '단순 재방문', count: 67, percentage: 28 },
  { source: 'friend', label: '지인 추천', count: 51, percentage: 21 },
  { source: 'passby', label: '지나가다', count: 36, percentage: 15 },
  { source: 'instagram', label: '인스타그램', count: 3, percentage: 1 },
  { source: 'kakao', label: '카카오톡', count: 2, percentage: 1 },
];

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Demo data for fallback
const DEMO_DATA: OverviewData = {
  totalStores: 20,
  totalCustomers: 4836,
  newCustomersThisMonth: 523,
  walletBalance: 1000000,
  storeGrowth: 5,
  customerGrowth: 12.3,
  newCustomerGrowth: 8.7,
};

// Skeleton component for loading state
function KpiCardSkeleton() {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-6">
      <div className="space-y-4">
        <div className="h-3 w-20 bg-slate-100 rounded animate-pulse" />
        <div className="h-9 w-24 bg-slate-100 rounded animate-pulse" />
        <div className="h-3 w-28 bg-slate-50 rounded animate-pulse" />
      </div>
    </div>
  );
}

// KPI Card component - minimal design
interface KpiCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  accentColor: string;
  growth?: number;
  growthLabel?: string;
}

function KpiCard({ title, value, icon: Icon, accentColor, growth, growthLabel }: KpiCardProps) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-6 hover:border-slate-200 transition-all duration-200">
      <div className="flex items-start justify-between mb-4">
        <p className="text-[13px] font-medium text-slate-500 tracking-tight">{title}</p>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${accentColor}`}>
          <Icon className="w-[18px] h-[18px]" strokeWidth={1.5} />
        </div>
      </div>
      <p className="text-[28px] font-semibold text-slate-900 tracking-tight">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {growth !== undefined && (
        <div className="flex items-center gap-1.5 mt-3">
          {growth >= 0 ? (
            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" strokeWidth={2} />
          ) : (
            <ArrowDownRight className="w-3.5 h-3.5 text-rose-500" strokeWidth={2} />
          )}
          <span className={`text-xs font-medium ${growth >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {growth >= 0 ? '+' : ''}{growth}%
          </span>
          {growthLabel && (
            <span className="text-xs text-slate-400">{growthLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}

// Empty state component
function EmptyState() {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-16 text-center">
      <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
        <AlertCircle className="w-6 h-6 text-slate-400" strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-semibold text-slate-900 mb-2">
        데이터가 없습니다
      </h3>
      <p className="text-sm text-slate-500 max-w-xs mx-auto">
        아직 등록된 가맹점이 없습니다. 설정 페이지에서 가맹점을 연동해주세요.
      </p>
    </div>
  );
}

// Demo account email
const DEMO_EMAIL = 'franchise@tmr.com';

// Check if current user is demo account
function isDemoAccount(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const token = localStorage.getItem('franchiseToken');
    if (!token) return false;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.email === DEMO_EMAIL;
  } catch {
    return false;
  }
}

export default function FranchiseHomePage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 방문경로 관련 상태
  const [visitSourceData, setVisitSourceData] = useState<VisitSourceData[]>([]);
  const [isVisitSourceLoading, setIsVisitSourceLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [tempStartDate, setTempStartDate] = useState('');
  const [tempEndDate, setTempEndDate] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
        setShowDatePicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchOverviewData = async () => {
      try {
        const token = localStorage.getItem('franchiseToken');
        const res = await fetch(`${API_BASE}/api/franchise/analytics/overview`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          throw new Error('Failed to fetch overview data');
        }

        const responseData = await res.json();
        // Use demo data only for demo account with empty results
        if (isDemoAccount() && responseData.totalStores === 0 && responseData.totalCustomers === 0) {
          setData(DEMO_DATA);
        } else {
          setData(responseData);
        }
      } catch (err: any) {
        setError(err.message);
        // Use demo data only for demo account on error
        if (isDemoAccount()) {
          setData(DEMO_DATA);
        } else {
          setData({
            totalStores: 0,
            totalCustomers: 0,
            newCustomersThisMonth: 0,
            walletBalance: 0,
          });
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchOverviewData();
  }, []);

  // 방문경로 데이터 fetch
  const fetchVisitSourceData = async () => {
    setIsVisitSourceLoading(true);
    try {
      const token = localStorage.getItem('franchiseToken');
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (!startDate && !endDate) params.append('period', 'all');

      const res = await fetch(`${API_BASE}/api/franchise/insights?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) throw new Error('Failed to fetch insights');

      const responseData = await res.json();
      if (isDemoAccount() && (!responseData.visitSourceDistribution || responseData.visitSourceDistribution.length === 0)) {
        setVisitSourceData(DEMO_VISIT_SOURCE);
      } else {
        setVisitSourceData(responseData.visitSourceDistribution || []);
      }
    } catch (err) {
      if (isDemoAccount()) {
        setVisitSourceData(DEMO_VISIT_SOURCE);
      } else {
        setVisitSourceData([]);
      }
    } finally {
      setIsVisitSourceLoading(false);
    }
  };

  useEffect(() => {
    fetchVisitSourceData();
  }, [startDate, endDate]);

  // 날짜 범위 적용
  const applyDateRange = () => {
    setStartDate(tempStartDate);
    setEndDate(tempEndDate);
    setShowDatePicker(false);
  };

  // 날짜 범위 초기화
  const resetDateRange = () => {
    setTempStartDate('');
    setTempEndDate('');
    setStartDate('');
    setEndDate('');
    setShowDatePicker(false);
  };

  // 날짜 포맷팅
  const formatDateRange = () => {
    if (!startDate && !endDate) return '전체 기간';
    if (startDate && endDate) return `${startDate} ~ ${endDate}`;
    if (startDate) return `${startDate} ~`;
    return `~ ${endDate}`;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-slate-900 tracking-tight">홈</h1>
        <p className="text-sm text-slate-500 mt-1">
          프랜차이즈 전체 현황을 한눈에 확인하세요
        </p>
      </div>

      {/* KPI Cards Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCardSkeleton />
          <KpiCardSkeleton />
          <KpiCardSkeleton />
          <KpiCardSkeleton />
        </div>
      ) : data && (data.totalStores > 0 || data.totalCustomers > 0) ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard
            title="총 가맹점 수"
            value={data.totalStores}
            icon={Building2}
            accentColor="bg-slate-900 text-white"
            growth={data.storeGrowth}
            growthLabel="지난달 대비"
          />
          <KpiCard
            title="총 고객 수"
            value={data.totalCustomers}
            icon={Users2}
            accentColor="bg-emerald-500 text-white"
            growth={data.customerGrowth}
            growthLabel="지난달 대비"
          />
          <KpiCard
            title="충전 잔액"
            value={formatCurrency(data.walletBalance)}
            icon={Wallet}
            accentColor="bg-amber-500 text-white"
          />
        </div>
      ) : (
        <EmptyState />
      )}

      {/* Additional Sections */}
      {!isLoading && data && (data.totalStores > 0 || data.totalCustomers > 0) && (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Recent Activity Card */}
          <div className="bg-white border border-slate-100 rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">최근 활동</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-4 p-4 bg-slate-50/80 rounded-xl">
                <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center">
                  <MapPin className="w-[18px] h-[18px] text-white" strokeWidth={1.5} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">가맹점 현황</p>
                  <p className="text-[13px] text-slate-500">
                    {data.totalStores}개의 가맹점이 연동되어 있습니다.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 p-4 bg-slate-50/80 rounded-xl">
                <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
                  <Contact className="w-[18px] h-[18px] text-white" strokeWidth={1.5} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">고객 현황</p>
                  <p className="text-[13px] text-slate-500">
                    총 {data.totalCustomers.toLocaleString()}명의 고객 데이터가 있습니다.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions Card */}
          <div className="bg-white border border-slate-100 rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">빠른 작업</h3>
            <div className="space-y-2">
              <a
                href="/franchise/stores"
                className="flex items-center justify-between p-4 rounded-xl hover:bg-slate-50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <Building2 className="w-[18px] h-[18px] text-slate-400" strokeWidth={1.5} />
                  <span className="text-sm font-medium text-slate-700">가맹점 관리</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-400 transition-colors" strokeWidth={1.5} />
              </a>
              <a
                href="/franchise/customers"
                className="flex items-center justify-between p-4 rounded-xl hover:bg-slate-50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <Users2 className="w-[18px] h-[18px] text-slate-400" strokeWidth={1.5} />
                  <span className="text-sm font-medium text-slate-700">고객 목록 보기</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-400 transition-colors" strokeWidth={1.5} />
              </a>
              <a
                href="/franchise/settings"
                className="flex items-center justify-between p-4 rounded-xl hover:bg-slate-50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <Link2 className="w-[18px] h-[18px] text-slate-400" strokeWidth={1.5} />
                  <span className="text-sm font-medium text-slate-700">가맹점 연동하기</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-400 transition-colors" strokeWidth={1.5} />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* 방문경로 분석 섹션 */}
      {!isLoading && data && (data.totalStores > 0 || data.totalCustomers > 0) && (
        <div className="mt-6">
          {/* 섹션 헤더 + 날짜 선택 */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-900">방문경로 분석</h2>
            <div className="flex items-center gap-2">
              {/* 날짜 범위 선택 */}
              <div className="relative" ref={datePickerRef}>
                <button
                  onClick={() => {
                    setTempStartDate(startDate);
                    setTempEndDate(endDate);
                    setShowDatePicker(!showDatePicker);
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Calendar className="w-4 h-4 text-slate-400" />
                  <span>{formatDateRange()}</span>
                </button>

                {showDatePicker && (
                  <div className="absolute right-0 top-full mt-2 bg-white border border-slate-200 rounded-xl shadow-lg p-4 z-50 min-w-[280px]">
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">시작일</label>
                        <input
                          type="date"
                          value={tempStartDate}
                          onChange={(e) => setTempStartDate(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">종료일</label>
                        <input
                          type="date"
                          value={tempEndDate}
                          onChange={(e) => setTempEndDate(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                        />
                      </div>
                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={resetDateRange}
                          className="flex-1 px-3 py-2 text-sm text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                        >
                          초기화
                        </button>
                        <button
                          onClick={applyDateRange}
                          className="flex-1 px-3 py-2 text-sm text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
                        >
                          적용
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 새로고침 버튼 */}
              <button
                onClick={fetchVisitSourceData}
                disabled={isVisitSourceLoading}
                className="p-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isVisitSourceLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* 방문경로 그래프 카드 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 방문경로 분포 (원형 차트) */}
            <div className="bg-white border border-slate-100 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <ChartPie className="w-4 h-4 text-slate-400" />
                <h3 className="text-sm font-semibold text-slate-900">방문경로 분포</h3>
              </div>
              <p className="text-xs text-slate-500 mb-4">고객이 매장을 알게 된 경로입니다</p>

              {isVisitSourceLoading ? (
                <div className="flex items-center justify-center h-40">
                  <RefreshCw className="w-6 h-6 text-slate-300 animate-spin" />
                </div>
              ) : visitSourceData.length === 0 ? (
                <div className="flex items-center justify-center h-40 text-sm text-slate-400">
                  데이터가 없습니다
                </div>
              ) : (
                <div className="flex items-center gap-6">
                  {/* 원형 차트 */}
                  <div
                    className="relative w-36 h-36 rounded-full shrink-0"
                    style={{
                      background: `conic-gradient(${visitSourceData
                        .reduce((acc, item, index) => {
                          const startPercent = visitSourceData.slice(0, index).reduce((sum, i) => sum + i.percentage, 0);
                          const endPercent = startPercent + item.percentage;
                          const color = visitSourceColors[item.source] || '#6366f1';
                          return [...acc, `${color} ${startPercent}% ${endPercent}%`];
                        }, [] as string[])
                        .join(', ')})`,
                    }}
                  >
                    <div className="absolute inset-3 bg-white rounded-full flex flex-col items-center justify-center">
                      <span className="text-2xl font-bold text-slate-900">
                        {visitSourceData.reduce((sum, item) => sum + item.count, 0)}
                      </span>
                      <span className="text-xs text-slate-500">총 응답</span>
                    </div>
                  </div>

                  {/* 범례 */}
                  <div className="flex-1 space-y-1.5">
                    {visitSourceData.slice(0, 5).map((item) => (
                      <div key={item.source} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: visitSourceColors[item.source] || '#6366f1' }}
                          />
                          <span className="text-slate-700">{item.label}</span>
                        </div>
                        <span className="text-slate-500">{item.percentage}%</span>
                      </div>
                    ))}
                    {visitSourceData.length > 5 && (
                      <p className="text-xs text-slate-400 pt-1">외 {visitSourceData.length - 5}개</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 방문경로별 고객 수 (막대 그래프) */}
            <div className="bg-white border border-slate-100 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-4 h-4 text-slate-400" />
                <h3 className="text-sm font-semibold text-slate-900">방문경로별 고객 수</h3>
              </div>
              <p className="text-xs text-slate-500 mb-4">방문경로별 고객 수를 비교합니다</p>

              {isVisitSourceLoading ? (
                <div className="flex items-center justify-center h-40">
                  <RefreshCw className="w-6 h-6 text-slate-300 animate-spin" />
                </div>
              ) : visitSourceData.length === 0 ? (
                <div className="flex items-center justify-center h-40 text-sm text-slate-400">
                  데이터가 없습니다
                </div>
              ) : (
                <div className="space-y-3">
                  {visitSourceData.slice(0, 7).map((item) => {
                    const maxCount = Math.max(...visitSourceData.map((d) => d.count));
                    const barWidth = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
                    return (
                      <div key={item.source} className="flex items-center gap-3">
                        <span className="text-sm text-slate-600 w-20 shrink-0 truncate">{item.label}</span>
                        <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${barWidth}%`,
                              backgroundColor: visitSourceColors[item.source] || '#6366f1',
                            }}
                          />
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-semibold text-slate-900 w-8 text-right">{item.count}</span>
                          <span className="text-xs text-slate-400 w-8">{item.percentage}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
