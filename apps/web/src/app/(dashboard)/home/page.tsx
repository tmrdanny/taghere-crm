'use client';

import { API_BASE } from '@/lib/api-config';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Modal, ModalContent } from '@/components/ui/modal';
import { formatNumber } from '@/lib/utils';
import { CountUp, Empty, Skel, rise } from '@/features/admin-ui';
import { Ring } from './_components/Ring';
import { fetchJsonCached, readCache, writeCache, cacheKeyFor, invalidateCacheByUrlPart } from '@/lib/swr-cache';
import { Users, TrendingUp, TrendingDown, Wallet, AlertTriangle, RefreshCw, Megaphone, Star, MessageSquare, MapPin, Zap, Cake, UserPlus, UserMinus, ArrowRight, ChevronRight, Pencil, X, Download } from 'lucide-react';
import DateRangeFilter, { type DateRange } from '@/components/DateRangeFilter';
import { exportDailyVisitors, periodLabel } from '@/lib/insights-export';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';

interface DashboardStats {
  totalCustomers: number;
  customerGrowth: number;
  newCustomers: number;
  newCustomersGrowth: number;
  reviewBalance: number;
  monthlyReviews: number;
  reviewGrowth: number;
}

interface VisitorChartData {
  date: string;
  visitors: number; // 최종값 (직접입력 반영)
  autoVisitors: number;
  manualVisitors: number | null; // 직접입력값 (없으면 null)
}

interface VisitorStats {
  chartData: VisitorChartData[];
  countingMode?: 'auto' | 'customer_size' | 'mixed'; // customer_size = 태그히어 인원 수 입력 매장 (주문 인원 기준)
  todayVisitors: number;
  yesterdayVisitors: number;
  growth: number;
}

interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: number;
  createdAt: string;
}

interface FeedbackItem {
  id: string;
  rating: number;
  text: string | null;
  createdAt: string;
  customerName: string | null;
}

interface FeedbackSummary {
  averageRating: number;
  totalFeedbackCount: number;
  lowRatingCount: number;
  feedbacks: FeedbackItem[];
}

interface VisitSourceItem {
  source: string;
  label: string;
  count: number;
}

type PeriodKey = '7일' | '30일' | '90일' | '전체';

