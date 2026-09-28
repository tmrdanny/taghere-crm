'use client';

import { API_BASE } from '@/lib/api-config';
import { useState, useEffect, useRef } from 'react';
import { Skel, rise } from '@/features/admin-ui';
import {
  Building2,
  Users2,
  Wallet,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  ChevronRight,
  MapPin,
  Contact,
  Link2,
  Calendar,
  RefreshCw,
  ChartPie,
  BarChart3,
  ArrowRight,
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

// 방문경로 차트 색상 — 순서(비중 순) 기준 파랑·회색 계열
const visitSourcePalette = ['#2a2d62', '#6eadff', '#a5ccff', '#dcebff', '#91959a', '#d1d3d6', '#e4e6e8'];
const visitSourceColor = (index: number) => visitSourcePalette[index % visitSourcePalette.length];

// Demo 방문경로 데이터
const DEMO_VISIT_SOURCE: VisitSourceData[] = [
  { source: 'naver', label: '네이버', count: 81, percentage: 33 },
  { source: 'revisit', label: '단순 재방문', count: 67, percentage: 28 },
  { source: 'friend', label: '지인 추천', count: 51, percentage: 21 },
  { source: 'passby', label: '지나가다', count: 36, percentage: 15 },
  { source: 'instagram', label: '인스타그램', count: 3, percentage: 1 },
  { source: 'kakao', label: '카카오톡', count: 2, percentage: 1 },
];


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
    <div className="ad-card p-5">
      <Skel className="h-3.5 w-20" />
      <Skel className="mt-3 h-[26px] w-28" />
      <Skel className="mt-3 h-3.5 w-24" />
    </div>
  );
}

// KPI Card component — 사장님 홈 KPI 카드와 같은 형태
interface KpiCardProps {
  title: string;
  value: string | number;
  unit?: string;
  icon: React.ElementType;
  growth?: number;
  growthLabel?: string;
  index: number;
}

