'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  TrendingUp,
  BarChart3,
  PieChart,
  Calendar,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  MessageSquare,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Demo insights data
const DEMO_INSIGHTS = {
  ageDistribution: [
    { age: '20대', count: 1200, percentage: 24 },
    { age: '30대', count: 1800, percentage: 36 },
    { age: '40대', count: 1100, percentage: 22 },
    { age: '50대', count: 600, percentage: 12 },
    { age: '60대 이상', count: 300, percentage: 6 },
  ],
  genderDistribution: { male: 2400, female: 2600, total: 5000 },
  retention: { day7: 42, day30: 28 },
  monthlyTrend: [
    { month: '8월', customers: 4200 },
    { month: '9월', customers: 4450 },
    { month: '10월', customers: 4680 },
    { month: '11월', customers: 4820 },
    { month: '12월', customers: 4950 },
    { month: '1월', customers: 5000 },
  ],
  topStores: [
    { name: '철길부산집 잠실점', customers: 423 },
    { name: '철길부산집 부산서면점', customers: 445 },
    { name: '철길부산집 분당점', customers: 356 },
    { name: '철길부산집 강남점', customers: 342 },
    { name: '철길부산집 건대점', customers: 312 },
  ],
};

interface AgeDistribution {
  age: string;
  count: number;
  percentage: number;
}

interface MonthlyTrend {
  month: string;
  customers: number;
}

interface TopStore {
  name: string;
  customers: number;
}

interface Insights {
  ageDistribution: AgeDistribution[];
  genderDistribution: { male: number; female: number; total: number };
  retention: { day7: number; day30: number };
  monthlyTrend: MonthlyTrend[];
  topStores: TopStore[];
}

