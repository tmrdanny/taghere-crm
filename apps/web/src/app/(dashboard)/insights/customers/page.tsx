'use client';

import { API_BASE } from '@/lib/api-config';
import { getStoreToken } from '@/lib/auth-token';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Users, RefreshCw, TrendingUp, MapPin, Calendar, Gift, Globe, Download } from 'lucide-react';
import { exportOrderLanguages } from '@/lib/insights-export';
import { cn } from '@/lib/utils';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

// ── 차트 공통 스타일 (홈 방문자 차트와 같은 톤) ──
// 순차 파랑 → 무채색 순서. 도넛·범례·막대가 같은 순서를 쓴다.
const RAMP = ['#2a2d62', '#6eadff', '#a5ccff', '#dcebff', '#91959a', '#d1d3d6'];
const rampColor = (idx: number) => RAMP[idx] ?? '#ebeced';
const MALE_COLOR = '#2a2d62';
const FEMALE_COLOR = '#a5ccff';
const TICK = { fill: '#91959a', fontSize: 11 };

// 얇은 링 도넛 (conic-gradient, 안쪽 반지름 약 70%)
function Donut({ gradient, center, sub }: { gradient: string; center: React.ReactNode; sub?: string }) {
  return (
    <div className="relative h-32 w-32 shrink-0 rounded-full" style={{ background: gradient }}>
      <div className="absolute inset-[19px] flex flex-col items-center justify-center rounded-full bg-white">
        <span className="ad-tnum text-[15px] font-medium tracking-[-0.02em] text-[color:var(--ad-ink)]">{center}</span>
        {sub && <span className="text-[11px] text-[color:var(--ad-faint)]">{sub}</span>}
      </div>
    </div>
  );
}

// 범례 한 줄: 점 · 라벨 · 비율 · 건수
function LegendRow({ color, label, pct, count }: { color: string; label: string; pct: string; count: string }) {
  return (
    <div className="grid grid-cols-[8px_minmax(0,1fr)_auto_auto] items-center gap-x-2.5 text-[12.5px]">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      <span className="truncate text-[color:var(--ad-ink-2)]">{label}</span>
      <span className="ad-tnum text-right font-medium text-[color:var(--ad-ink)]">{pct}</span>
      <span className="ad-tnum min-w-[44px] text-right text-[12px] text-[color:var(--ad-faint)]">{count}</span>
    </div>
  );
}

// 가로 막대 한 줄 (얇은 트랙)
function ThinBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-[rgba(29,32,34,0.05)]">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

// 흰 카드 툴팁 (홈 ChartTip 과 동일한 모양)
function PointTip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; fill?: string; color?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const items = payload.filter((p) => p.value !== undefined && p.value !== null);
  if (items.length === 0) return null;
  return (
    <div className="rounded-[10px] bg-white/95 px-3 py-2 text-[12px] shadow-[0_0_0_1px_rgba(29,32,34,0.06),0_12px_24px_-12px_rgba(19,22,81,0.3)] backdrop-blur">
      <p className="mb-1 text-[color:var(--ad-muted)]">{label}</p>
      {items.map((p) => (
        <p key={p.name} className="ad-tnum flex items-center gap-1.5 font-medium text-[color:var(--ad-ink)]">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.fill || p.color }} />
          {p.name} {Number(p.value).toLocaleString()}P
        </p>
      ))}
    </div>
  );
}


interface GenderDistribution {
  male: number;
  female: number;
  unknown: number;
  total: number;
}

interface OrderLanguageStats {
  supported: boolean;
  available: boolean;
  /** 태그히어 쪽에 이 매장이 연결돼 있는지. false 면 집계가 아니라 연동 설정 문제다 */
  linked?: boolean;
  breakdown: {
    totalOrders: number;
    identifiedOrders: number;
    unknownCount: number;
    languages: { language: string; count: number; percentage: number }[];
  } | null;
}

