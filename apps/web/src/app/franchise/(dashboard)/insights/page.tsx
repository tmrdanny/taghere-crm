'use client';

import { API_BASE } from '@/lib/api-config';
import { getFranchiseToken } from '@/lib/auth-token';
import { useState, useEffect, useCallback, useRef } from 'react';
import { SurveyResults } from '@/components/insights/SurveyResults';
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
  ChevronLeft,
  ChevronRight,
  Compass,
  Gift,
  Send,
  Building2,
  Check,
  Globe,
  Download,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import DateRangeFilter, { type DateRange } from '@/components/DateRangeFilter';
import {
  exportDailyVisitors,
  exportOrderLanguages,
  periodLabel,
} from '@/lib/insights-export';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  BarChart,
  Bar,
  Cell,
} from 'recharts';


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
  visitSourceDistribution: [
    { source: 'naver', label: '네이버', count: 1200, percentage: 30 },
    { source: 'instagram', label: '인스타그램', count: 800, percentage: 20 },
    { source: 'friend', label: '지인 추천', count: 600, percentage: 15 },
    { source: 'revisit', label: '단순 재방문', count: 500, percentage: 13 },
    { source: 'passby', label: '지나가다', count: 400, percentage: 10 },
    { source: 'kakao', label: '카카오톡', count: 300, percentage: 8 },
    { source: 'youtube', label: '유튜브', count: 200, percentage: 4 },
  ],
  messageStats: {
    earn: { count: 12400, amount: 124000, unitPrice: 10 },
    marketing: { count: 3200, amount: 160000, unitPrice: 50 },
  },
  stampRewardCustomers: 842,
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

interface OrderLanguageStats {
  available: boolean;
  breakdown: {
    totalOrders: number;
    identifiedOrders: number;
    unknownCount: number;
    languages: { language: string; count: number; percentage: number }[];
  } | null;
  storeCount: number;
  excludedV1Count: number;
  /** 태그히어에 연결되지 않은 가맹점 수 (연동 설정 누락 = 조치 대상) */
  unlinkedCount: number;
}

const ORDER_LANGUAGE_LABELS: Record<string, string> = {
  ko: '한국어',
  en: '영어',
  zh: '중국어',
  ja: '일본어',
  vi: '베트남어',
  mn: '몽골어',
};

// ── 차트 공통 스타일 (사장님 CRM 고객 통계·데이터 분석과 같은 톤) ──
// 순차 파랑 → 무채색 순서. 도넛·범례·막대가 같은 순서를 쓴다.
const RAMP = ['#2a2d62', '#6eadff', '#a5ccff', '#dcebff', '#91959a', '#d1d3d6'];
const rampColor = (idx: number) => RAMP[idx] ?? '#ebeced';
const MALE_COLOR = '#2a2d62';
const FEMALE_COLOR = '#a5ccff';
const TICK = { fill: '#91959a', fontSize: 11 };
const GRID = { vertical: false, stroke: 'rgba(29,32,34,0.06)', strokeDasharray: '2 4' } as const;
const BAR_CURSOR = { fill: 'rgba(110,173,255,0.08)' };
const LINE_CURSOR = { stroke: 'rgba(29,32,34,0.12)', strokeWidth: 1 };
const BAR_RADIUS: [number, number, number, number] = [6, 6, 2, 2];
const TOOLTIP_STYLE = {
  backgroundColor: 'white',
  border: 'none',
  borderRadius: '12px',
  padding: '8px 12px',
  fontSize: '12.5px',
  boxShadow: '0 0 0 1px rgba(29,32,34,0.06), 0 12px 24px -12px rgba(19,22,81,0.3)',
};

// ── 버튼·메뉴 공통 클래스 (무채색) ──
const SECONDARY_BTN =
  'ad-press inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] bg-white px-3.5 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]';
const FILTER_BTN =
  'ad-press inline-flex h-8 items-center gap-1 rounded-[10px] bg-white px-3 text-[12.5px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]';
const FILTER_BTN_ON = 'shadow-[inset_0_0_0_1px_var(--ad-ink)]';
const RANGE_ACCENT = 'bg-white border-[color:var(--ad-ink)] text-[color:var(--ad-ink)]';
const MENU =
  'absolute top-full mt-1 rounded-[12px] border border-[color:var(--ad-line)] bg-white py-1 shadow-[0_16px_40px_-16px_rgba(29,32,34,0.25)]';
const MENU_ITEM =
  'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] text-[color:var(--ad-ink-2)] transition-colors hover:bg-[color:var(--ad-bg-alt)]';
const MENU_ITEM_ON = 'font-medium text-[color:var(--ad-ink)]';
const DATE_INPUT =
  'h-10 w-full rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13.5px] text-[color:var(--ad-ink)] focus:border-[color:var(--ad-ink)] focus:outline-none';
const PAGE_BTN =
  'ad-press inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-[color:var(--ad-muted)] hover:bg-[color:var(--ad-bg)] disabled:cursor-not-allowed disabled:opacity-40';

// 카드 제목 (회색 선 아이콘 + 제목 + 설명)
function CardTitle({
  icon: Icon,
  title,
  desc,
  className,
}: {
  icon: LucideIcon;
  title: string;
  desc?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-5 flex min-w-0 items-start gap-2', className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
      <div className="min-w-0">
        <h3 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">{title}</h3>
        {desc && <p className="mt-0.5 text-[12px] text-[color:var(--ad-faint)]">{desc}</p>}
      </div>
    </div>
  );
}

// 얇은 링 도넛 (conic-gradient)
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

// 흰 카드 툴팁
function ChartTip({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; fill?: string; color?: string }[];
  label?: string;
  format: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const items = payload.filter((p) => p.value !== undefined && p.value !== null);
  if (items.length === 0) return null;
  return (
    <div className="rounded-[10px] bg-white/95 px-3 py-2 text-[12px] shadow-[0_0_0_1px_rgba(29,32,34,0.06),0_12px_24px_-12px_rgba(19,22,81,0.3)] backdrop-blur">
      <p className="mb-1 text-[color:var(--ad-muted)]">{label}</p>
      {items.map((p) => (
        <p key={p.name} className="ad-tnum flex items-center gap-1.5 font-medium text-[color:var(--ad-ink)]">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#6eadff' }} />
          {format(Number(p.value))}
        </p>
      ))}
    </div>
  );
}

