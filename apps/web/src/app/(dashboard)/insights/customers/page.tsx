'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Users, RefreshCw, TrendingUp, MapPin, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface GenderDistribution {
  male: number;
  female: number;
  unknown: number;
  total: number;
}

interface AgeDistribution {
  ageGroup: string;
  label: string;
  count: number;
  percentage: number;
}

interface GenderAgeSpending {
  gender: string;
  genderCode: string;
  ageGroup: string;
  ageLabel: string;
  avgPoints: number;
}

interface VisitSourceItem {
  source: string;
  label: string;
  count: number;
  percentage: number;
}

interface CustomerInsights {
  totalCustomers: number;
  genderDistribution: GenderDistribution;
  ageDistribution: AgeDistribution[];
  genderAgeSpending: GenderAgeSpending[];
  retention: { day7: number; day30: number };
  visitSourceDistribution: VisitSourceItem[];
}

export default function CustomerInsightsPage() {
  const [insights, setInsights] = useState<CustomerInsights | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 날짜 범위 선택 상태
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

  // Auth token helper
  const getAuthToken = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('token') || '';
    }
    return '';
  };

  // Fetch insights
  const fetchInsights = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = getAuthToken();
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const res = await fetch(`${API_BASE}/api/insights/customers?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        throw new Error('데이터를 불러오는데 실패했습니다.');
      }

      const data = await res.json();
      setInsights(data);
    } catch (err) {
      console.error('Failed to fetch insights:', err);
      setError('통계 데이터를 불러오는데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

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

  // 성별 파이차트 렌더링 (미설정 제외)
  const renderGenderPie = () => {
    if (!insights) return null;

    const { male, female } = insights.genderDistribution;
    const knownTotal = male + female;
    const malePercentage = knownTotal > 0 ? Math.round((male / knownTotal) * 100) : 0;
    const femalePercentage = knownTotal > 0 ? Math.round((female / knownTotal) * 100) : 0;

    return (
      <div className="flex items-center gap-8">
        <div
          className="relative w-32 h-32 rounded-full"
          style={{
            background: knownTotal > 0
              ? `conic-gradient(
                  #6366f1 0% ${malePercentage}%,
                  #ec4899 ${malePercentage}% 100%
                )`
              : '#e5e7eb',
          }}
        >
          <div className="absolute inset-4 bg-white rounded-full flex items-center justify-center">
            <span className="text-sm font-medium text-neutral-600">{knownTotal}명</span>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-indigo-500" />
            <span className="text-sm text-neutral-600">남성 {malePercentage}%</span>
            <span className="text-xs text-neutral-400">({male}명)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-pink-500" />
            <span className="text-sm text-neutral-600">여성 {femalePercentage}%</span>
            <span className="text-xs text-neutral-400">({female}명)</span>
          </div>
        </div>
      </div>
    );
  };

  // 연령대 막대 차트 렌더링
  const renderAgeBarChart = () => {
    if (!insights || insights.ageDistribution.length === 0) {
      return <p className="text-sm text-neutral-500">데이터가 없습니다.</p>;
    }

    const maxCount = Math.max(...insights.ageDistribution.map((d) => d.count));

    return (
      <div className="space-y-3">
        {insights.ageDistribution.map((item) => (
          <div key={item.ageGroup} className="flex items-center gap-3">
            <span className="text-sm text-neutral-600 w-20">{item.label}</span>
            <div className="flex-1 h-8 bg-neutral-100 rounded-lg overflow-hidden">
              <div
                className="h-full bg-brand-600 rounded-lg transition-all duration-500"
                style={{ width: maxCount > 0 ? `${(item.count / maxCount) * 100}%` : '0%' }}
              />
            </div>
            <span className="text-sm text-neutral-500 w-16 text-right">{item.count}명</span>
            <span className="text-xs text-neutral-400 w-10 text-right">{item.percentage}%</span>
          </div>
        ))}
      </div>
    );
  };

  // 성별×연령대별 평균 포인트 차트
  const renderGenderAgeSpendingChart = () => {
    if (!insights || insights.genderAgeSpending.length === 0) {
      return <p className="text-sm text-neutral-500">데이터가 없습니다.</p>;
    }

    const maxAvg = Math.max(...insights.genderAgeSpending.map((d) => d.avgPoints));

    // 연령대별로 그룹화
    const ageGroups = ['TWENTIES', 'THIRTIES', 'FORTIES', 'FIFTIES', 'SIXTY_PLUS'];
    const ageLabels: Record<string, string> = {
      TWENTIES: '20대',
      THIRTIES: '30대',
      FORTIES: '40대',
      FIFTIES: '50대',
      SIXTY_PLUS: '60대+',
    };

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4 mb-2">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-indigo-500" />
            <span className="text-xs text-neutral-500">남성</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-pink-500" />
            <span className="text-xs text-neutral-500">여성</span>
          </div>
        </div>
        <div className="flex items-end gap-4 h-40">
          {ageGroups.map((ageGroup) => {
            const maleData = insights.genderAgeSpending.find(
              (d) => d.genderCode === 'MALE' && d.ageGroup === ageGroup
            );
            const femaleData = insights.genderAgeSpending.find(
              (d) => d.genderCode === 'FEMALE' && d.ageGroup === ageGroup
            );

            const maleHeight = maleData && maxAvg > 0 ? (maleData.avgPoints / maxAvg) * 100 : 0;
            const femaleHeight = femaleData && maxAvg > 0 ? (femaleData.avgPoints / maxAvg) * 100 : 0;

            return (
              <div key={ageGroup} className="flex-1 flex flex-col items-center">
                <div className="flex gap-1 items-end h-32 w-full justify-center">
                  <div
                    className="w-5 bg-indigo-500 rounded-t transition-all duration-500"
                    style={{ height: `${maleHeight}%`, minHeight: maleData ? '4px' : '0' }}
                    title={`남성: ${maleData?.avgPoints.toLocaleString() || 0}P`}
                  />
                  <div
                    className="w-5 bg-pink-500 rounded-t transition-all duration-500"
                    style={{ height: `${femaleHeight}%`, minHeight: femaleData ? '4px' : '0' }}
                    title={`여성: ${femaleData?.avgPoints.toLocaleString() || 0}P`}
                  />
                </div>
                <span className="text-xs text-neutral-500 mt-2">{ageLabels[ageGroup]}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // 방문경로 파이차트 (미설정 제외)
  const renderVisitSourcePie = () => {
    if (!insights) return <p className="text-sm text-neutral-500">데이터가 없습니다.</p>;

    // 미설정(none) 제외
    const filteredData = insights.visitSourceDistribution.filter((item) => item.source !== 'none');
    if (filteredData.length === 0) {
      return <p className="text-sm text-neutral-500">데이터가 없습니다.</p>;
    }

    const colors = [
      '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
      '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#94a3b8',
    ];

    // 퍼센트 재계산
    const totalCount = filteredData.reduce((sum, item) => sum + item.count, 0);
    let cumulative = 0;
    const gradientParts = filteredData.map((item, idx) => {
      const start = cumulative;
      const pct = totalCount > 0 ? Math.round((item.count / totalCount) * 100) : 0;
      cumulative += pct;
      return `${colors[idx % colors.length]} ${start}% ${cumulative}%`;
    });

    return (
      <div className="flex items-center gap-8">
        <div
          className="relative w-32 h-32 rounded-full"
          style={{
            background: `conic-gradient(${gradientParts.join(', ')})`,
          }}
        >
          <div className="absolute inset-4 bg-white rounded-full flex items-center justify-center">
            <span className="text-xs font-medium text-neutral-600 text-center">방문<br />경로</span>
          </div>
        </div>
        <div className="space-y-1.5 max-h-32 overflow-y-auto">
          {filteredData.slice(0, 6).map((item, idx) => {
            const pct = totalCount > 0 ? Math.round((item.count / totalCount) * 100) : 0;
            return (
              <div key={item.source} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: colors[idx % colors.length] }}
                />
                <span className="text-sm text-neutral-600">{item.label}</span>
                <span className="text-xs text-neutral-400">({pct}%)</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // 방문경로 막대차트 (미설정 제외)
  const renderVisitSourceBarChart = () => {
    if (!insights) return <p className="text-sm text-neutral-500">데이터가 없습니다.</p>;

    // 미설정(none) 제외
    const filteredData = insights.visitSourceDistribution.filter((item) => item.source !== 'none');
    if (filteredData.length === 0) {
      return <p className="text-sm text-neutral-500">데이터가 없습니다.</p>;
    }

    const maxCount = Math.max(...filteredData.map((d) => d.count));

    return (
      <div className="space-y-3">
        {filteredData.map((item) => (
          <div key={item.source} className="flex items-center gap-3">
            <span className="text-sm text-neutral-600 w-24 truncate">{item.label}</span>
            <div className="flex-1 h-6 bg-neutral-100 rounded-lg overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-lg transition-all duration-500"
                style={{ width: maxCount > 0 ? `${(item.count / maxCount) * 100}%` : '0%' }}
              />
            </div>
            <span className="text-sm text-neutral-600 w-16 text-right">{item.count}명</span>
          </div>
        ))}
      </div>
    );
  };

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-600">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">고객 통계</h1>
          <p className="text-neutral-500 mt-1">고객 데이터 기반 인사이트</p>
        </div>
        <div className="flex items-center gap-2">
          {/* 날짜 범위 선택 */}
          <div className="relative" ref={datePickerRef}>
            <button
              onClick={() => {
                setTempStartDate(startDate);
                setTempEndDate(endDate);
                setShowDatePicker(!showDatePicker);
              }}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              <Calendar className="w-4 h-4 text-neutral-400" />
              <span>{formatDateRange()}</span>
            </button>

            {showDatePicker && (
              <div className="absolute right-0 top-full mt-2 bg-white border border-neutral-200 rounded-xl shadow-lg p-4 z-50 min-w-[280px]">
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 mb-1">시작일</label>
                    <input
                      type="date"
                      value={tempStartDate}
                      onChange={(e) => setTempStartDate(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 mb-1">종료일</label>
                    <input
                      type="date"
                      value={tempEndDate}
                      onChange={(e) => setTempEndDate(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={resetDateRange}
                      className="flex-1 px-3 py-2 text-sm text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors"
                    >
                      초기화
                    </button>
                    <button
                      onClick={applyDateRange}
                      className="flex-1 px-3 py-2 text-sm text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors"
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
            onClick={fetchInsights}
            disabled={isLoading}
            className={cn(
              'p-2 rounded-lg border transition-colors',
              isLoading
                ? 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                : 'bg-white text-neutral-700 hover:bg-neutral-50'
            )}
          >
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-neutral-200 p-6 animate-pulse">
              <div className="h-6 bg-neutral-200 rounded w-1/3 mb-4" />
              <div className="h-40 bg-neutral-100 rounded" />
            </div>
          ))}
        </div>
      ) : insights ? (
        <>
          {/* 방문경로 분석 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 방문경로 파이차트 */}
            <div className="bg-white rounded-xl border border-neutral-200 p-6">
              <div className="flex items-center gap-2 mb-6">
                <MapPin className="w-5 h-5 text-neutral-400" />
                <h3 className="font-semibold text-neutral-900">방문 경로 분포</h3>
              </div>
              {renderVisitSourcePie()}
            </div>

            {/* 방문경로 막대차트 */}
            <div className="bg-white rounded-xl border border-neutral-200 p-6">
              <div className="flex items-center gap-2 mb-6">
                <MapPin className="w-5 h-5 text-neutral-400" />
                <h3 className="font-semibold text-neutral-900">방문 경로별 고객 수</h3>
              </div>
              {renderVisitSourceBarChart()}
            </div>
          </div>

          {/* 재방문율 카드 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-neutral-200 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-medium text-neutral-900">7일 재방문율</h3>
                  <p className="text-xs text-neutral-500">최근 7일 내 2회 이상 방문</p>
                </div>
              </div>
              <div className="text-3xl font-bold text-neutral-900">{insights.retention.day7}%</div>
            </div>
            <div className="bg-white rounded-xl border border-neutral-200 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-medium text-neutral-900">30일 재방문율</h3>
                  <p className="text-xs text-neutral-500">최근 30일 내 2회 이상 방문</p>
                </div>
              </div>
              <div className="text-3xl font-bold text-neutral-900">{insights.retention.day30}%</div>
            </div>
          </div>

          {/* 인구통계 분석 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 성별 분포 */}
            <div className="bg-white rounded-xl border border-neutral-200 p-6">
              <div className="flex items-center gap-2 mb-6">
                <Users className="w-5 h-5 text-neutral-400" />
                <h3 className="font-semibold text-neutral-900">성별 분포</h3>
              </div>
              {renderGenderPie()}
            </div>

            {/* 연령대 분포 */}
            <div className="bg-white rounded-xl border border-neutral-200 p-6">
              <div className="flex items-center gap-2 mb-6">
                <Users className="w-5 h-5 text-neutral-400" />
                <h3 className="font-semibold text-neutral-900">연령대 분포</h3>
              </div>
              {renderAgeBarChart()}
            </div>

            {/* 성별×연령대별 평균 포인트 */}
            <div className="bg-white rounded-xl border border-neutral-200 p-6 lg:col-span-2">
              <div className="flex items-center gap-2 mb-6">
                <Users className="w-5 h-5 text-neutral-400" />
                <h3 className="font-semibold text-neutral-900">성별 × 연령대별 평균 포인트</h3>
                <span className="text-xs text-neutral-400">(누적 포인트 기준)</span>
              </div>
              {renderGenderAgeSpendingChart()}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