const ORDER_LANGUAGE_LABELS: Record<string, string> = {
  ko: '한국어',
  en: '영어',
  zh: '중국어',
  ja: '일본어',
  vi: '베트남어',
  mn: '몽골어',
};

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
  stampRewardCustomers?: number;
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

  // 주문 언어 분포 (태그히어 V2에서 조회 — 메인 통계와 독립적으로 로드)
  const [orderLanguages, setOrderLanguages] = useState<OrderLanguageStats | null>(null);
  const [isLanguageLoading, setIsLanguageLoading] = useState(true);
  const [languageRefreshKey, setLanguageRefreshKey] = useState(0);

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
  // Fetch insights
  const fetchInsights = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = getStoreToken();
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

  // 주문 언어 분포 조회 (V2 장애 시에도 나머지 통계는 그대로 보이도록 분리)
  useEffect(() => {
    let ignore = false;
    const fetchOrderLanguages = async () => {
      setIsLanguageLoading(true);
      try {
        const token = getStoreToken();
        const params = new URLSearchParams();
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);

        const res = await fetch(`${API_BASE}/api/insights/order-languages?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (ignore) return;
        if (res.ok) {
          const data = await res.json();
          if (ignore) return;
          setOrderLanguages(data);
        } else {
          setOrderLanguages(null);
        }
      } catch (err) {
        if (!ignore) {
          console.error('Failed to fetch order languages:', err);
          setOrderLanguages(null);
        }
      } finally {
        if (!ignore) setIsLanguageLoading(false);
      }
    };
    fetchOrderLanguages();
    return () => {
      ignore = true;
    };
  }, [startDate, endDate, languageRefreshKey]);

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
        <Donut
          gradient={
            knownTotal > 0
              ? `conic-gradient(${MALE_COLOR} 0% ${malePercentage}%, ${FEMALE_COLOR} ${malePercentage}% 100%)`
              : '#ebeced'
          }
          center={`${knownTotal.toLocaleString()}명`}
          sub="성별 입력"
        />
        <div className="min-w-0 flex-1 space-y-2.5">
          <LegendRow color={MALE_COLOR} label="남성" pct={`${malePercentage}%`} count={`${male.toLocaleString()}명`} />
          <LegendRow color={FEMALE_COLOR} label="여성" pct={`${femalePercentage}%`} count={`${female.toLocaleString()}명`} />
        </div>
      </div>
    );
  };

  // 연령대 막대 차트 렌더링
  const renderAgeBarChart = () => {
    if (!insights || insights.ageDistribution.length === 0) {
      return <p className="text-[13px] text-[color:var(--ad-muted)]">데이터가 없습니다.</p>;
    }

    const maxCount = Math.max(...insights.ageDistribution.map((d) => d.count));

    return (
      <div className="space-y-3.5">
        {insights.ageDistribution.map((item) => (
          <div key={item.ageGroup} className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-3 text-[12.5px]">
            <span className="truncate text-[color:var(--ad-ink-2)]">{item.label}</span>
            <ThinBar
              pct={maxCount > 0 ? (item.count / maxCount) * 100 : 0}
              color={maxCount > 0 && item.count === maxCount ? '#6eadff' : '#a5ccff'}
            />
            <span className="ad-tnum min-w-[92px] text-right">
              <span className="font-medium text-[color:var(--ad-ink)]">{item.percentage}%</span>
              <span className="ml-1.5 text-[12px] text-[color:var(--ad-faint)]">{item.count.toLocaleString()}명</span>
            </span>
          </div>
        ))}
      </div>
    );
  };

  // 성별×연령대별 평균 포인트 차트
  const renderGenderAgeSpendingChart = () => {
    if (!insights || insights.genderAgeSpending.length === 0) {
      return <p className="text-[13px] text-[color:var(--ad-muted)]">데이터가 없습니다.</p>;
    }

    // 연령대별로 그룹화
    const ageGroups = ['TEENS', 'TWENTIES', 'THIRTIES', 'FORTIES', 'FIFTIES', 'SIXTY_PLUS'];
    const ageLabels: Record<string, string> = {
      TEENS: '10대',
      TWENTIES: '20대',
      THIRTIES: '30대',
      FORTIES: '40대',
      FIFTIES: '50대',
      SIXTY_PLUS: '60대+',
    };
    // API 가 'MALE_SIXTY_PLUS' 키를 '_' 로 나누면서 60대+ 를 'SIXTY' 로 내려주는 경우가 있어 같은 그룹으로 본다
    const sameAge = (code: string, group: string) => code === group || (group === 'SIXTY_PLUS' && code === 'SIXTY');

    const chartRows = ageGroups
      .map((ageGroup) => {
        const maleData = insights.genderAgeSpending.find(
          (d) => d.genderCode === 'MALE' && sameAge(d.ageGroup, ageGroup)
        );
        const femaleData = insights.genderAgeSpending.find(
          (d) => d.genderCode === 'FEMALE' && sameAge(d.ageGroup, ageGroup)
        );
        return {
          age: ageLabels[ageGroup],
          남성: maleData ? maleData.avgPoints : undefined,
          여성: femaleData ? femaleData.avgPoints : undefined,
        };
      })
      // 데이터가 하나도 없는 연령대는 빈 칸으로 두지 않는다
      .filter((row) => row.남성 !== undefined || row.여성 !== undefined);

    if (chartRows.length === 0) {
      return <p className="text-[13px] text-[color:var(--ad-muted)]">데이터가 없습니다.</p>;
    }

    return (
      <div>
        <div className="mb-3 flex items-center gap-4 text-[12px] text-[color:var(--ad-muted)]">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: MALE_COLOR }} />
            남성
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: FEMALE_COLOR }} />
            여성
          </span>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartRows} margin={{ top: 6, right: 4, left: 0, bottom: 0 }} barGap={4} barCategoryGap="28%">
              <CartesianGrid vertical={false} stroke="rgba(29,32,34,0.06)" strokeDasharray="2 4" />
              <XAxis dataKey="age" axisLine={false} tickLine={false} tick={TICK} dy={6} />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={TICK}
                width={56}
                allowDecimals={false}
                tickFormatter={(v: number) => `${v.toLocaleString()}P`}
              />
              <Tooltip content={<PointTip />} cursor={{ fill: 'rgba(110,173,255,0.08)' }} />
              <Bar dataKey="남성" name="남성" fill={MALE_COLOR} radius={[6, 6, 2, 2]} maxBarSize={28} />
              <Bar dataKey="여성" name="여성" fill={FEMALE_COLOR} radius={[6, 6, 2, 2]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  // 방문경로 파이차트 (미설정 제외)
  const renderVisitSourcePie = () => {
    if (!insights) return <p className="text-[13px] text-[color:var(--ad-muted)]">데이터가 없습니다.</p>;

    // 미설정(none) 제외
    const filteredData = insights.visitSourceDistribution.filter((item) => item.source !== 'none');
    if (filteredData.length === 0) {
      return <p className="text-[13px] text-[color:var(--ad-muted)]">데이터가 없습니다.</p>;
    }

    // 퍼센트 재계산
    const totalCount = filteredData.reduce((sum, item) => sum + item.count, 0);
    let cumulative = 0;
    const gradientParts = filteredData.map((item, idx) => {
      const start = cumulative;
      const pct = totalCount > 0 ? Math.round((item.count / totalCount) * 100) : 0;
      cumulative += pct;
      return `${rampColor(idx)} ${start}% ${cumulative}%`;
    });

    return (
      <div className="flex items-center gap-8">
        <Donut
          gradient={`conic-gradient(${gradientParts.join(', ')})`}
          center={`${totalCount.toLocaleString()}명`}
          sub="방문 경로"
        />
        <div className="min-w-0 flex-1 space-y-2.5">
          {filteredData.slice(0, 6).map((item, idx) => {
            const pct = totalCount > 0 ? Math.round((item.count / totalCount) * 100) : 0;
            return (
              <LegendRow
                key={item.source}
                color={rampColor(idx)}
                label={item.label}
                pct={`${pct}%`}
                count={`${item.count.toLocaleString()}명`}
              />
            );
          })}
        </div>
      </div>
    );
  };

  // 주문 언어 분포 (언어가 기록된 주문만 분모로 사용)
  const renderOrderLanguagePie = () => {
    if (isLanguageLoading) {
      return <div className="h-32 bg-[color:var(--ad-bg)] rounded animate-pulse" />;
    }
    // 조회 실패 / 매장 미지원 / 연동 누락 / 실제 0건을 각각 다르게 안내한다
    // 미지원 매장은 available 도 false 로 내려오므로 supported 를 먼저 본다
    if (!orderLanguages) {
      return <p className="text-[13px] text-[color:var(--ad-muted)]">일시적으로 데이터를 불러오지 못했습니다.</p>;
    }
    if (!orderLanguages.supported) {
      return <p className="text-[13px] text-[color:var(--ad-muted)]">태그히어 신형 메뉴판 연동 매장에서만 제공됩니다.</p>;
    }
    if (!orderLanguages.available) {
      return <p className="text-[13px] text-[color:var(--ad-muted)]">일시적으로 데이터를 불러오지 못했습니다.</p>;
    }
    if (orderLanguages.linked === false) {
      return (
        <p className="text-[13px] text-[color:var(--ad-muted)]">
          태그히어와 매장 연결이 확인되지 않아 집계할 수 없습니다. 고객센터로 문의해 주세요.
        </p>
      );
    }

    const breakdown = orderLanguages.breakdown;
    if (!breakdown || breakdown.identifiedOrders === 0) {
      return <p className="text-[13px] text-[color:var(--ad-muted)]">아직 집계된 주문 언어가 없습니다.</p>;
    }

    let cumulative = 0;
    const gradientParts = breakdown.languages.map((item, idx) => {
      const start = cumulative;
      cumulative += item.percentage;
      return `${rampColor(idx)} ${start}% ${cumulative}%`;
    });
    // 반올림으로 합이 100에 못 미치면 마지막 언어가 나머지를 흡수하지 않도록 채운다
    if (cumulative < 100) {
      gradientParts.push(`#ebeced ${cumulative}% 100%`);
    }

    const foreignCount = breakdown.languages
      .filter((item) => item.language !== 'ko')
      .reduce((sum, item) => sum + item.count, 0);
    const foreignPercentage = Math.round((foreignCount / breakdown.identifiedOrders) * 100);

    return (
      <div>
        <div className="mb-5">
          <p className="ad-tnum text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">외국어 주문 {foreignPercentage}%</p>
          <p className="text-[13px] text-[color:var(--ad-muted)]">
            {breakdown.identifiedOrders.toLocaleString()}건 중 {foreignCount.toLocaleString()}건
          </p>
        </div>
        <div className="flex items-center gap-8">
          <Donut
            gradient={`conic-gradient(${gradientParts.join(', ')})`}
            center={`${breakdown.identifiedOrders.toLocaleString()}건`}
            sub="주문 언어"
          />
          <div className="min-w-0 max-w-[360px] flex-1 space-y-2.5">
            {breakdown.languages.map((item, idx) => (
              <LegendRow
                key={item.language}
                color={rampColor(idx)}
                label={ORDER_LANGUAGE_LABELS[item.language] || item.language}
                pct={`${item.percentage}%`}
                count={`${item.count.toLocaleString()}건`}
              />
            ))}
          </div>
        </div>
        {breakdown.unknownCount > 0 && (
          <p className="mt-4 text-[12px] text-[color:var(--ad-faint)]">
            언어 미기록 {breakdown.unknownCount.toLocaleString()}건 제외
          </p>
        )}
      </div>
    );
  };

  // 방문경로 막대차트 (미설정 제외)
  const renderVisitSourceBarChart = () => {
    if (!insights) return <p className="text-[13px] text-[color:var(--ad-muted)]">데이터가 없습니다.</p>;

    // 미설정(none) 제외
    const filteredData = insights.visitSourceDistribution.filter((item) => item.source !== 'none');
    if (filteredData.length === 0) {
      return <p className="text-[13px] text-[color:var(--ad-muted)]">데이터가 없습니다.</p>;
    }

    const maxCount = Math.max(...filteredData.map((d) => d.count));

    return (
      <div className="space-y-3.5">
        {filteredData.map((item, idx) => (
          <div key={item.source} className="grid grid-cols-[8px_88px_minmax(0,1fr)_auto] items-center gap-2.5 text-[12.5px]">
            <span className="h-2 w-2 rounded-full" style={{ background: rampColor(idx) }} />
            <span className="truncate text-[color:var(--ad-ink-2)]">{item.label}</span>
            <ThinBar
              pct={maxCount > 0 ? (item.count / maxCount) * 100 : 0}
              color={maxCount > 0 && item.count === maxCount ? '#6eadff' : '#a5ccff'}
            />
            <span className="ad-tnum min-w-[52px] text-right font-medium text-[color:var(--ad-ink)]">{item.count.toLocaleString()}명</span>
          </div>
        ))}
      </div>
    );
  };

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 sm:px-8 lg:pt-8">
        <div className="rounded-[12px] bg-[#fff2f5] px-4 py-3 text-[13px] text-[color:var(--ad-neg)]">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 sm:px-8 lg:pt-8 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-[color:var(--ad-ink)]">고객 통계</h1>
          <p className="mt-1 text-[13px] text-[color:var(--ad-muted)]">고객 데이터 기반 인사이트</p>
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
              className="ad-press inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] bg-white px-3.5 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
            >
              <Calendar className="h-3.5 w-3.5 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
              <span>{formatDateRange()}</span>
            </button>

            {showDatePicker && (
              <div className="absolute right-0 top-full z-50 mt-2 min-w-[280px] rounded-[14px] border border-[color:var(--ad-line)] bg-white p-4 shadow-[0_16px_40px_-16px_rgba(29,32,34,0.25)]">
                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">시작일</label>
                    <input
                      type="date"
                      value={tempStartDate}
                      max={tempEndDate || undefined}
                      onChange={(e) => setTempStartDate(e.target.value)}
                      className="h-10 w-full rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13.5px] focus:border-[color:var(--ad-ink)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">종료일</label>
                    <input
                      type="date"
                      value={tempEndDate}
                      min={tempStartDate || undefined}
                      onChange={(e) => setTempEndDate(e.target.value)}
                      className="h-10 w-full rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13.5px] focus:border-[color:var(--ad-ink)] focus:outline-none"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={resetDateRange}
                      className="ad-press inline-flex h-9 flex-1 items-center justify-center rounded-[10px] bg-white px-3.5 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
                    >
                      초기화
                    </button>
                    <button
                      onClick={applyDateRange}
                      className="ad-press inline-flex h-9 flex-1 items-center justify-center rounded-[12px] bg-[color:var(--ad-ink)] px-4 text-[13.5px] font-semibold text-white hover:bg-[#383c40] disabled:opacity-40"
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
            onClick={() => {
              fetchInsights();
              setLanguageRefreshKey((key) => key + 1);
            }}
            disabled={isLoading}
            className={cn(
              'ad-press inline-flex h-9 w-9 items-center justify-center rounded-[10px] shadow-[inset_0_0_0_1px_var(--ad-line-strong)]',
              isLoading
                ? 'bg-[color:var(--ad-bg)] text-[color:var(--ad-faint)] cursor-not-allowed'
                : 'bg-white text-[color:var(--ad-ink-2)] hover:bg-[color:var(--ad-bg-alt)]'
            )}
          >
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="ad-card p-5 animate-pulse">
              <div className="mb-4 h-5 w-1/3 rounded bg-[color:var(--ad-bg)]" />
              <div className="h-40 rounded bg-[color:var(--ad-bg-alt)]" />
            </div>
          ))}
        </div>
      ) : insights ? (
        <>
          {/* 방문경로 분석 */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* 방문경로 파이차트 */}
            <div className="ad-card p-5">
              <div className="mb-5 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-[color:var(--ad-faint)]" />
                <h3 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">방문 경로 분포</h3>
              </div>
              {renderVisitSourcePie()}
            </div>

            {/* 방문경로 막대차트 */}
            <div className="ad-card p-5">
              <div className="mb-5 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-[color:var(--ad-faint)]" />
                <h3 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">방문 경로별 고객 수</h3>
              </div>
              {renderVisitSourceBarChart()}
            </div>
          </div>

          {/* 주문 언어 분포 */}
          <div className="ad-card p-5">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-[color:var(--ad-faint)]" />
                <h3 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">주문 언어 분포</h3>
              </div>
              {/* 선택한 기간의 집계 데이터를 엑셀로 저장 (개인정보 미포함) */}
              <button
                onClick={() => {
                  if (!orderLanguages?.breakdown) return;
                  exportOrderLanguages(
                    orderLanguages.breakdown.languages,
                    (code) => ORDER_LANGUAGE_LABELS[code] || code,
                    orderLanguages.breakdown,
                    formatDateRange().replace(/\s/g, ''),
                    '내매장'
                  );
                }}
                disabled={!orderLanguages?.breakdown || orderLanguages.breakdown.languages.length === 0}
                className="ad-press inline-flex h-8 items-center gap-1 rounded-[10px] bg-white px-3 text-[12.5px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] disabled:opacity-40 disabled:hover:bg-white"
              >
                <Download className="w-3.5 h-3.5" />
                엑셀
              </button>
            </div>
            {renderOrderLanguagePie()}
          </div>

          {/* 재방문율 + 스탬프 보상 카드 */}
          <div className="ad-card grid grid-cols-1 md:grid-cols-3">
            <div className="p-5">
              <div className="flex items-start gap-2 mb-4">
                <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 self-start text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                <div>
                  <h3 className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">7일 재방문율</h3>
                  <p className="text-[12px] text-[color:var(--ad-muted)]">최근 7일 내 2회 이상 방문</p>
                </div>
              </div>
              <div className="ad-tnum text-[24px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">{insights.retention.day7}%</div>
            </div>
            <div className="border-t border-[color:var(--ad-line)] p-5 md:border-l md:border-t-0">
              <div className="flex items-start gap-2 mb-4">
                <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 self-start text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                <div>
                  <h3 className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">30일 재방문율</h3>
                  <p className="text-[12px] text-[color:var(--ad-muted)]">최근 30일 내 2회 이상 방문</p>
                </div>
              </div>
              <div className="ad-tnum text-[24px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">{insights.retention.day30}%</div>
            </div>
            <div className="border-t border-[color:var(--ad-line)] p-5 md:border-l md:border-t-0">
              <div className="flex items-start gap-2 mb-4">
                <Gift className="mt-0.5 h-4 w-4 shrink-0 self-start text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                <div>
                  <h3 className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">스탬프 보상 수령 고객</h3>
                  <p className="text-[12px] text-[color:var(--ad-muted)]">기간 내 보상 받은 고객 수</p>
                </div>
              </div>
              <div className="ad-tnum text-[24px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">
                {(insights.stampRewardCustomers ?? 0).toLocaleString()}명
              </div>
            </div>
          </div>

          {/* 인구통계 분석 */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* 성별 분포 */}
            <div className="ad-card p-5">
              <div className="mb-5 flex items-center gap-2">
                <Users className="h-4 w-4 text-[color:var(--ad-faint)]" />
                <h3 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">성별 분포</h3>
              </div>
              {renderGenderPie()}
            </div>

            {/* 연령대 분포 */}
            <div className="ad-card p-5">
              <div className="mb-5 flex items-center gap-2">
                <Users className="h-4 w-4 text-[color:var(--ad-faint)]" />
                <h3 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">연령대 분포</h3>
              </div>
              {renderAgeBarChart()}
            </div>

            {/* 성별×연령대별 평균 포인트 */}
            <div className="ad-card p-5 lg:col-span-2">
              <div className="mb-5 flex items-center gap-2">
                <Users className="h-4 w-4 text-[color:var(--ad-faint)]" />
                <h3 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">성별 × 연령대별 평균 포인트</h3>
                <span className="text-[12px] text-[color:var(--ad-faint)]">(누적 포인트 기준)</span>
              </div>
              {renderGenderAgeSpendingChart()}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