export default function HomePage() {
  const router = useRouter();
  const [storeName, setStoreName] = useState('');
  const [chartPeriod, setChartPeriod] = useState<PeriodKey>('7일');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [visitorChartData, setVisitorChartData] = useState<
    { date: string; day: string; visitors: number; autoVisitors: number; overridden: boolean }[]
  >([]);
  const [visitorRange, setVisitorRange] = useState<DateRange | null>(null);
  const [visitorStats, setVisitorStats] = useState<VisitorStats | null>(null);
  const [isRefreshingChart, setIsRefreshingChart] = useState(false);
  const [isRefreshingStats, setIsRefreshingStats] = useState(false);
  const [showVisitorEdit, setShowVisitorEdit] = useState(false);
  const [draftOverrides, setDraftOverrides] = useState<Record<string, string>>({});
  const [savingDate, setSavingDate] = useState<string | null>(null);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [feedbackSummary, setFeedbackSummary] = useState<FeedbackSummary | null>(null);
  const [isRefreshingFeedback, setIsRefreshingFeedback] = useState(false);
  const [showPromoPopup, setShowPromoPopup] = useState(false);
  const [visitSourceData, setVisitSourceData] = useState<VisitSourceItem[]>([]);
  const [retargetCredits, setRetargetCredits] = useState<{ remainingCredits: number; totalCredits: number } | null>(null);
  const [automationStatus, setAutomationStatus] = useState<{
    hasActiveRules: boolean;
    previews: Record<string, { totalEligible: number; thisMonthEstimate: number }> | null;
    dashboard: { totalSent: number; totalCouponUsed: number; usageRate: number; estimatedRevenue: number } | null;
  } | null>(null);


  // Show promo popup on first visit
  useEffect(() => {
    const dismissed = localStorage.getItem('promo-popup-dismissed');
    if (!dismissed) {
      setShowPromoPopup(true);
    }
  }, []);

  // 상호명 표시 (DashboardLayout이 /api/auth/me 조회 후 저장한 캐시 재사용)
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem('auth-me-cache');
      if (cached) {
        const { user } = JSON.parse(cached);
        if (user?.store?.name) setStoreName(user.store.name);
      }
    } catch {
      // 캐시 파싱 실패 시 무시
    }
  }, []);

  const handleClosePromoPopup = () => {
    setShowPromoPopup(false);
    localStorage.setItem('promo-popup-dismissed', 'true');
  };

  const handleGoToMessages = () => {
    setShowPromoPopup(false);
    localStorage.setItem('promo-popup-dismissed', 'true');
    router.push('/messages');
  };

  // Fetch announcements
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    fetchJsonCached<Announcement[]>(`${API_BASE}/api/dashboard/announcements`, token, setAnnouncements)
      .catch((error) => console.error('Failed to fetch announcements:', error));
  }, []);

  // Fetch dashboard stats
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    fetchJsonCached<DashboardStats>(`${API_BASE}/api/dashboard/summary`, token, setStats)
      .catch((error) => console.error('Failed to fetch dashboard stats:', error));
  }, []);

  // Fetch feedback summary
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    fetchJsonCached<FeedbackSummary>(`${API_BASE}/api/dashboard/feedback-summary`, token, setFeedbackSummary)
      .catch((error) => console.error('Failed to fetch feedback summary:', error));
  }, []);

  // Fetch visit source stats
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    fetchJsonCached<{ distribution?: VisitSourceItem[] }>(
      `${API_BASE}/api/visit-source-settings/stats`,
      token,
      (data) => setVisitSourceData(data.distribution || [])
    ).catch((error) => console.error('Failed to fetch visit source stats:', error));
  }, []);

  // Fetch retarget credits
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    fetchJsonCached<{ success: boolean; data?: { remainingCredits: number; totalCredits: number } }>(
      `${API_BASE}/api/monthly-credit/status`,
      token,
      (data) => {
        if (data.success && data.data) {
          setRetargetCredits({
            remainingCredits: data.data.remainingCredits,
            totalCredits: data.data.totalCredits,
          });
        }
      }
    ).catch((error) => console.error('Failed to fetch retarget credits:', error));
  }, []);

  // Fetch automation marketing status
  useEffect(() => {
    const fetchAutomationStatus = async () => {
      const token = localStorage.getItem('token');
      if (!token) return;
      const cacheKey = `${token.slice(-12)}:automation-status`;

      // 캐시된 결과를 즉시 표시
      const cached = readCache<typeof automationStatus>(cacheKey);
      if (cached) setAutomationStatus(cached);

      try {
        const headers = { Authorization: `Bearer ${token}` };

        const [rulesRes, previewRes, dashRes] = await Promise.all([
          fetch(`${API_BASE}/api/automation/rules`, { headers }),
          fetch(`${API_BASE}/api/automation/preview-all`, { headers }),
          fetch(`${API_BASE}/api/automation/dashboard`, { headers }),
        ]);

        let hasActiveRules = false;
        let previews = null;
        let dashboard = null;

        if (rulesRes.ok) {
          const data = await rulesRes.json();
          hasActiveRules = data.rules?.some((r: { enabled: boolean }) => r.enabled) ?? false;
        }
        if (previewRes.ok) {
          const data = await previewRes.json();
          previews = data.previews;
        }
        if (dashRes.ok) {
          dashboard = await dashRes.json();
        }

        const result = { hasActiveRules, previews, dashboard };
        setAutomationStatus(result);
        writeCache(cacheKey, result);
      } catch (error) {
        console.error('Failed to fetch automation status:', error);
      }
    };

    fetchAutomationStatus();
  }, []);

  // Refresh feedback summary
  const handleRefreshFeedback = async () => {
    setIsRefreshingFeedback(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/dashboard/feedback-summary`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setFeedbackSummary(data);
      }
    } catch (error) {
      console.error('Failed to refresh feedback summary:', error);
    } finally {
      setIsRefreshingFeedback(false);
    }
  };

  // Apply visitor chart response to state
  const applyVisitorData = (data: VisitorStats) => {
    setVisitorStats(data);
    const formattedData = data.chartData.map((item: VisitorChartData) => ({
      date: item.date,
      // date는 KST 기준 'YYYY-MM-DD' 문자열 — TZ 비의존을 위해 문자열 슬라이스로 라벨 생성
      day: `${item.date.slice(5, 7)}/${item.date.slice(8, 10)}`,
      visitors: item.visitors,
      autoVisitors: item.autoVisitors,
      overridden: item.manualVisitors !== null,
    }));
    setVisitorChartData(formattedData);
  };

  const visitorChartDays = chartPeriod === '7일' ? 7 : chartPeriod === '30일' ? 30 : chartPeriod === '90일' ? 90 : 365;
  // 직접 선택한 범위가 있으면 days 대신 startDate/endDate 로 조회한다
  const visitorChartUrl = `${API_BASE}/api/dashboard/visitor-chart?days=${visitorChartDays}${
    visitorRange ? `&startDate=${visitorRange.from}&endDate=${visitorRange.to}` : ''
  }`;

  // Fetch visitor chart data based on period
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    fetchJsonCached<VisitorStats>(visitorChartUrl, token, applyVisitorData).catch((error) =>
      console.error('Failed to fetch visitor chart data:', error)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartPeriod, visitorRange]);

  // Refetch visitor chart data (bypass cache) and refresh the stored cache entry
  const refetchVisitorChart = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const url = visitorChartUrl;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      applyVisitorData(data);
      writeCache(cacheKeyFor(token, url), data);
    }
  };

  // Refresh visitor chart data
  const handleRefreshVisitorChart = async () => {
    setIsRefreshingChart(true);
    setIsRefreshingStats(true);
    try {
      await refetchVisitorChart();
    } catch (error) {
      console.error('Failed to refresh visitor chart:', error);
    } finally {
      setIsRefreshingChart(false);
      setIsRefreshingStats(false);
    }
  };

  // 일별 방문객 직접입력 저장 (해당 날짜 최종값 덮어쓰기)
  const handleSaveOverride = async (date: string) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const visitors = Number((draftOverrides[date] ?? '').trim());
    if (!Number.isInteger(visitors) || visitors < 0) {
      setOverrideError('방문객 수는 0 이상의 정수여야 합니다.');
      return;
    }
    setSavingDate(date);
    setOverrideError(null);
    try {
      const res = await fetch(`${API_BASE}/api/dashboard/visitor-overrides/${date}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ visitors }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setOverrideError(err?.error || '방문객 수 저장에 실패했습니다.');
        return;
      }
      invalidateCacheByUrlPart('/api/dashboard/visitor-chart');
      await refetchVisitorChart();
      setDraftOverrides((prev) => {
        const next = { ...prev };
        delete next[date];
        return next;
      });
    } catch (error) {
      console.error('Failed to save visitor override:', error);
      setOverrideError('방문객 수 저장에 실패했습니다.');
    } finally {
      setSavingDate(null);
    }
  };

  // 직접입력 삭제 (자동 집계값으로 복귀)
  const handleDeleteOverride = async (date: string) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    setSavingDate(date);
    setOverrideError(null);
    try {
      const res = await fetch(`${API_BASE}/api/dashboard/visitor-overrides/${date}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setOverrideError(err?.error || '방문객 수 삭제에 실패했습니다.');
        return;
      }
      invalidateCacheByUrlPart('/api/dashboard/visitor-chart');
      await refetchVisitorChart();
      setDraftOverrides((prev) => {
        const next = { ...prev };
        delete next[date];
        return next;
      });
    } catch (error) {
      console.error('Failed to delete visitor override:', error);
      setOverrideError('방문객 수 삭제에 실패했습니다.');
    } finally {
      setSavingDate(null);
    }
  };

  // StarDisplay component for showing ratings
  const StarDisplay = ({ rating, size = 'md' }: { rating: number; size?: 'sm' | 'md' | 'lg' }) => {
    const sizeClasses = {
      sm: 'w-3 h-3',
      md: 'w-4 h-4',
      lg: 'w-[18px] h-[18px]',
    };

    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => {
          const filled = star <= Math.floor(rating);
          const partial = !filled && star === Math.ceil(rating) && rating % 1 > 0;
          const partialWidth = partial ? `${(rating % 1) * 100}%` : '0%';

          return (
            <div key={star} className="relative">
              <Star className={`${sizeClasses[size]} text-[#e4e6e8]`} fill="#e4e6e8" strokeWidth={0} />
              {(filled || partial) && (
                <div className="absolute inset-0 overflow-hidden" style={{ width: filled ? '100%' : partialWidth }}>
                  <Star className={`${sizeClasses[size]} text-[#ffc21a]`} fill="#ffc21a" strokeWidth={0} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // 방문 경로 색상 (v2 팔레트)
  const visitSourceColors = ['#6eadff', '#a5ccff', '#a5ccff', '#a5ccff', '#a5ccff', '#a5ccff'];

  // 방문 경로: 비율(%) + 고객 수를 한 줄 가로 막대로
  const renderVisitSourceBars = () => {
    // none 제외
    const filteredData = visitSourceData.filter((item) => item.source !== 'none');
    if (filteredData.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-[color:var(--ad-bg)]">
            <MapPin className="h-4 w-4 text-[color:var(--ad-faint)]" />
          </span>
          <p className="text-[13px] font-medium text-[color:var(--ad-ink-2)]">아직 모인 응답이 없어요</p>
          <p className="text-[12px] text-[color:var(--ad-faint)]">적립 시 방문 경로 응답이 쌓이면 여기에 정리돼요</p>
        </div>
      );
    }

    const totalCount = filteredData.reduce((sum, item) => sum + item.count, 0);
    const maxCount = Math.max(...filteredData.map((d) => d.count));

    return (
      <ul className="mt-5 grid gap-x-12 gap-y-3.5 lg:grid-cols-2">
        {filteredData.slice(0, 6).map((item, idx) => {
          const pct = totalCount > 0 ? Math.round((item.count / totalCount) * 100) : 0;
          const color = visitSourceColors[idx % visitSourceColors.length];
          return (
            <li key={item.source} className="grid grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-3">
              <span className="flex min-w-0 items-center gap-2 text-[13px] text-[color:var(--ad-ink-2)]">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                <span className="truncate">{item.label}</span>
              </span>
              <div className="h-2 overflow-hidden rounded-full bg-[rgba(29,32,34,0.05)]">
                <div
                  className="ad-grow-x h-full rounded-full"
                  style={{ ...rise(idx), backgroundColor: color, width: maxCount > 0 ? `${(item.count / maxCount) * 100}%` : '0%' }}
                />
              </div>
              <span className="ad-tnum whitespace-nowrap text-right text-[12.5px]">
                <span className="font-semibold text-[color:var(--ad-ink)]">{pct}%</span>
                <span className="ml-1.5 text-[color:var(--ad-faint)]">{formatNumber(item.count)}명</span>
              </span>
            </li>
          );
        })}
      </ul>
    );
  };

  // Helper function to render growth indicator
  const renderGrowthIndicator = (growth: number, prefix: string, suffix: string = '%') => {
    if (growth >= 0) {
      return (
        <p className="mt-2 flex items-center gap-1 text-[12.5px] text-[color:var(--ad-muted)]">
          <span className="inline-flex items-center gap-0.5 font-semibold text-[color:var(--ad-pos)]">
            <TrendingUp className="h-3.5 w-3.5" />+{growth}{suffix}
          </span>
          {prefix}
        </p>
      );
    } else {
      return (
        <p className="mt-2 flex items-center gap-1 text-[12.5px] text-[color:var(--ad-muted)]">
          <span className="inline-flex items-center gap-0.5 font-semibold text-[color:var(--ad-neg)]">
            <TrendingDown className="h-3.5 w-3.5" />{growth}{suffix}
          </span>
          {prefix}
        </p>
      );
    }
  };

  const todayLabel = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' });
  const automationTargets = [
    {
      key: 'CHURN_PREVENTION',
      label: '이탈 위험 고객',
      detail: '30일 이상 미방문',
      icon: UserMinus,
      tone: 'text-[color:var(--ad-faint)]',
      count: automationStatus?.previews?.CHURN_PREVENTION?.thisMonthEstimate ?? 0,
    },
    {
      key: 'BIRTHDAY',
      label: '이번 달 생일',
      detail: '축하 쿠폰 자동 발송',
      icon: Cake,
      tone: 'text-[color:var(--ad-faint)]',
      count: automationStatus?.previews?.BIRTHDAY?.thisMonthEstimate ?? 0,
    },
    {
      key: 'FIRST_VISIT_FOLLOWUP',
      label: '첫 방문 고객',
      detail: '재방문 쿠폰 자동 발송',
      icon: UserPlus,
      tone: 'text-[color:var(--ad-faint)]',
      count: automationStatus?.previews?.FIRST_VISIT_FOLLOWUP?.thisMonthEstimate ?? 0,
    },
  ];
  const automationTotal = automationTargets.reduce((sum, t) => sum + t.count, 0);
  const iconBtn =
    'ad-press grid h-8 w-8 place-items-center rounded-[10px] text-[color:var(--ad-muted)] hover:bg-[color:var(--ad-bg-alt)] hover:text-[color:var(--ad-ink)] disabled:opacity-50';
  const ghostBtn =
    'ad-press inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-white px-3 text-[12.5px] font-medium text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] disabled:opacity-40 disabled:hover:bg-white';

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 sm:px-8 lg:pt-8">
      {/* 헤더: 오늘 날짜 + 가맹점 상호명 */}
      <header className="ad-rise" style={rise(0)}>
        <p className="text-[12.5px] font-medium text-[color:var(--ad-muted)]" suppressHydrationWarning>
          {todayLabel}
        </p>
        {storeName && (
          <h1 className="mt-0.5 text-[22px] font-semibold tracking-[-0.4px] text-[color:var(--ad-ink)]">{storeName}</h1>
        )}
      </header>

      {/* Announcements */}
      {announcements.length > 0 && (
        <div className="ad-rise mt-4 flex flex-col gap-2" style={rise(1)}>
          {announcements.map((announcement) => (
            <div
              key={announcement.id}
              className="flex items-start gap-2.5 rounded-[14px] bg-white px-3.5 py-2.5 shadow-[inset_0_0_0_1px_var(--ad-line)]"
            >
              <span className="mt-px grid h-4 w-4 shrink-0 place-items-center text-[color:var(--ad-faint)]">
                <Megaphone className="h-3 w-3 text-[color:var(--ad-muted)]" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="inline-flex rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">
                    공지
                  </span>
                  <span className="text-[13px] font-semibold text-[color:var(--ad-ink)]">{announcement.title}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-[19px] text-[color:var(--ad-muted)]">
                  {announcement.content}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 space-y-4">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Total Customers */}
          <section className="ad-card ad-rise p-5" style={rise(2)}>
            <p className="flex items-center gap-2 text-[12.5px] font-medium text-[color:var(--ad-muted)]">
              <span className="grid h-4 w-4 place-items-center text-[color:var(--ad-faint)]">
                <Users className="h-3 w-3 text-[color:var(--ad-link)]" />
              </span>
              총 고객 수
            </p>
            {stats ? (
              <>
                <p className="mt-2 text-[24px] font-medium leading-none tracking-[-0.03em] text-[color:var(--ad-ink)]">
                  <CountUp value={stats.totalCustomers ?? 0} />
                  <span className="ml-0.5 text-[14px] font-medium text-[color:var(--ad-muted)]">명</span>
                </p>
                {renderGrowthIndicator(stats.customerGrowth ?? 0, '지난달 대비')}
              </>
            ) : (
              <>
                <Skel className="mt-2 h-[26px] w-28" />
                <Skel className="mt-3 h-3.5 w-24" />
              </>
            )}
          </section>

          {/* Retarget Message Credits */}
          <section
            className="ad-card ad-lift ad-rise flex cursor-pointer items-center gap-4 p-5"
            style={rise(3)}
            onClick={() => router.push('/messages')}
          >
            <div className="relative shrink-0">
              <Ring value={retargetCredits?.remainingCredits ?? 0} total={retargetCredits?.totalCredits ?? 30} />
              <span className="ad-tnum absolute inset-0 grid place-items-center text-[16px] font-semibold text-[color:var(--ad-ink)]">
                {formatNumber(retargetCredits?.remainingCredits ?? 0)}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-medium text-[color:var(--ad-muted)]">[무료 지원] 리타겟 메시지 잔여</p>
              <p className="mt-1 text-[14px] font-medium text-[color:var(--ad-ink)]">
                이번 달 <span className="ad-tnum">{retargetCredits?.totalCredits ?? 30}</span>건 중{' '}
                <span className="ad-tnum">{formatNumber(retargetCredits?.remainingCredits ?? 0)}</span>건 남았어요
              </p>
              <span className="mt-1.5 inline-flex items-center gap-0.5 text-[12.5px] font-medium text-[color:var(--ad-link)]">
                지금 보내기
                <ChevronRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </section>

          {/* Review Balance */}
          <section
            className="ad-card ad-lift ad-rise cursor-pointer p-5 md:col-span-2 lg:col-span-1"
            style={rise(4)}
            onClick={() => router.push('/billing')}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="flex items-center gap-2 text-[12.5px] font-medium text-[color:var(--ad-muted)]">
                <span className="grid h-4 w-4 place-items-center text-[color:var(--ad-faint)]">
                  <Wallet className="h-3 w-3 text-[color:var(--ad-muted)]" />
                </span>
                알림톡 발송 가능액
              </p>
              {(stats?.reviewBalance ?? 0) < 1000 && stats && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">
                  <AlertTriangle className="h-3 w-3" />
                  잔액 부족
                </span>
              )}
            </div>
            {stats ? (
              <p className="mt-2 text-[24px] font-medium leading-none tracking-[-0.03em] text-[color:var(--ad-ink)]">
                <CountUp value={stats.reviewBalance ?? 0} />
                <span className="ml-0.5 text-[14px] font-medium text-[color:var(--ad-muted)]">원</span>
              </p>
            ) : (
              <Skel className="mt-2 h-[26px] w-32" />
            )}
            <p
              className={`mt-2 flex items-center gap-1 text-[12.5px] ${
                stats && (stats.reviewBalance ?? 0) < 1000
                  ? 'font-medium text-[color:var(--ad-neg)]'
                  : 'text-[color:var(--ad-muted)]'
              }`}
            >
              충전이 필요하면 클릭하세요
              <ChevronRight className="h-3.5 w-3.5" />
            </p>
          </section>
        </div>

        {/* Automation Marketing CTA — 목적: 자동 마케팅을 켜게 하기. 결과 한 문장 + 단 하나의 주요 버튼, 대상 구성은 보조 정보로 */}
        {automationStatus && !automationStatus.hasActiveRules && (
          <section
            className="ad-card ad-rise cursor-pointer p-6 sm:p-7"
            style={rise(5)}
            onClick={() => router.push('/automation')}
          >
            <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--ad-bg)] px-2.5 py-1 text-[12px] font-medium text-[color:var(--ad-muted)]">
                  <Zap className="h-3 w-3" strokeWidth={2} />
                  자동 마케팅 꺼짐
                </span>
                <h2 className="mt-3 text-[22px] font-semibold leading-[31px] tracking-[-0.03em] text-[color:var(--ad-ink)]">
                  이번 달{' '}
                  <span className="ad-tnum">
                    <CountUp value={automationTotal} />명
                  </span>
                  에게 쿠폰을 자동으로 보낼 수 있어요
                </h2>
                <p className="mt-1.5 text-[13.5px] leading-[21px] text-[color:var(--ad-muted)]">
                  한 번 켜 두면 아래 고객에게 알아서 발송돼요. 월 30건까지 무료예요.
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                <span className="ad-press inline-flex h-11 items-center gap-1.5 rounded-[12px] bg-[color:var(--ad-ink)] px-5 text-[14px] font-semibold text-white hover:bg-[#383c40]">
                  자동 마케팅 켜기
                  <ArrowRight className="h-4 w-4" />
                </span>
                <span className="text-[12px] text-[color:var(--ad-faint)]">태그히어 평균 쿠폰 사용률 38%</span>
              </div>
            </div>

            {/* 대상 구성 — 비율 막대 + 범례 (선 대신 여백으로 묶음) */}
            <div className="mt-7">
              <div className="flex h-1.5 gap-[3px] overflow-hidden rounded-full bg-[color:var(--ad-bg)]">
                {automationTotal > 0 &&
                  automationTargets.map((t, k) =>
                    t.count > 0 ? (
                      <span
                        key={t.key}
                        className="ad-grow-x h-full rounded-full"
                        style={{ ...rise(k), width: `${(t.count / automationTotal) * 100}%`, background: ['#1d2022', '#91959a', '#d1d3d6'][k] }}
                      />
                    ) : null
                  )}
              </div>
              <ul className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-3">
                {automationTargets.map((t, k) => {
                  const Icon = t.icon;
                  return (
                    <li key={t.key} className="flex items-start gap-2.5">
                      <span className="mt-[7px] h-2 w-2 shrink-0 rounded-full" style={{ background: ['#1d2022', '#91959a', '#d1d3d6'][k] }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="flex items-center gap-1.5 text-[13.5px] text-[color:var(--ad-ink-2)]">
                            <Icon className="h-3.5 w-3.5 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                            {t.label}
                          </p>
                          <p className="ad-tnum text-[17px] font-semibold tracking-[-0.02em] text-[color:var(--ad-ink)]">
                            <CountUp value={t.count} />
                            <span className="ml-0.5 text-[12.5px] font-medium text-[color:var(--ad-muted)]">명</span>
                          </p>
                        </div>
                        <p className="mt-0.5 text-[12px] text-[color:var(--ad-faint)]">{t.detail}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        )}

        {/* Automation Active Banner (State C) */}
        {automationStatus && automationStatus.hasActiveRules && automationStatus.dashboard && automationStatus.dashboard.totalSent > 0 && (
          <section
            className="ad-card ad-lift ad-rise flex cursor-pointer flex-wrap items-center justify-between gap-4 p-5"
            style={rise(5)}
            onClick={() => router.push('/automation')}
          >
            <div className="flex items-center gap-3">
              <span className="grid h-4 w-4 place-items-center text-[color:var(--ad-pos)]">
                <Zap className="h-4 w-4 text-[color:var(--ad-pos)]" />
              </span>
              <div>
                <p className="flex items-center gap-2 text-[14px] font-semibold text-[color:var(--ad-ink)]">
                  이번 달 자동 마케팅
                  <span className="inline-flex rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">
                    켜짐
                  </span>
                </p>
                <p className="mt-0.5 text-[12.5px] text-[color:var(--ad-muted)]">자동으로 나간 쿠폰과 사용 현황이에요</p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div>
                <p className="text-[12px] text-[color:var(--ad-muted)]">발송</p>
                <p className="ad-tnum text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">
                  {automationStatus.dashboard.totalSent}
                  <span className="ml-0.5 text-[13px] font-medium text-[color:var(--ad-muted)]">건</span>
                </p>
              </div>
              {automationStatus.dashboard.totalCouponUsed > 0 && (
                <div className="border-l border-[color:var(--ad-line)] pl-6">
                  <p className="text-[12px] text-[color:var(--ad-muted)]">쿠폰 사용</p>
                  <p className="ad-tnum text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-pos)]">
                    {automationStatus.dashboard.totalCouponUsed}
                    <span className="ml-0.5 text-[13px] font-medium">건 ({Math.round(automationStatus.dashboard.usageRate)}%)</span>
                  </p>
                </div>
              )}
              <span className="inline-flex items-center gap-0.5 text-[12.5px] font-medium text-[color:var(--ad-link)]">
                성과 보기
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </section>
        )}

        {/* Charts Row */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
          {/* Visitor Chart */}
          <section className="ad-card ad-rise flex min-w-0 flex-col p-5" style={rise(6)}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <span className="mr-0.5 grid h-4 w-4 place-items-center text-[color:var(--ad-faint)]">
                  <TrendingUp className="h-3.5 w-3.5 text-[color:var(--ad-link)]" />
                </span>
                <h2 className="text-[14px] font-semibold tracking-[-0.015em] text-[color:var(--ad-ink)]">일자별 방문자 수 추이</h2>
                <button
                  onClick={handleRefreshVisitorChart}
                  disabled={isRefreshingChart}
                  className={iconBtn}
                  title="새로고침"
                  aria-label="새로고침"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isRefreshingChart ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div role="tablist" aria-label="기간" className="flex items-center rounded-[10px] bg-[rgba(29,32,34,0.045)] p-[3px]">
                  {(['7일', '30일', '90일', '전체'] as PeriodKey[]).map((period) => (
                    <button
                      key={period}
                      role="tab"
                      aria-selected={chartPeriod === period}
                      onClick={() => setChartPeriod(period)}
                      className={`ad-press whitespace-nowrap rounded-[8px] px-2.5 py-1 text-[12.5px] font-medium transition-colors ${
                        chartPeriod === period
                          ? 'bg-white text-[color:var(--ad-ink)] shadow-[0_1px_2px_rgba(29,32,34,0.08),0_0_0_1px_rgba(29,32,34,0.04)]'
                          : 'text-[color:var(--ad-muted)] hover:text-[color:var(--ad-ink-2)]'
                      }`}
                    >
                      {period}
                    </button>
                  ))}
                </div>
                <DateRangeFilter
                  days={visitorChartDays}
                  onDaysChange={() => {}}
                  dayOptions={[]}
                  range={visitorRange}
                  onRangeChange={setVisitorRange}
                />
                <button
                  onClick={() => {
                    setOverrideError(null);
                    setShowVisitorEdit(true);
                  }}
                  className={ghostBtn}
                  title="방문객 수 직접 수정"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  방문객 수정
                </button>
                <button
                  onClick={() =>
                    exportDailyVisitors(
                      visitorChartData,
                      periodLabel(visitorRange, visitorChartDays),
                      '내매장'
                    )
                  }
                  disabled={visitorChartData.length === 0}
                  className={ghostBtn}
                >
                  <Download className="h-3.5 w-3.5" />
                  엑셀
                </button>
              </div>
            </div>

            <div className="mt-5 h-[272px]">
              {visitorStats === null ? (
                <Skel className="h-full w-full !rounded-[14px]" />
              ) : visitorChartData.length === 0 ? (
                <Empty className="h-full flex-col gap-1">
                  <span className="font-medium text-[color:var(--ad-ink-2)]">아직 쌓인 방문 기록이 없어요</span>
                  <span className="text-[12px]">포인트 적립이나 주문이 들어오면 날짜별로 그려져요</span>
                </Empty>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={visitorChartData} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="colorVisitors" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6eadff" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#6eadff" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#ebeced" strokeDasharray="2 4" />
                    <XAxis
                      dataKey="day"
                      axisLine={false}
                      tickLine={false}
                      minTickGap={24}
                      dy={6}
                      tick={{ fill: '#91959a', fontSize: 11.5 }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      width={48}
                      tick={{ fill: '#91959a', fontSize: 11.5 }}
                      tickFormatter={(value) => formatNumber(value)}
                    />
                    <Tooltip
                      cursor={{ stroke: 'rgba(29,32,34,0.12)', strokeWidth: 1 }}
                      contentStyle={{
                        backgroundColor: 'white',
                        border: 'none',
                        borderRadius: '12px',
                        padding: '8px 12px',
                        fontSize: '12.5px',
                        boxShadow: '0 0 0 1px rgba(29,32,34,0.06), 0 12px 24px -12px rgba(19,22,81,0.3)',
                      }}
                      labelStyle={{ color: '#55595e', fontSize: '11.5px' }}
                      itemStyle={{ color: '#1d2022', fontWeight: 600 }}
                      formatter={(value: number, _name, item) => [
                        formatNumber(value),
                        item?.payload?.overridden ? '방문자 수 (직접입력)' : '방문자 수',
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="visitors"
                      stroke="#6eadff"
                      strokeWidth={2}
                      fill="url(#colorVisitors)"
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
              )}
            </div>
            <div className="mt-3 flex items-center justify-center gap-4 text-[12px] text-[color:var(--ad-muted)]">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[color:var(--ad-blue)]" />
                일자별 방문자 수
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[color:var(--ad-link)]" />
                직접 입력한 날
              </span>
            </div>
          </section>

          {/* Customer Feedback */}
          <section
            className="ad-card ad-lift ad-rise flex cursor-pointer flex-col p-5"
            style={rise(7)}
            onClick={() => router.push('/feedback')}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="grid h-4 w-4 place-items-center text-[color:var(--ad-faint)]">
                  <Star className="h-3.5 w-3.5 text-[color:var(--ad-muted)]" fill="currentColor" />
                </span>
                <h2 className="text-[14px] font-semibold tracking-[-0.015em] text-[color:var(--ad-ink)]">고객 피드백</h2>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRefreshFeedback();
                }}
                disabled={isRefreshingFeedback}
                className={iconBtn}
                title="새로고침"
                aria-label="새로고침"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshingFeedback ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Average Rating */}
            {feedbackSummary ? (
              <div className="mt-4 flex items-end gap-3">
                <p className="ad-tnum text-[24px] font-medium leading-none tracking-[-0.03em] text-[color:var(--ad-ink)]">
                  {feedbackSummary?.averageRating?.toFixed(1) ?? '0.0'}
                </p>
                <div className="flex flex-col gap-0.5 pb-0.5">
                  <StarDisplay rating={feedbackSummary?.averageRating ?? 0} size="md" />
                  <span className="ad-tnum text-[12px] text-[color:var(--ad-muted)]">
                    총 {formatNumber(feedbackSummary?.totalFeedbackCount ?? 0)}개 피드백
                  </span>
                </div>
              </div>
            ) : (
              <Skel className="mt-4 h-8 w-40" />
            )}

            {/* Low Rating Warning */}
            {(feedbackSummary?.lowRatingCount ?? 0) > 0 && (
              <p className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full bg-[color:var(--ad-bg)] px-2.5 py-1 text-[12px] font-medium text-[color:var(--ad-muted)]">
                <AlertTriangle className="h-3.5 w-3.5" />
                개선 필요 피드백 {feedbackSummary?.lowRatingCount}개
              </p>
            )}

            {/* Feedback List */}
            <div className="mt-4 flex-1 divide-y divide-[color:var(--ad-line)] border-t border-[color:var(--ad-line)]">
              {feedbackSummary === null ? (
                [0, 1, 2].map((k) => (
                  <div key={k} className="py-3.5">
                    <Skel className="h-3 w-24" />
                    <Skel className="mt-2 h-3.5 w-full" />
                  </div>
                ))
              ) : feedbackSummary?.feedbacks && feedbackSummary.feedbacks.length > 0 ? (
                feedbackSummary.feedbacks.map((feedback) => (
                  <div key={feedback.id} className="py-3">
                    <div className="flex items-center gap-2">
                      <StarDisplay rating={feedback.rating} size="sm" />
                      <span className="text-[12px] font-medium text-[color:var(--ad-ink-2)]">
                        {feedback.customerName || '익명'}
                      </span>
                      {feedback.rating < 3 && (
                        <span className="inline-flex rounded-full bg-[color:var(--ad-bg)] px-1.5 py-px text-[10.5px] font-medium text-[color:var(--ad-muted)]">
                          확인 필요
                        </span>
                      )}
                      <span className="ad-tnum ml-auto text-[11.5px] text-[color:var(--ad-faint)]">
                        {new Date(feedback.createdAt).toLocaleDateString('ko-KR')}
                      </span>
                    </div>
                    {feedback.text && (
                      <p
                        className={`mt-1.5 line-clamp-2 text-[13px] leading-[19px] ${
                          feedback.rating < 3 ? 'text-[color:var(--ad-neg)]' : 'text-[color:var(--ad-ink-2)]'
                        }`}
                      >
                        {feedback.text}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-[color:var(--ad-bg)]">
                    <MessageSquare className="h-4 w-4 text-[color:var(--ad-faint)]" />
                  </span>
                  <p className="text-[13px] text-[color:var(--ad-muted)]">아직 피드백이 없습니다</p>
                </div>
              )}
            </div>

            {/* Info */}
            <p className="mt-3 rounded-[10px] bg-[color:var(--ad-bg-alt)] px-3 py-2 text-[11.5px] text-[color:var(--ad-muted)]">
              고객이 포인트 적립 시 남긴 피드백이 표시됩니다.
            </p>
          </section>
        </div>

        {/* Visit Source */}
        <section className="ad-card ad-rise p-5" style={rise(8)}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="grid h-4 w-4 place-items-center text-[color:var(--ad-faint)]">
                <MapPin className="h-3.5 w-3.5 text-[color:var(--ad-pos)]" />
              </span>
              <div>
                <h2 className="text-[14px] font-semibold tracking-[-0.015em] text-[color:var(--ad-ink)]">방문 경로</h2>
                <p className="text-[12px] text-[color:var(--ad-faint)]">
                  고객이 어떻게 알고 왔는지 · 비율과 고객 수
                </p>
              </div>
            </div>
            <button
              onClick={() => router.push('/insights/customers')}
              className="ad-press inline-flex items-center gap-0.5 text-[12.5px] font-medium text-[color:var(--ad-link)] hover:underline"
            >
              고객 통계
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="cursor-pointer" onClick={() => router.push('/insights/customers')}>
            {renderVisitSourceBars()}
          </div>
        </section>
      </div>

      {/* Promo Popup */}
      <Modal open={showPromoPopup} onOpenChange={(open) => !open && handleClosePromoPopup()}>
        <ModalContent className="max-w-[760px] overflow-hidden rounded-[20px] p-0 shadow-[0_24px_60px_-20px_rgba(19,22,81,0.4)]">
          <div className="flex flex-col md:flex-row">
            {/* Left: Phone mockup image */}
            <div className="flex w-full items-center justify-center bg-[color:var(--ad-bg-alt)] p-6 md:w-1/2 md:p-8">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/sms-mockup.png"
                alt="SMS 메시지 미리보기"
                className="max-h-[280px] object-contain drop-shadow-[0_16px_28px_rgba(19,22,81,0.18)] md:max-h-[380px]"
              />
            </div>

            {/* Right: Text content */}
            <div className="flex w-full flex-col justify-center p-6 md:w-1/2 md:p-8">
              <span className="inline-flex w-fit rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--ad-muted)]">
                매월 무료
              </span>
              <h2 className="mt-3 text-[20px] font-bold leading-[28px] tracking-[-0.03em] text-[color:var(--ad-ink)]">
                매월 고객 30명에게 무료로 문자 메시지를 보낼 수 있어요
              </h2>
              <p className="mb-6 mt-2 text-[13.5px] leading-[21px] text-[color:var(--ad-muted)]">
                태그히어 리타겟 마케팅을 통해 매월 30명에게 무료로 발송해 보세요!
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleGoToMessages}
                  className="ad-press inline-flex h-11 w-full items-center justify-center rounded-[10px] bg-[color:var(--ad-navy)] px-4 text-[14px] font-semibold text-white hover:bg-[#2a2d62]"
                >
                  30명에게 무료로 메시지 보내기
                </button>
                <button
                  onClick={handleClosePromoPopup}
                  className="ad-press h-10 w-full rounded-[10px] text-[13px] font-medium text-[color:var(--ad-muted)] hover:bg-[color:var(--ad-bg-alt)] hover:text-[color:var(--ad-ink-2)]"
                >
                  다음에 할게요
                </button>
              </div>
            </div>
          </div>
        </ModalContent>
      </Modal>

      {/* Visitor Override Edit Modal */}
      <Modal open={showVisitorEdit} onOpenChange={setShowVisitorEdit}>
        <ModalContent className="max-w-[480px] rounded-[20px] shadow-[0_24px_60px_-20px_rgba(19,22,81,0.4)]">
          <div className="mb-4">
            <h2 className="text-[17px] font-bold text-[color:var(--ad-ink)]">방문객 수 직접 수정</h2>
            <p className="mt-1 text-[13px] leading-[20px] text-[color:var(--ad-muted)]">
              {visitorStats?.countingMode === 'customer_size'
                ? '주문 시 입력된 인원 수를 기준으로 집계됩니다. 직접 입력한 날짜는 입력값이 최종 방문객 수로 표시됩니다.'
                : '태그히어로 집계되지 않은 손님까지 포함한 총 방문객 수를 입력하세요. 입력한 날짜는 입력값이 최종 방문객 수로 표시됩니다.'}
            </p>
          </div>
          {overrideError && (
            <div className="mb-3 rounded-[10px] bg-[#ffe3e9] px-3 py-2 text-[13px] text-[color:var(--ad-neg)]">
              {overrideError}
            </div>
          )}
          <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-3 gap-y-0.5 text-[13px]">
            <div className="border-b border-[color:var(--ad-line)] py-2 text-[11.5px] font-medium text-[color:var(--ad-muted)]">날짜</div>
            <div className="border-b border-[color:var(--ad-line)] py-2 text-right text-[11.5px] font-medium text-[color:var(--ad-muted)]">
              {visitorStats?.countingMode === 'customer_size' ? '주문 인원' : '자동 집계'}
            </div>
            <div className="border-b border-[color:var(--ad-line)] py-2 text-center text-[11.5px] font-medium text-[color:var(--ad-muted)]">직접 입력</div>
            <div className="self-stretch border-b border-[color:var(--ad-line)]" />
            {visitorStats &&
              [...visitorStats.chartData].reverse().map((item) => {
                const draft = draftOverrides[item.date];
                const currentValue = draft ?? (item.manualVisitors !== null ? String(item.manualVisitors) : '');
                const original = item.manualVisitors !== null ? String(item.manualVisitors) : '';
                const isChanged = draft !== undefined && draft.trim() !== '' && draft !== original;
                const dateObj = new Date(`${item.date}T00:00:00`);
                const weekday = ['일', '월', '화', '수', '목', '금', '토'][dateObj.getDay()];
                return (
                  <div key={item.date} className="contents">
                    <div className="py-1.5 text-[color:var(--ad-ink-2)]">
                      {item.date.slice(5).replace('-', '/')} ({weekday})
                    </div>
                    <div className="ad-tnum py-1.5 text-right text-[color:var(--ad-faint)]">
                      {formatNumber(item.autoVisitors)}
                    </div>
                    <div className="py-1.5">
                      <input
                        type="number"
                        min={0}
                        value={currentValue}
                        placeholder={String(item.autoVisitors)}
                        onChange={(e) =>
                          setDraftOverrides((prev) => ({ ...prev, [item.date]: e.target.value }))
                        }
                        className="ad-tnum h-8 w-20 rounded-[8px] border border-[color:var(--ad-line-strong)] bg-white px-2 text-right text-[13px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                    </div>
                    <div className="flex min-w-[52px] items-center gap-1 py-1.5">
                      {isChanged && (
                        <button
                          onClick={() => handleSaveOverride(item.date)}
                          disabled={savingDate !== null}
                          className="ad-press h-7 rounded-[8px] bg-[color:var(--ad-navy)] px-2.5 text-[12px] font-semibold text-white hover:bg-[#2a2d62] disabled:opacity-50"
                        >
                          저장
                        </button>
                      )}
                      {!isChanged && item.manualVisitors !== null && (
                        <button
                          onClick={() => handleDeleteOverride(item.date)}
                          disabled={savingDate !== null}
                          className="ad-press grid h-7 w-7 place-items-center rounded-[8px] text-[color:var(--ad-faint)] hover:bg-[color:var(--ad-bg-alt)] hover:text-[color:var(--ad-neg)] disabled:opacity-50"
                          title={
                            visitorStats?.countingMode === 'customer_size'
                              ? '직접입력 삭제 (주문 인원으로 복귀)'
                              : '직접입력 삭제 (자동 집계로 복귀)'
                          }
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </ModalContent>
      </Modal>
    </div>
  );
}