interface TopStore {
  name: string;
  customers: number;
}

interface VisitSourceData {
  source: string;
  label: string;
  count: number;
  percentage: number;
}

interface MessageStat {
  count: number;
  amount: number;
  unitPrice: number;
}

interface Insights {
  ageDistribution: AgeDistribution[];
  genderDistribution: { male: number; female: number; total: number };
  retention: { day7: number; day30: number };
  monthlyTrend: MonthlyTrend[];
  topStores: TopStore[];
  visitSourceDistribution: VisitSourceData[];
  messageStats?: { earn: MessageStat; marketing: MessageStat };
  stampRewardCustomers?: number;
}

export default function FranchiseInsightsPage() {
  const [insights, setInsights] = useState<Insights>(DEMO_INSIGHTS);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('all');
  const [showPeriodDropdown, setShowPeriodDropdown] = useState(false);

  // 가맹점별 고객 현황 페이지네이션 (20개씩)
  const STORES_PER_PAGE = 20;
  const [storesPage, setStoresPage] = useState(1);

  // 날짜 범위 선택 관련 상태
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [tempStartDate, setTempStartDate] = useState('');
  const [tempEndDate, setTempEndDate] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateFilterMode, setDateFilterMode] = useState<'period' | 'range'>('period');
  const datePickerRef = useRef<HTMLDivElement>(null);

  // 일별 방문객 추이 (페이지 공통 기간 필터와 독립)
  const [dailyDays, setDailyDays] = useState<number>(30);
  const [dailyRange, setDailyRange] = useState<DateRange | null>(null);
  const [dailyStoreFilter, setDailyStoreFilter] = useState<string>('all');
  const [dailyChart, setDailyChart] = useState<
    { date: string; day: string; visitors: number; autoVisitors: number; overridden: boolean }[]
  >([]);
  const [storeOptions, setStoreOptions] = useState<{ id: string; name: string }[]>([]);
  const [isDailyLoading, setIsDailyLoading] = useState(false);
  const [storeDropdownOpen, setStoreDropdownOpen] = useState(false);
  const storeDropdownRef = useRef<HTMLDivElement>(null);

  // 주문 언어 분포 (태그히어 V2에서 조회, 가맹점별 조회 가능)
  const [langDays, setLangDays] = useState<number>(30);
  const [langRange, setLangRange] = useState<DateRange | null>(null);
  const [langStoreFilter, setLangStoreFilter] = useState<string>('all');
  const [langStats, setLangStats] = useState<OrderLanguageStats | null>(null);
  const [isLangLoading, setIsLangLoading] = useState(true);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const langDropdownRef = useRef<HTMLDivElement>(null);

  // 월별 고객 추이 (페이지 공통 기간 필터와 독립, 가맹점별 조회 가능)
  const [monthlyStoreFilter, setMonthlyStoreFilter] = useState<string>('all');
  const [monthlyTrend, setMonthlyTrend] = useState<MonthlyTrend[]>([]);
  const [isMonthlyLoading, setIsMonthlyLoading] = useState(false);
  const [monthlyDropdownOpen, setMonthlyDropdownOpen] = useState(false);
  const monthlyDropdownRef = useRef<HTMLDivElement>(null);

  const periodOptions = [
    { value: '7days', label: '최근 7일' },
    { value: '30days', label: '최근 30일' },
    { value: '90days', label: '최근 90일' },
    { value: 'all', label: '전체 기간' },
  ];

  // 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
        setShowDatePicker(false);
      }
      if (storeDropdownRef.current && !storeDropdownRef.current.contains(event.target as Node)) {
        setStoreDropdownOpen(false);
      }
      if (monthlyDropdownRef.current && !monthlyDropdownRef.current.contains(event.target as Node)) {
        setMonthlyDropdownOpen(false);
      }
      if (langDropdownRef.current && !langDropdownRef.current.contains(event.target as Node)) {
        setLangDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 고객 설문 결과 조회 범위 (상단 기간 필터 기준, KST 날짜)
  const surveyRange: Record<string, string> = (() => {
    if (dateFilterMode === 'range') {
      return { ...(startDate ? { startDate } : {}), ...(endDate ? { endDate } : {}) };
    }
    const days = selectedPeriod === '7days' ? 7 : selectedPeriod === '30days' ? 30 : selectedPeriod === '90days' ? 90 : 0;
    if (!days) return {};
    const from = new Date(Date.now() + 9 * 3600 * 1000 - (days - 1) * 86400000).toISOString().slice(0, 10);
    return { startDate: from };
  })();

  // 가맹점 목록 (일별 방문객 필터용)
  useEffect(() => {
    const fetchStores = async () => {
      try {
        const token = getFranchiseToken();
        if (!token) return;
        const res = await fetch(`${API_BASE}/api/franchise/stores`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setStoreOptions(data.stores || []);
        }
      } catch (err) {
        console.error('Failed to fetch stores:', err);
      }
    };
    fetchStores();
  }, []);

  // 일별 방문객 추이 조회
  useEffect(() => {
    let ignore = false; // 필터 빠른 전환 시 이전 조건의 늦은 응답이 최신 상태를 덮지 않도록
    const fetchDailyVisitors = async () => {
      setIsDailyLoading(true);
      try {
        const token = getFranchiseToken();
        if (!token) return;
        const params = new URLSearchParams({ days: String(dailyDays) });
        if (dailyRange) {
          params.set('startDate', dailyRange.from);
          params.set('endDate', dailyRange.to);
        }
        if (dailyStoreFilter !== 'all') params.append('storeId', dailyStoreFilter);
        const res = await fetch(`${API_BASE}/api/franchise/insights/daily-visitors?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (ignore) return;
        if (res.ok) {
          const data = await res.json();
          if (ignore) return;
          const chartData = (data.chartData || []).map(
            (item: { date: string; visitors: number; autoVisitors: number; overridden: boolean }) => ({
              ...item,
              // date는 KST 기준 'YYYY-MM-DD' 문자열 — TZ 비의존을 위해 문자열 슬라이스로 라벨 생성
              day: `${item.date.slice(5, 7)}/${item.date.slice(8, 10)}`,
            })
          );
          setDailyChart(chartData);
        } else {
          setDailyChart([]);
        }
      } catch (err) {
        if (!ignore) {
          console.error('Failed to fetch daily visitors:', err);
          setDailyChart([]);
        }
      } finally {
        if (!ignore) setIsDailyLoading(false);
      }
    };
    fetchDailyVisitors();
    return () => {
      ignore = true;
    };
  }, [dailyDays, dailyRange, dailyStoreFilter]);

  // 주문 언어 분포 조회
  useEffect(() => {
    let ignore = false;
    const fetchOrderLanguages = async () => {
      setIsLangLoading(true);
      try {
        const token = getFranchiseToken();
        if (!token) return;
        const params = new URLSearchParams({ days: String(langDays) });
        if (langRange) {
          params.set('startDate', langRange.from);
          params.set('endDate', langRange.to);
        }
        if (langStoreFilter !== 'all') params.append('storeId', langStoreFilter);
        const res = await fetch(`${API_BASE}/api/franchise/insights/order-languages?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (ignore) return;
        if (res.ok) {
          const data = await res.json();
          if (ignore) return;
          setLangStats(data);
        } else {
          setLangStats(null);
        }
      } catch (err) {
        if (!ignore) {
          console.error('Failed to fetch order languages:', err);
          setLangStats(null);
        }
      } finally {
        if (!ignore) setIsLangLoading(false);
      }
    };
    fetchOrderLanguages();
    return () => {
      ignore = true;
    };
  }, [langDays, langRange, langStoreFilter]);

  // 월별 고객 추이 조회
  useEffect(() => {
    let ignore = false; // 가맹점 빠른 전환 시 이전 조건의 늦은 응답이 최신 상태를 덮지 않도록
    const fetchMonthlyTrend = async () => {
      setIsMonthlyLoading(true);
      try {
        const token = getFranchiseToken();
        if (!token) return;
        const params = new URLSearchParams();
        if (monthlyStoreFilter !== 'all') params.append('storeId', monthlyStoreFilter);
        const res = await fetch(`${API_BASE}/api/franchise/insights/monthly-trend?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (ignore) return;
        if (res.ok) {
          const data = await res.json();
          if (ignore) return;
          setMonthlyTrend(data.monthlyTrend || []);
        } else {
          setMonthlyTrend([]);
        }
      } catch (err) {
        if (!ignore) {
          console.error('Failed to fetch monthly trend:', err);
          setMonthlyTrend([]);
        }
      } finally {
        if (!ignore) setIsMonthlyLoading(false);
      }
    };
    fetchMonthlyTrend();
    return () => {
      ignore = true;
    };
  }, [monthlyStoreFilter]);

  // Auth token helper
  // Fetch insights
  const fetchInsights = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = getFranchiseToken();
      const params = new URLSearchParams();

      if (dateFilterMode === 'range' && (startDate || endDate)) {
        if (startDate) params.append('startDate', startDate);
        if (endDate) params.append('endDate', endDate);
      } else {
        params.append('period', selectedPeriod);
      }

      const res = await fetch(`${API_BASE}/api/franchise/insights?${params.toString()}`, {
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
  }, [selectedPeriod, startDate, endDate, dateFilterMode]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  // 데이터(기간 등)가 바뀌면 가맹점 목록 페이지를 1로 초기화
  useEffect(() => {
    setStoresPage(1);
  }, [insights.topStores]);

  // 날짜 범위 적용
  const applyDateRange = () => {
    setStartDate(tempStartDate);
    setEndDate(tempEndDate);
    setDateFilterMode('range');
    setShowDatePicker(false);
  };

  // 날짜 범위 초기화 (기간 모드로 전환)
  const resetDateRange = () => {
    setTempStartDate('');
    setTempEndDate('');
    setStartDate('');
    setEndDate('');
    setDateFilterMode('period');
    setShowDatePicker(false);
  };

  // 날짜 포맷팅
  const formatDateRange = () => {
    if (dateFilterMode === 'period') {
      return periodOptions.find((p) => p.value === selectedPeriod)?.label || '최근 30일';
    }
    if (startDate && endDate) return `${startDate} ~ ${endDate}`;
    if (startDate) return `${startDate} ~`;
    if (endDate) return `~ ${endDate}`;
    return '전체 기간';
  };

  // 연령대 막대 (얇은 트랙, 최댓값만 진한 파랑)
  const renderBarChart = (data: AgeDistribution[]) => {
    if (!data || data.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <BarChart3 className="mb-3 h-8 w-8 text-[color:var(--ad-line-strong)]" strokeWidth={1.5} />
          <p className="text-[13px] text-[color:var(--ad-muted)]">연령대별 데이터가 없습니다</p>
          <p className="mt-1 text-[12px] text-[color:var(--ad-faint)]">
            고객 정보에 생년월일이 등록되면 자동으로 집계됩니다
          </p>
        </div>
      );
    }

    const maxCount = Math.max(...data.map((d) => d.count));
    return (
      <div className="space-y-3.5">
        {data.map((item) => (
          <div key={item.age} className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-3 text-[12.5px]">
            <span className="truncate text-[color:var(--ad-ink-2)]">{item.age}</span>
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

  // 성별 도넛
  const renderGenderPie = () => {
    const { male, female, total } = insights.genderDistribution;
    const malePercentage = Math.round((male / total) * 100);
    const femalePercentage = Math.round((female / total) * 100);

    return (
      <div className="flex items-center gap-8">
        <Donut
          gradient={`conic-gradient(${MALE_COLOR} 0% ${malePercentage}%, ${FEMALE_COLOR} ${malePercentage}% 100%)`}
          center={`${total.toLocaleString()}명`}
          sub="전체 고객"
        />
        <div className="min-w-0 flex-1 space-y-2.5">
          <LegendRow color={MALE_COLOR} label="남성" pct={`${malePercentage}%`} count={`${male.toLocaleString()}명`} />
          <LegendRow color={FEMALE_COLOR} label="여성" pct={`${femalePercentage}%`} count={`${female.toLocaleString()}명`} />
        </div>
      </div>
    );
  };

  // 월별 신규 고객 막대 (최댓값만 진한 파랑)
  const renderTrendChart = () => {
    if (isMonthlyLoading) {
      return (
        <div className="flex h-48 items-center justify-center">
          <RefreshCw className="h-5 w-5 animate-spin text-[color:var(--ad-faint)]" />
        </div>
      );
    }

    if (monthlyTrend.length === 0) {
      return (
        <div className="flex h-48 flex-col items-center justify-center text-center">
          <p className="text-[13px] text-[color:var(--ad-faint)]">월별 추이 데이터가 없습니다</p>
        </div>
      );
    }

    const maxCustomers = Math.max(...monthlyTrend.map((d) => d.customers), 1); // 최소값 1로 설정

    return (
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={monthlyTrend} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={TICK} dy={6} />
            <YAxis
              allowDecimals={false}
              axisLine={false}
              tickLine={false}
              tick={TICK}
              width={44}
              tickFormatter={(v: number) => v.toLocaleString()}
            />
            <Tooltip cursor={BAR_CURSOR} content={<ChartTip format={(v) => `신규 고객 ${v.toLocaleString()}명`} />} />
            <Bar dataKey="customers" name="신규 고객" radius={BAR_RADIUS} maxBarSize={40} fill="#a5ccff">
              {monthlyTrend.map((item) => (
                <Cell
                  key={item.month}
                  fill={item.customers > 0 && item.customers === maxCustomers ? '#6eadff' : '#a5ccff'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  };

  // 방문경로 막대 (얇은 트랙, 최댓값만 진한 파랑)
  const renderVisitSourceBarChart = (data: VisitSourceData[]) => {
    if (!data || data.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <BarChart3 className="mb-3 h-8 w-8 text-[color:var(--ad-line-strong)]" strokeWidth={1.5} />
          <p className="text-[13px] text-[color:var(--ad-muted)]">방문경로 데이터가 없습니다</p>
          <p className="mt-1 text-[12px] text-[color:var(--ad-faint)]">
            고객 등록 시 방문경로가 수집되면 자동으로 집계됩니다
          </p>
        </div>
      );
    }

    const maxCount = Math.max(...data.map((d) => d.count));
    return (
      <div className="space-y-3.5">
        {data.slice(0, 7).map((item, idx) => (
          <div key={item.source} className="grid grid-cols-[8px_88px_minmax(0,1fr)_auto] items-center gap-2.5 text-[12.5px]">
            <span className="h-2 w-2 rounded-full" style={{ background: rampColor(idx) }} />
            <span className="truncate text-[color:var(--ad-ink-2)]">{item.label}</span>
            <ThinBar
              pct={maxCount > 0 ? (item.count / maxCount) * 100 : 0}
              color={maxCount > 0 && item.count === maxCount ? '#6eadff' : '#a5ccff'}
            />
            <span className="ad-tnum min-w-[92px] text-right">
              <span className="font-medium text-[color:var(--ad-ink)]">{item.count.toLocaleString()}명</span>
              <span className="ml-1.5 text-[12px] text-[color:var(--ad-faint)]">{item.percentage}%</span>
            </span>
          </div>
        ))}
      </div>
    );
  };

  // 주문 언어 분포 렌더링 (언어가 기록된 주문만 분모)
  const renderOrderLanguageChart = () => {
    if (isLangLoading) {
      return (
        <div className="flex h-40 items-center justify-center">
          <RefreshCw className="h-5 w-5 animate-spin text-[color:var(--ad-faint)]" />
        </div>
      );
    }
    if (!langStats?.available) {
      return (
        <div className="flex h-40 items-center justify-center">
          <p className="text-[13px] text-[color:var(--ad-muted)]">일시적으로 데이터를 불러오지 못했습니다</p>
        </div>
      );
    }

    const breakdown = langStats.breakdown;
    if (!breakdown || breakdown.identifiedOrders === 0) {
      return (
        <div className="flex h-40 flex-col items-center justify-center text-center">
          <Globe className="mb-3 h-8 w-8 text-[color:var(--ad-line-strong)]" strokeWidth={1.5} />
          <p className="text-[13px] text-[color:var(--ad-muted)]">아직 집계된 주문 언어가 없습니다</p>
          {(langStats.excludedV1Count > 0 || langStats.unlinkedCount > 0) && (
            <p className="mt-2 text-[12px] text-[color:var(--ad-faint)]">
              {langStats.excludedV1Count > 0 && `언어 데이터가 없는 가맹점 ${langStats.excludedV1Count}곳`}
              {langStats.excludedV1Count > 0 && langStats.unlinkedCount > 0 && ', '}
              {langStats.unlinkedCount > 0 && `태그히어 연동 확인이 필요한 가맹점 ${langStats.unlinkedCount}곳`}
              은 집계에서 제외됩니다
            </p>
          )}
        </div>
      );
    }

    let cumulative = 0;
    const gradientParts = breakdown.languages.map((item, idx) => {
      const start = cumulative;
      cumulative += item.percentage;
      return `${rampColor(idx)} ${start}% ${cumulative}%`;
    });
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
          <p className="mt-0.5 text-[13px] text-[color:var(--ad-muted)]">
            {breakdown.identifiedOrders.toLocaleString()}건 중 {foreignCount.toLocaleString()}건
            {langStats.storeCount > 0 && ` · 가맹점 ${langStats.storeCount}곳`}
          </p>
        </div>
        <div className="flex items-center gap-8">
          <Donut
            gradient={`conic-gradient(${gradientParts.join(', ')})`}
            center={`${breakdown.identifiedOrders.toLocaleString()}건`}
            sub="언어 확인"
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
        {(breakdown.unknownCount > 0 || langStats.excludedV1Count > 0 || langStats.unlinkedCount > 0) && (
          <p className="mt-4 text-[12px] text-[color:var(--ad-faint)]">
            {[
              breakdown.unknownCount > 0 && `언어 미기록 ${breakdown.unknownCount.toLocaleString()}건 제외`,
              langStats.excludedV1Count > 0 && `언어 데이터 없는 가맹점 ${langStats.excludedV1Count}곳 제외`,
              langStats.unlinkedCount > 0 && `태그히어 연동 확인 필요 ${langStats.unlinkedCount}곳`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
      </div>
    );
  };

  // 방문경로 도넛
  const renderVisitSourcePieChart = (data: VisitSourceData[]) => {
    if (!data || data.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <PieChart className="mb-3 h-8 w-8 text-[color:var(--ad-line-strong)]" strokeWidth={1.5} />
          <p className="text-[13px] text-[color:var(--ad-muted)]">방문경로 데이터가 없습니다</p>
        </div>
      );
    }

    const total = data.reduce((sum, item) => sum + item.count, 0);

    // conic-gradient 생성
    let gradientParts: string[] = [];
    let currentPercent = 0;

    data.forEach((item, idx) => {
      const startPercent = currentPercent;
      const endPercent = currentPercent + item.percentage;
      const color = rampColor(idx);
      gradientParts.push(`${color} ${startPercent}% ${endPercent}%`);
      currentPercent = endPercent;
    });

    // 나머지 부분 채우기 (100%까지)
    if (currentPercent < 100) {
      gradientParts.push(`#ebeced ${currentPercent}% 100%`);
    }

    return (
      <div className="flex items-center gap-8">
        <Donut
          gradient={`conic-gradient(${gradientParts.join(', ')})`}
          center={`${total.toLocaleString()}명`}
          sub="총 응답"
        />
        <div className="min-w-0 flex-1 space-y-2.5">
          {data.slice(0, 5).map((item, idx) => (
            <LegendRow
              key={item.source}
              color={rampColor(idx)}
              label={item.label}
              pct={`${item.percentage}%`}
              count={`${item.count.toLocaleString()}명`}
            />
          ))}
          {data.length > 5 && (
            <p className="pl-[18px] text-[12px] text-[color:var(--ad-faint)]">외 {data.length - 5}개</p>
          )}
        </div>
      </div>
    );
  };

  // Loading skeleton
  const renderSkeleton = () => (
    <div className="space-y-4">
      <div className="ad-card h-28 animate-pulse" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="ad-card animate-pulse p-5">
            <div className="mb-4 h-5 w-1/3 rounded bg-[color:var(--ad-bg)]" />
            <div className="h-40 rounded bg-[color:var(--ad-bg-alt)]" />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-5 px-4 pb-16 pt-6 sm:px-8 lg:pt-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-[color:var(--ad-ink)]">인사이트</h1>
          <p className="mt-1 text-[13px] text-[color:var(--ad-muted)]">
            고객 및 캠페인 분석 데이터를 확인합니다
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period Selector (프리셋) */}
          <div className="relative">
            <button
              onClick={() => setShowPeriodDropdown(!showPeriodDropdown)}
              className={cn(
                SECONDARY_BTN,
                dateFilterMode === 'period' && 'shadow-[inset_0_0_0_1px_var(--ad-ink)]'
              )}
            >
              <Calendar className="h-3.5 w-3.5 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
              {dateFilterMode === 'period'
                ? periodOptions.find((p) => p.value === selectedPeriod)?.label
                : '기간 선택'}
              <ChevronDown className="h-3.5 w-3.5 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
            </button>
            {showPeriodDropdown && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowPeriodDropdown(false)} />
                <div className={cn(MENU, 'right-0 z-20 w-40')}>
                  {periodOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setSelectedPeriod(option.value);
                        setDateFilterMode('period');
                        setStartDate('');
                        setEndDate('');
                        setShowPeriodDropdown(false);
                      }}
                      className={cn(
                        MENU_ITEM,
                        dateFilterMode === 'period' && selectedPeriod === option.value && MENU_ITEM_ON
                      )}
                    >
                      {option.label}
                      {dateFilterMode === 'period' && selectedPeriod === option.value && (
                        <Check className="h-4 w-4 text-[color:var(--ad-ink)]" strokeWidth={1.8} />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Date Range Picker */}
          <div className="relative" ref={datePickerRef}>
            <button
              onClick={() => {
                setTempStartDate(startDate);
                setTempEndDate(endDate);
                setShowDatePicker(!showDatePicker);
              }}
              className={cn(
                SECONDARY_BTN,
                dateFilterMode === 'range' && 'shadow-[inset_0_0_0_1px_var(--ad-ink)]'
              )}
            >
              <Calendar className="h-3.5 w-3.5 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
              {dateFilterMode === 'range' ? formatDateRange() : '날짜 지정'}
            </button>

            {showDatePicker && (
              <div className="absolute right-0 top-full z-50 mt-2 min-w-[280px] rounded-[14px] border border-[color:var(--ad-line)] bg-white p-4 shadow-[0_16px_40px_-16px_rgba(29,32,34,0.25)]">
                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">시작일</label>
                    <input
                      type="date"
                      value={tempStartDate}
                      onChange={(e) => setTempStartDate(e.target.value)}
                      className={DATE_INPUT}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">종료일</label>
                    <input
                      type="date"
                      value={tempEndDate}
                      onChange={(e) => setTempEndDate(e.target.value)}
                      className={DATE_INPUT}
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button onClick={resetDateRange} className={cn(SECONDARY_BTN, 'flex-1')}>
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

          {/* Refresh Button */}
          <button
            onClick={fetchInsights}
            disabled={isLoading}
            aria-label="새로고침"
            className="ad-press inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-white text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] disabled:cursor-not-allowed disabled:bg-[color:var(--ad-bg)] disabled:text-[color:var(--ad-faint)]"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {isLoading ? (
        renderSkeleton()
      ) : (
        <>
          {/* Summary: 재방문율 */}
          <div className="ad-card grid grid-cols-1 md:grid-cols-2">
            <div className="p-5">
              <div className="mb-4 flex items-start gap-2">
                <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                <div>
                  <h3 className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">7일 재방문율</h3>
                  <p className="text-[12px] text-[color:var(--ad-muted)]">최근 7일 내 재방문한 고객 비율</p>
                </div>
              </div>
              <div className="ad-tnum text-[24px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">{insights.retention.day7}%</div>
            </div>
            <div className="border-t border-[color:var(--ad-line)] p-5 md:border-l md:border-t-0">
              <div className="mb-4 flex items-start gap-2">
                <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                <div>
                  <h3 className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">30일 재방문율</h3>
                  <p className="text-[12px] text-[color:var(--ad-muted)]">최근 30일 내 재방문한 고객 비율</p>
                </div>
              </div>
              <div className="ad-tnum text-[24px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">{insights.retention.day30}%</div>
            </div>
          </div>

          {/* 알림톡 발송 통계 + 스탬프 보상 수령 고객 */}
          <div>
            <div className="ad-card grid grid-cols-1 md:grid-cols-3">
              {/* 적립 알림톡 */}
              <div className="p-5">
                <div className="mb-4 flex items-start gap-2">
                  <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                  <h3 className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">적립 알림톡 발송</h3>
                </div>
                <div className="ad-tnum text-[24px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">
                  {(insights.messageStats?.earn.count ?? 0).toLocaleString()}
                  <span className="ml-0.5 text-[14px] text-[color:var(--ad-muted)]">건</span>
                </div>
                <p className="ad-tnum mt-1 text-[12.5px] text-[color:var(--ad-ink-2)]">
                  {(insights.messageStats?.earn.amount ?? 0).toLocaleString()}원
                  <span className="ml-1 text-[12px] text-[color:var(--ad-faint)]">
                    (건당 {(insights.messageStats?.earn.unitPrice ?? 0).toLocaleString()}원)
                  </span>
                </p>
              </div>

              {/* 마케팅 알림톡 */}
              <div className="border-t border-[color:var(--ad-line)] p-5 md:border-l md:border-t-0">
                <div className="mb-4 flex items-start gap-2">
                  <Send className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                  <h3 className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">마케팅 알림톡 발송</h3>
                </div>
                <div className="ad-tnum text-[24px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">
                  {(insights.messageStats?.marketing.count ?? 0).toLocaleString()}
                  <span className="ml-0.5 text-[14px] text-[color:var(--ad-muted)]">건</span>
                </div>
                <p className="ad-tnum mt-1 text-[12.5px] text-[color:var(--ad-ink-2)]">
                  {(insights.messageStats?.marketing.amount ?? 0).toLocaleString()}원
                  <span className="ml-1 text-[12px] text-[color:var(--ad-faint)]">
                    (건당 {(insights.messageStats?.marketing.unitPrice ?? 0).toLocaleString()}원)
                  </span>
                </p>
              </div>

              {/* 스탬프 보상 수령 고객 */}
              <div className="border-t border-[color:var(--ad-line)] p-5 md:border-l md:border-t-0">
                <div className="mb-4 flex items-start gap-2">
                  <Gift className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                  <h3 className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">스탬프 보상 수령 고객</h3>
                </div>
                <div className="ad-tnum text-[24px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">
                  {(insights.stampRewardCustomers ?? 0).toLocaleString()}
                  <span className="ml-0.5 text-[14px] text-[color:var(--ad-muted)]">명</span>
                </div>
                <p className="mt-1 text-[12px] text-[color:var(--ad-muted)]">전 가맹점 · 기간 내 보상 받은 고객 수</p>
              </div>
            </div>
            <p className="mt-2 text-[12px] text-[color:var(--ad-faint)]">
              * 알림톡 금액은 현재 단가 기준 추정치이며 무료 발송분은 포함하지 않습니다.
            </p>
          </div>

          {/* Charts Row 1 */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Age Distribution */}
            <div className="ad-card p-5">
              <CardTitle icon={BarChart3} title="연령대별 고객 분포" desc="전체 고객의 연령대별 분포를 보여줍니다" />
              {renderBarChart(insights.ageDistribution)}
            </div>

            {/* Gender Distribution */}
            <div className="ad-card p-5">
              <CardTitle icon={PieChart} title="성별 분포" desc="전체 고객의 성별 비율을 보여줍니다" />
              {renderGenderPie()}
            </div>
          </div>

          {/* Visit Source Charts */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Visit Source Pie Chart */}
            <div className="ad-card p-5">
              <CardTitle icon={Compass} title="방문경로 분포" desc="고객이 매장을 알게 된 경로입니다" />
              {renderVisitSourcePieChart(insights.visitSourceDistribution)}
            </div>

            {/* Visit Source Bar Chart */}
            <div className="ad-card p-5">
              <CardTitle icon={BarChart3} title="방문경로별 고객 수" desc="방문경로별 고객 수를 비교합니다" />
              {renderVisitSourceBarChart(insights.visitSourceDistribution)}
            </div>
          </div>

          {/* Daily Visitors - Full Width */}
          <div className="ad-card p-5">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <CardTitle
                icon={Users}
                title="일별 방문객 추이"
                desc={
                  dailyStoreFilter === 'all'
                    ? '전체 가맹점 합산 일별 방문객 수입니다 (가맹점이 직접 입력한 값 반영)'
                    : '선택한 가맹점의 일별 방문객 수입니다 (가맹점이 직접 입력한 값 반영)'
                }
                className="mb-0"
              />
              <div className="flex flex-wrap items-center gap-2">
                {/* Store Filter */}
                <div className="relative" ref={storeDropdownRef}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setStoreDropdownOpen(!storeDropdownOpen);
                    }}
                    className={cn(FILTER_BTN, dailyStoreFilter !== 'all' && FILTER_BTN_ON)}
                  >
                    <Building2 className="h-3.5 w-3.5 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                    {dailyStoreFilter === 'all'
                      ? '전체 가맹점'
                      : storeOptions.find((s) => s.id === dailyStoreFilter)?.name || '가맹점'}
                    <ChevronDown className="h-3.5 w-3.5 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                  </button>
                  {storeDropdownOpen && (
                    <div
                      className={cn(MENU, 'right-0 z-50 max-h-[300px] min-w-[180px] overflow-y-auto')}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className={cn(MENU_ITEM, dailyStoreFilter === 'all' && MENU_ITEM_ON)}
                        onClick={() => {
                          setDailyStoreFilter('all');
                          setStoreDropdownOpen(false);
                        }}
                      >
                        전체 가맹점
                        {dailyStoreFilter === 'all' && <Check className="h-4 w-4 text-[color:var(--ad-ink)]" strokeWidth={1.8} />}
                      </button>
                      {storeOptions.map((store) => (
                        <button
                          key={store.id}
                          className={cn(MENU_ITEM, dailyStoreFilter === store.id && MENU_ITEM_ON)}
                          onClick={() => {
                            setDailyStoreFilter(store.id);
                            setStoreDropdownOpen(false);
                          }}
                        >
                          {store.name}
                          {dailyStoreFilter === store.id && <Check className="h-4 w-4 text-[color:var(--ad-ink)]" strokeWidth={1.8} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* 기간: 프리셋 + 직접 선택 */}
                <DateRangeFilter
                  days={dailyDays}
                  onDaysChange={setDailyDays}
                  range={dailyRange}
                  onRangeChange={setDailyRange}
                  accentClass={RANGE_ACCENT}
                />
                <button
                  onClick={() =>
                    exportDailyVisitors(
                      dailyChart,
                      periodLabel(dailyRange, dailyDays),
                      dailyStoreFilter === 'all'
                        ? '전체가맹점'
                        : storeOptions.find((s) => s.id === dailyStoreFilter)?.name || '가맹점'
                    )
                  }
                  disabled={dailyChart.length === 0}
                  className={cn(FILTER_BTN, 'disabled:opacity-40 disabled:hover:bg-white')}
                >
                  <Download className="h-3.5 w-3.5 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                  엑셀
                </button>
              </div>
            </div>
            {isDailyLoading ? (
              <div className="flex h-64 items-center justify-center">
                <RefreshCw className="h-5 w-5 animate-spin text-[color:var(--ad-faint)]" />
              </div>
            ) : dailyChart.length === 0 ? (
              <div className="flex h-64 items-center justify-center">
                <p className="text-[13px] text-[color:var(--ad-faint)]">일별 방문객 데이터가 없습니다</p>
              </div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyChart} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="colorDailyVisitors" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6eadff" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#6eadff" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...GRID} />
                    <XAxis
                      dataKey="day"
                      axisLine={false}
                      tickLine={false}
                      minTickGap={24}
                      dy={6}
                      tick={TICK}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      width={48}
                      tick={TICK}
                      tickFormatter={(value) => value.toLocaleString()}
                    />
                    <Tooltip
                      cursor={LINE_CURSOR}
                      contentStyle={TOOLTIP_STYLE}
                      labelStyle={{ color: '#55595e', fontSize: '11.5px' }}
                      itemStyle={{ color: '#1d2022', fontWeight: 600 }}
                      formatter={(value: number, _name, item) => [
                        value.toLocaleString(),
                        item?.payload?.overridden ? '방문객 수 (직접입력 포함)' : '방문객 수',
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="visitors"
                      stroke="#6eadff"
                      strokeWidth={2}
                      fill="url(#colorDailyVisitors)"
                      activeDot={{ r: 4, fill: '#fff', stroke: '#2a2d62', strokeWidth: 2 }}
                      dot={(props: { cx?: number; cy?: number; payload?: { overridden?: boolean }; index?: number }) =>
                        props.payload?.overridden && props.cx !== undefined && props.cy !== undefined ? (
                          <circle key={props.index} cx={props.cx} cy={props.cy} r={3.5} fill="#2a2d62" />
                        ) : (
                          <g key={props.index} />
                        )
                      }
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Order Languages - Full Width */}
          <div className="ad-card p-5">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <CardTitle
                icon={Globe}
                title="주문 언어 분포"
                desc="고객이 메뉴판에서 선택한 언어 기준입니다 (한국어 외 = 외국어 주문)"
                className="mb-0"
              />
              <div className="flex flex-wrap items-center gap-2">
                {/* Store Filter */}
                <div className="relative" ref={langDropdownRef}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setLangDropdownOpen(!langDropdownOpen);
                    }}
                    className={cn(FILTER_BTN, langStoreFilter !== 'all' && FILTER_BTN_ON)}
                  >
                    <Building2 className="h-3.5 w-3.5 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                    {langStoreFilter === 'all'
                      ? '전체 가맹점'
                      : storeOptions.find((s) => s.id === langStoreFilter)?.name || '가맹점'}
                    <ChevronDown className="h-3.5 w-3.5 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                  </button>
                  {langDropdownOpen && (
                    <div
                      className={cn(MENU, 'right-0 z-50 max-h-[300px] min-w-[180px] overflow-y-auto')}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className={cn(MENU_ITEM, langStoreFilter === 'all' && MENU_ITEM_ON)}
                        onClick={() => {
                          setLangStoreFilter('all');
                          setLangDropdownOpen(false);
                        }}
                      >
                        전체 가맹점
                        {langStoreFilter === 'all' && <Check className="h-4 w-4 text-[color:var(--ad-ink)]" strokeWidth={1.8} />}
                      </button>
                      {storeOptions.map((store) => (
                        <button
                          key={store.id}
                          className={cn(MENU_ITEM, langStoreFilter === store.id && MENU_ITEM_ON)}
                          onClick={() => {
                            setLangStoreFilter(store.id);
                            setLangDropdownOpen(false);
                          }}
                        >
                          {store.name}
                          {langStoreFilter === store.id && <Check className="h-4 w-4 text-[color:var(--ad-ink)]" strokeWidth={1.8} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {/* 기간: 프리셋 + 직접 선택 */}
                <DateRangeFilter
                  days={langDays}
                  onDaysChange={setLangDays}
                  range={langRange}
                  onRangeChange={setLangRange}
                  accentClass={RANGE_ACCENT}
                />
                <button
                  onClick={() => {
                    if (!langStats?.breakdown) return;
                    exportOrderLanguages(
                      langStats.breakdown.languages,
                      (code) => ORDER_LANGUAGE_LABELS[code] || code,
                      langStats.breakdown,
                      periodLabel(langRange, langDays),
                      langStoreFilter === 'all'
                        ? '전체가맹점'
                        : storeOptions.find((s) => s.id === langStoreFilter)?.name || '가맹점'
                    );
                  }}
                  disabled={!langStats?.breakdown || langStats.breakdown.languages.length === 0}
                  className={cn(FILTER_BTN, 'disabled:opacity-40 disabled:hover:bg-white')}
                >
                  <Download className="h-3.5 w-3.5 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                  엑셀
                </button>
              </div>
            </div>
            {renderOrderLanguageChart()}
          </div>

          {/* Monthly Trend - Full Width */}
          <div className="ad-card p-5">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <CardTitle
                icon={TrendingUp}
                title="월별 고객 추이"
                desc={
                  monthlyStoreFilter === 'all'
                    ? '전체 가맹점 합산 최근 6개월간 신규 고객 수 변화입니다'
                    : '선택한 가맹점의 최근 6개월간 신규 고객 수 변화입니다'
                }
                className="mb-0"
              />
              {/* Store Filter */}
              <div className="relative" ref={monthlyDropdownRef}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMonthlyDropdownOpen(!monthlyDropdownOpen);
                  }}
                  className={cn(FILTER_BTN, monthlyStoreFilter !== 'all' && FILTER_BTN_ON)}
                >
                  <Building2 className="h-3.5 w-3.5 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                  {monthlyStoreFilter === 'all'
                    ? '전체 가맹점'
                    : storeOptions.find((s) => s.id === monthlyStoreFilter)?.name || '가맹점'}
                  <ChevronDown className="h-3.5 w-3.5 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                </button>
                {monthlyDropdownOpen && (
                  <div
                    className={cn(MENU, 'right-0 z-50 max-h-[300px] min-w-[180px] overflow-y-auto')}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      className={cn(MENU_ITEM, monthlyStoreFilter === 'all' && MENU_ITEM_ON)}
                      onClick={() => {
                        setMonthlyStoreFilter('all');
                        setMonthlyDropdownOpen(false);
                      }}
                    >
                      전체 가맹점
                      {monthlyStoreFilter === 'all' && <Check className="h-4 w-4 text-[color:var(--ad-ink)]" strokeWidth={1.8} />}
                    </button>
                    {storeOptions.map((store) => (
                      <button
                        key={store.id}
                        className={cn(MENU_ITEM, monthlyStoreFilter === store.id && MENU_ITEM_ON)}
                        onClick={() => {
                          setMonthlyStoreFilter(store.id);
                          setMonthlyDropdownOpen(false);
                        }}
                      >
                        {store.name}
                        {monthlyStoreFilter === store.id && <Check className="h-4 w-4 text-[color:var(--ad-ink)]" strokeWidth={1.8} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {renderTrendChart()}
            <div className="mt-4 grid grid-cols-3 border-t border-[color:var(--ad-line)] pt-4">
              {monthlyTrend.slice(-3).map((item, i) => (
                <div
                  key={item.month}
                  className={cn('text-center', i > 0 && 'border-l border-[color:var(--ad-line)]')}
                >
                  <p className="text-[12px] text-[color:var(--ad-muted)]">{item.month}</p>
                  <p className="ad-tnum mt-0.5 text-[15px] font-medium text-[color:var(--ad-ink)]">{item.customers.toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Top Stores */}
          <div className="ad-card overflow-hidden">
            <div className="p-5 pb-4">
              <CardTitle
                icon={Users}
                title="가맹점별 고객 현황"
                desc={`전체 ${insights.topStores.length.toLocaleString()}개 가맹점을 고객 수 순으로 보여줍니다`}
                className="mb-0"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-y border-[color:var(--ad-line)] bg-[color:var(--ad-bg-alt)] text-left text-[11.5px] text-[color:var(--ad-muted)]">
                    <th className="px-5 py-2.5 font-medium">가맹점명</th>
                    <th className="px-5 py-2.5 text-right font-medium">고객 수</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--ad-line)] text-[13px]">
                  {insights.topStores
                    .slice((storesPage - 1) * STORES_PER_PAGE, storesPage * STORES_PER_PAGE)
                    .map((store, i) => {
                      const rank = (storesPage - 1) * STORES_PER_PAGE + i;
                      return (
                        <tr key={`${store.name}-${rank}`} className="transition-colors hover:bg-[rgba(110,173,255,0.05)]">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <span className={cn(
                                'ad-tnum flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11.5px]',
                                rank < 3
                                  ? 'bg-[color:var(--ad-bg)] font-semibold text-[color:var(--ad-ink)]'
                                  : 'font-medium text-[color:var(--ad-faint)]'
                              )}>
                                {rank + 1}
                              </span>
                              <span className="font-medium text-[color:var(--ad-ink)]">{store.name}</span>
                            </div>
                          </td>
                          <td className="ad-tnum px-5 py-3 text-right font-medium text-[color:var(--ad-ink)]">
                            {store.customers.toLocaleString()}명
                          </td>
                        </tr>
                      );
                    })}
                  {insights.topStores.length === 0 && (
                    <tr>
                      <td colSpan={2} className="px-5 py-10 text-center text-[13px] text-[color:var(--ad-faint)]">
                        표시할 가맹점이 없습니다
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* 페이지네이션 */}
            {insights.topStores.length > STORES_PER_PAGE && (() => {
              const totalPages = Math.ceil(insights.topStores.length / STORES_PER_PAGE);
              const rangeStart = (storesPage - 1) * STORES_PER_PAGE + 1;
              const rangeEnd = Math.min(storesPage * STORES_PER_PAGE, insights.topStores.length);
              return (
                <div className="flex items-center justify-between border-t border-[color:var(--ad-line)] px-5 py-3">
                  <p className="ad-tnum text-[12px] text-[color:var(--ad-muted)]">
                    {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} / {insights.topStores.length.toLocaleString()}개
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setStoresPage((p) => Math.max(1, p - 1))}
                      disabled={storesPage === 1}
                      className={PAGE_BTN}
                      aria-label="이전 페이지"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="ad-tnum px-3 text-[13px] font-medium text-[color:var(--ad-ink-2)]">
                      {storesPage} / {totalPages}
                    </span>
                    <button
                      onClick={() => setStoresPage((p) => Math.min(totalPages, p + 1))}
                      disabled={storesPage === totalPages}
                      className={PAGE_BTN}
                      aria-label="다음 페이지"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* 고객 설문 결과 지표 — 페이지 상단 기간 필터와 같은 기간 (가맹점별 질문·답변) */}
          <div className="mt-6">
            <SurveyResults
              url={`${API_BASE}/api/franchise/insights/survey-results?${new URLSearchParams(surveyRange).toString()}`}
              tokenKey="franchiseToken"
              showStore
              fileLabel={surveyRange.startDate || surveyRange.endDate ? `${surveyRange.startDate || '처음'}_${surveyRange.endDate || '오늘'}` : '전체기간'}
            />
          </div>
        </>
      )}
    </div>
  );
}