function KpiCard({ title, value, unit, icon: Icon, growth, growthLabel, index }: KpiCardProps) {
  return (
    <section className="ad-card ad-rise p-5" style={rise(index)}>
      <p className="flex items-center gap-2 text-[12.5px] font-medium text-[color:var(--ad-muted)]">
        <Icon className="h-3.5 w-3.5 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
        {title}
      </p>
      <p className="ad-tnum mt-2 text-[24px] font-medium leading-none tracking-[-0.03em] text-[color:var(--ad-ink)]">
        {typeof value === 'number' ? value.toLocaleString() : value}
        {unit && <span className="ml-0.5 text-[14px] font-medium text-[color:var(--ad-muted)]">{unit}</span>}
      </p>
      {growth !== undefined && (
        <p className="mt-2 flex items-center gap-1 text-[12.5px] text-[color:var(--ad-muted)]">
          <span
            className={`inline-flex items-center gap-0.5 font-semibold ${
              growth >= 0 ? 'text-[color:var(--ad-pos)]' : 'text-[color:var(--ad-neg)]'
            }`}
          >
            {growth >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {growth >= 0 ? '+' : ''}{growth}%
          </span>
          {growthLabel && <span>{growthLabel}</span>}
        </p>
      )}
    </section>
  );
}

// Empty state component
function EmptyState() {
  return (
    <div className="ad-card ad-rise flex flex-col items-center gap-2 px-6 py-14 text-center" style={rise(1)}>
      <span className="grid h-10 w-10 place-items-center rounded-full bg-[color:var(--ad-bg)]">
        <AlertCircle className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
      </span>
      <h3 className="mt-1 text-[14px] font-semibold text-[color:var(--ad-ink)]">
        데이터가 없습니다
      </h3>
      <p className="max-w-xs text-[13px] text-[color:var(--ad-muted)]">
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

  const hasData = !!data && (data.totalStores > 0 || data.totalCustomers > 0);
  const secondaryBtn =
    'ad-press inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] bg-white px-3.5 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] disabled:opacity-40';
  const iconBtn =
    'ad-press grid h-9 w-9 place-items-center rounded-[10px] bg-white text-[color:var(--ad-muted)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] hover:text-[color:var(--ad-ink)] disabled:opacity-50';
  const dateInput =
    'h-10 w-full rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13.5px] text-[color:var(--ad-ink)] focus:border-[color:var(--ad-navy)] focus:outline-none';

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 sm:px-8 lg:pt-8">
      {/* Page Header */}
      <header className="ad-rise" style={rise(0)}>
        <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-[color:var(--ad-ink)]">홈</h1>
        <p className="mt-1 text-[13px] text-[color:var(--ad-muted)]">
          프랜차이즈 전체 현황을 한눈에 확인하세요
        </p>
      </header>

      <div className="mt-6 space-y-4">
        {/* KPI Cards Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiCardSkeleton />
            <KpiCardSkeleton />
            <KpiCardSkeleton />
          </div>
        ) : data && (data.totalStores > 0 || data.totalCustomers > 0) ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiCard
              title="총 가맹점 수"
              value={data.totalStores}
              unit="개"
              icon={Building2}
              growth={data.storeGrowth}
              growthLabel="지난달 대비"
              index={1}
            />
            <KpiCard
              title="총 고객 수"
              value={data.totalCustomers}
              unit="명"
              icon={Users2}
              growth={data.customerGrowth}
              growthLabel="지난달 대비"
              index={2}
            />
            <KpiCard
              title="충전 잔액"
              value={formatCurrency(data.walletBalance)}
              icon={Wallet}
              index={3}
            />
          </div>
        ) : (
          <EmptyState />
        )}

        {/* Additional Sections */}
        {!isLoading && hasData && data && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Recent Activity Card */}
            <section className="ad-card ad-rise p-5" style={rise(4)}>
              <h3 className="text-[14px] font-semibold tracking-[-0.015em] text-[color:var(--ad-ink)]">최근 활동</h3>
              <div className="mt-3 divide-y divide-[color:var(--ad-line)]">
                <div className="flex items-center gap-3 py-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[color:var(--ad-bg)]">
                    <MapPin className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">가맹점 현황</p>
                    <p className="mt-0.5 text-[12.5px] text-[color:var(--ad-muted)]">
                      <span className="ad-tnum">{data.totalStores}</span>개의 가맹점이 연동되어 있습니다.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 py-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[color:var(--ad-bg)]">
                    <Contact className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">고객 현황</p>
                    <p className="mt-0.5 text-[12.5px] text-[color:var(--ad-muted)]">
                      총 <span className="ad-tnum">{data.totalCustomers.toLocaleString()}</span>명의 고객 데이터가 있습니다.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Quick Actions Card */}
            <section className="ad-card ad-rise flex flex-col p-5" style={rise(5)}>
              <h3 className="text-[14px] font-semibold tracking-[-0.015em] text-[color:var(--ad-ink)]">빠른 작업</h3>
              <div className="mt-3 divide-y divide-[color:var(--ad-line)]">
                <a
                  href="/franchise/stores"
                  className="group flex items-center justify-between py-3"
                >
                  <span className="flex items-center gap-3">
                    <Building2 className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                    <span className="text-[13.5px] font-medium text-[color:var(--ad-ink-2)] group-hover:text-[color:var(--ad-ink)]">가맹점 관리</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-[color:var(--ad-faint)] transition-colors group-hover:text-[color:var(--ad-ink)]" strokeWidth={1.8} />
                </a>
                <a
                  href="/franchise/customers"
                  className="group flex items-center justify-between py-3"
                >
                  <span className="flex items-center gap-3">
                    <Users2 className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                    <span className="text-[13.5px] font-medium text-[color:var(--ad-ink-2)] group-hover:text-[color:var(--ad-ink)]">고객 목록 보기</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-[color:var(--ad-faint)] transition-colors group-hover:text-[color:var(--ad-ink)]" strokeWidth={1.8} />
                </a>
              </div>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--ad-line)] pt-4">
                <p className="text-[12.5px] text-[color:var(--ad-muted)]">새 가맹점을 연결하면 고객 데이터가 함께 모여요</p>
                <a
                  href="/franchise/settings"
                  className="ad-press inline-flex h-10 items-center justify-center gap-1.5 rounded-[12px] bg-[color:var(--ad-ink)] px-4 text-[13.5px] font-semibold text-white hover:bg-[#383c40]"
                >
                  <Link2 className="h-4 w-4" strokeWidth={1.8} />
                  가맹점 연동하기
                  <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            </section>
          </div>
        )}

        {/* 방문경로 분석 섹션 */}
        {!isLoading && data && (data.totalStores > 0 || data.totalCustomers > 0) && (
          <section className="ad-rise pt-2" style={rise(6)}>
            {/* 섹션 헤더 + 날짜 선택 */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-[color:var(--ad-ink)]">방문경로 분석</h2>
              <div className="flex items-center gap-2">
                {/* 날짜 범위 선택 */}
                <div className="relative" ref={datePickerRef}>
                  <button
                    onClick={() => {
                      setTempStartDate(startDate);
                      setTempEndDate(endDate);
                      setShowDatePicker(!showDatePicker);
                    }}
                    className={secondaryBtn}
                  >
                    <Calendar className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                    <span className="ad-tnum">{formatDateRange()}</span>
                  </button>

                  {showDatePicker && (
                    <div className="absolute right-0 top-full z-50 mt-2 min-w-[280px] rounded-[16px] bg-white p-4 shadow-[0_0_0_1px_var(--ad-line),0_16px_40px_-16px_rgba(19,22,81,0.3)]">
                      <div className="space-y-3">
                        <div>
                          <label className="mb-1.5 block text-[12.5px] font-medium text-[color:var(--ad-ink-2)]">시작일</label>
                          <input
                            type="date"
                            value={tempStartDate}
                            onChange={(e) => setTempStartDate(e.target.value)}
                            className={dateInput}
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-[12.5px] font-medium text-[color:var(--ad-ink-2)]">종료일</label>
                          <input
                            type="date"
                            value={tempEndDate}
                            onChange={(e) => setTempEndDate(e.target.value)}
                            className={dateInput}
                          />
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={resetDateRange}
                            className={`${secondaryBtn} flex-1`}
                          >
                            초기화
                          </button>
                          <button
                            onClick={applyDateRange}
                            className="ad-press inline-flex h-9 flex-1 items-center justify-center rounded-[10px] bg-[color:var(--ad-ink)] px-3.5 text-[13px] font-semibold text-white hover:bg-[#383c40]"
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
                  className={iconBtn}
                  aria-label="새로고침"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isVisitSourceLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* 방문경로 그래프 카드 */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* 방문경로 분포 (원형 차트) */}
              <div className="ad-card p-5">
                <div className="flex items-center gap-2">
                  <ChartPie className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                  <h3 className="text-[14px] font-semibold tracking-[-0.015em] text-[color:var(--ad-ink)]">방문경로 분포</h3>
                </div>
                <p className="mt-1 text-[12px] text-[color:var(--ad-faint)]">고객이 매장을 알게 된 경로입니다</p>

                {isVisitSourceLoading ? (
                  <div className="mt-5 flex h-40 items-center gap-6">
                    <Skel className="h-36 w-36 shrink-0 !rounded-full" />
                    <div className="flex-1 space-y-2.5">
                      <Skel className="h-3.5 w-full" />
                      <Skel className="h-3.5 w-4/5" />
                      <Skel className="h-3.5 w-3/5" />
                    </div>
                  </div>
                ) : visitSourceData.length === 0 ? (
                  <div className="mt-5 flex h-40 items-center justify-center text-[13px] text-[color:var(--ad-faint)]">
                    데이터가 없습니다
                  </div>
                ) : (
                  <div className="mt-5 flex items-center gap-6">
                    {/* 원형 차트 */}
                    <div
                      className="relative h-36 w-36 shrink-0 rounded-full"
                      style={{
                        background: `conic-gradient(${visitSourceData
                          .reduce((acc, item, index) => {
                            const startPercent = visitSourceData.slice(0, index).reduce((sum, i) => sum + i.percentage, 0);
                            const endPercent = startPercent + item.percentage;
                            const color = visitSourceColor(index);
                            return [...acc, `${color} ${startPercent}% ${endPercent}%`];
                          }, [] as string[])
                          .join(', ')})`,
                      }}
                    >
                      <div className="absolute inset-3 flex flex-col items-center justify-center rounded-full bg-white">
                        <span className="ad-tnum text-[22px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">
                          {visitSourceData.reduce((sum, item) => sum + item.count, 0)}
                        </span>
                        <span className="text-[11.5px] text-[color:var(--ad-muted)]">총 응답</span>
                      </div>
                    </div>

                    {/* 범례 */}
                    <div className="min-w-0 flex-1 space-y-2">
                      {visitSourceData.slice(0, 5).map((item, index) => (
                        <div key={item.source} className="flex items-center justify-between gap-2 text-[13px]">
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: visitSourceColor(index) }}
                            />
                            <span className="truncate text-[color:var(--ad-ink-2)]">{item.label}</span>
                          </div>
                          <span className="ad-tnum font-medium text-[color:var(--ad-ink)]">{item.percentage}%</span>
                        </div>
                      ))}
                      {visitSourceData.length > 5 && (
                        <p className="pt-1 text-[12px] text-[color:var(--ad-faint)]">외 {visitSourceData.length - 5}개</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 방문경로별 고객 수 (막대 그래프) */}
              <div className="ad-card p-5">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                  <h3 className="text-[14px] font-semibold tracking-[-0.015em] text-[color:var(--ad-ink)]">방문경로별 고객 수</h3>
                </div>
                <p className="mt-1 text-[12px] text-[color:var(--ad-faint)]">방문경로별 고객 수를 비교합니다</p>

                {isVisitSourceLoading ? (
                  <div className="mt-5 space-y-3.5">
                    {[0, 1, 2, 3].map((k) => (
                      <Skel key={k} className="h-3.5 w-full" />
                    ))}
                  </div>
                ) : visitSourceData.length === 0 ? (
                  <div className="mt-5 flex h-40 items-center justify-center text-[13px] text-[color:var(--ad-faint)]">
                    데이터가 없습니다
                  </div>
                ) : (
                  <ul className="mt-5 space-y-3.5">
                    {visitSourceData.slice(0, 7).map((item, index) => {
                      const maxCount = Math.max(...visitSourceData.map((d) => d.count));
                      const barWidth = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
                      return (
                        <li key={item.source} className="grid grid-cols-[84px_minmax(0,1fr)_auto] items-center gap-3">
                          <span className="truncate text-[13px] text-[color:var(--ad-ink-2)]">{item.label}</span>
                          <div className="h-2 overflow-hidden rounded-full bg-[rgba(29,32,34,0.05)]">
                            <div
                              className="ad-grow-x h-full rounded-full"
                              style={{
                                ...rise(index),
                                width: `${barWidth}%`,
                                backgroundColor: visitSourceColor(index),
                              }}
                            />
                          </div>
                          <span className="ad-tnum whitespace-nowrap text-right text-[12.5px]">
                            <span className="font-semibold text-[color:var(--ad-ink)]">{item.count}</span>
                            <span className="ml-1.5 text-[color:var(--ad-faint)]">{item.percentage}%</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