export default function FranchiseInsightsPage() {
  const [insights, setInsights] = useState<Insights>(DEMO_INSIGHTS);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('30days');
  const [showPeriodDropdown, setShowPeriodDropdown] = useState(false);

  const periodOptions = [
    { value: '7days', label: '최근 7일' },
    { value: '30days', label: '최근 30일' },
    { value: '90days', label: '최근 90일' },
    { value: 'all', label: '전체 기간' },
  ];

  // Auth token helper
  const getAuthToken = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('franchiseToken') || '';
    }
    return '';
  };

  // Fetch insights
  const fetchInsights = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/api/franchise/insights?period=${selectedPeriod}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setInsights(data || DEMO_INSIGHTS);
      } else {
        setInsights(DEMO_INSIGHTS);
      }
    } catch (err) {
      console.error('Failed to fetch insights:', err);
      setInsights(DEMO_INSIGHTS);
    } finally {
      setIsLoading(false);
    }
  }, [selectedPeriod]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  // Render bar chart (simple CSS-based)
  const renderBarChart = (data: AgeDistribution[]) => {
    if (!data || data.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <BarChart3 className="w-12 h-12 text-slate-300 mb-3" />
          <p className="text-sm text-slate-500">연령대별 데이터가 없습니다</p>
          <p className="text-xs text-slate-400 mt-1">
            고객 정보에 생년월일이 등록되면 자동으로 집계됩니다
          </p>
        </div>
      );
    }

    const maxCount = Math.max(...data.map((d) => d.count));
    return (
      <div className="space-y-3">
        {data.map((item) => (
          <div key={item.age} className="flex items-center gap-3">
            <span className="text-sm text-slate-600 w-20">{item.age}</span>
            <div className="flex-1 h-8 bg-slate-100 rounded-lg overflow-hidden">
              <div
                className="h-full bg-franchise-500 rounded-lg transition-all duration-500"
                style={{ width: `${(item.count / maxCount) * 100}%` }}
              />
            </div>
            <span className="text-sm font-medium text-slate-900 w-16 text-right">
              {item.count.toLocaleString()}
            </span>
            <span className="text-xs text-slate-500 w-12 text-right">{item.percentage}%</span>
          </div>
        ))}
      </div>
    );
  };

  // Render pie chart (simple CSS-based)
  const renderGenderPie = () => {
    const { male, female, total } = insights.genderDistribution;
    const malePercentage = Math.round((male / total) * 100);
    const femalePercentage = Math.round((female / total) * 100);

    return (
      <div className="flex items-center gap-8">
        <div
          className="relative w-32 h-32 rounded-full"
          style={{
            background: `conic-gradient(#6366f1 0% ${malePercentage}%, #ec4899 ${malePercentage}% 100%)`,
          }}
        >
          <div className="absolute inset-3 bg-white rounded-full flex items-center justify-center">
            <span className="text-lg font-bold text-slate-900">{total.toLocaleString()}</span>
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full bg-franchise-500" />
            <span className="text-sm text-slate-600">남성</span>
            <span className="text-sm font-medium text-slate-900">{male.toLocaleString()}명 ({malePercentage}%)</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full bg-pink-500" />
            <span className="text-sm text-slate-600">여성</span>
            <span className="text-sm font-medium text-slate-900">{female.toLocaleString()}명 ({femalePercentage}%)</span>
          </div>
        </div>
      </div>
    );
  };

  // Render mini trend chart
  const renderTrendChart = () => {
    if (!insights.monthlyTrend || insights.monthlyTrend.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <p className="text-sm text-slate-500">월별 추이 데이터가 없습니다</p>
        </div>
      );
    }

    const maxCustomers = Math.max(...insights.monthlyTrend.map((d) => d.customers), 1); // 최소값 1로 설정

    return (
      <div className="flex items-end gap-2 h-32">
        {insights.monthlyTrend.map((item) => {
          const heightPercentage = maxCustomers > 0 ? (item.customers / maxCustomers) * 100 : 0;
          const minVisibleHeight = item.customers > 0 ? 8 : 0; // 값이 있으면 최소 8px
          const barHeight = item.customers > 0 ? Math.max(heightPercentage, minVisibleHeight) : 0;

          return (
            <div key={item.month} className="flex-1 flex flex-col items-center gap-2">
              <div className="relative w-full flex items-end justify-center" style={{ height: '96px' }}>
                {item.customers > 0 && (
                  <div
                    className="w-full bg-franchise-500 rounded-t-sm transition-all duration-500"
                    style={{ height: `${barHeight}%` }}
                  />
                )}
              </div>
              <span className="text-[10px] text-slate-500">{item.month}</span>
            </div>
          );
        })}
      </div>
    );
  };

  // Loading skeleton
  const renderSkeleton = () => (
    <div className="animate-pulse space-y-6">
      <div className="grid grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-32 bg-slate-200 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="h-64 bg-slate-200 rounded-xl" />
        <div className="h-64 bg-slate-200 rounded-xl" />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">인사이트</h1>
            <p className="text-sm text-slate-500 mt-1">
              고객 및 캠페인 분석 데이터를 확인합니다
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Period Selector */}
            <div className="relative">
              <button
                onClick={() => setShowPeriodDropdown(!showPeriodDropdown)}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Calendar className="w-4 h-4 text-slate-400" />
                {periodOptions.find((p) => p.value === selectedPeriod)?.label}
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>
              {showPeriodDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowPeriodDropdown(false)} />
                  <div className="absolute z-20 mt-1 right-0 w-40 bg-white border border-slate-200 rounded-lg shadow-lg">
                    {periodOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          setSelectedPeriod(option.value);
                          setShowPeriodDropdown(false);
                        }}
                        className={cn(
                          'w-full px-4 py-2 text-left text-sm hover:bg-slate-50 transition-colors',
                          selectedPeriod === option.value ? 'bg-franchise-50 text-franchise-700' : 'text-slate-700'
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Refresh Button */}
            <button
              onClick={fetchInsights}
              disabled={isLoading}
              className="p-2 bg-white border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
            </button>
          </div>
        </div>

        {isLoading ? (
          renderSkeleton()
        ) : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {/* Retention Cards */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 bg-franchise-100 rounded-lg">
                    <TrendingUp className="w-5 h-5 text-franchise-600" />
                  </div>
                  <span className="text-sm font-medium text-slate-700">7일 재방문율</span>
                </div>
                <p className="text-3xl font-bold text-slate-900">{insights.retention.day7}%</p>
                <p className="text-xs text-slate-500 mt-1">최근 7일 내 재방문한 고객 비율</p>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 bg-emerald-100 rounded-lg">
                    <TrendingUp className="w-5 h-5 text-emerald-600" />
                  </div>
                  <span className="text-sm font-medium text-slate-700">30일 재방문율</span>
                </div>
                <p className="text-3xl font-bold text-slate-900">{insights.retention.day30}%</p>
                <p className="text-xs text-slate-500 mt-1">최근 30일 내 재방문한 고객 비율</p>
              </div>
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Age Distribution */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="w-5 h-5 text-franchise-600" />
                  <h3 className="text-lg font-semibold text-slate-900">연령대별 고객 분포</h3>
                </div>
                <p className="text-sm text-slate-500 mb-4">전체 고객의 연령대별 분포를 보여줍니다</p>
                {renderBarChart(insights.ageDistribution)}
              </div>

              {/* Gender Distribution */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                <div className="flex items-center gap-2 mb-4">
                  <PieChart className="w-5 h-5 text-pink-600" />
                  <h3 className="text-lg font-semibold text-slate-900">성별 분포</h3>
                </div>
                <p className="text-sm text-slate-500 mb-4">전체 고객의 성별 비율을 보여줍니다</p>
                {renderGenderPie()}
              </div>
            </div>

            {/* Monthly Trend - Full Width */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-slate-900">월별 고객 추이</h3>
              </div>
              <p className="text-sm text-slate-500 mb-4">최근 6개월간 누적 고객 수 변화입니다</p>
              {renderTrendChart()}
              <div className="mt-4 grid grid-cols-3 gap-4">
                {insights.monthlyTrend.slice(-3).map((item) => (
                  <div key={item.month} className="text-center">
                    <p className="text-xs text-slate-500">{item.month}</p>
                    <p className="text-sm font-medium text-slate-900">{item.customers.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Stores */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-5 h-5 text-slate-600" />
                <h3 className="text-lg font-semibold text-slate-900">가맹점별 고객 현황</h3>
              </div>
              <p className="text-sm text-slate-500 mb-4">가맹점별 고객 수를 보여줍니다</p>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">가맹점명</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">고객 수</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {insights.topStores.map((store, index) => (
                      <tr key={store.name} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className={cn(
                              'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium',
                              index === 0 ? 'bg-amber-100 text-amber-700' :
                                index === 1 ? 'bg-slate-200 text-slate-600' :
                                  index === 2 ? 'bg-orange-100 text-orange-700' :
                                    'bg-slate-100 text-slate-500'
                            )}>
                              {index + 1}
                            </span>
                            <span className="text-sm font-medium text-slate-900">{store.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-medium text-slate-900">
                          {store.customers.toLocaleString()}명
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
