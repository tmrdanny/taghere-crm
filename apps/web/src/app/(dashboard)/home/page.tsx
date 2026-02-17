'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Modal, ModalContent } from '@/components/ui/modal';
import { formatNumber, formatCurrency } from '@/lib/utils';
import { Users, TrendingUp, TrendingDown, Wallet, AlertTriangle, RefreshCw, Megaphone, Star, MessageSquare, MapPin, Mail, Zap, Bell, Cake, UserPlus, ArrowRight } from 'lucide-react';
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
  visitors: number;
}

interface VisitorStats {
  chartData: VisitorChartData[];
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
  const [chartPeriod, setChartPeriod] = useState<PeriodKey>('7일');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [visitorChartData, setVisitorChartData] = useState<{ day: string; visitors: number }[]>([]);
  const [visitorStats, setVisitorStats] = useState<VisitorStats | null>(null);
  const [isRefreshingChart, setIsRefreshingChart] = useState(false);
  const [isRefreshingStats, setIsRefreshingStats] = useState(false);
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

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  // Show promo popup on first visit
  useEffect(() => {
    const dismissed = localStorage.getItem('promo-popup-dismissed');
    if (!dismissed) {
      setShowPromoPopup(true);
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
    const fetchAnnouncements = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${apiUrl}/api/dashboard/announcements`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          setAnnouncements(data);
        }
      } catch (error) {
        console.error('Failed to fetch announcements:', error);
      }
    };

    fetchAnnouncements();
  }, [apiUrl]);

  // Fetch dashboard stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${apiUrl}/api/dashboard/summary`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard stats:', error);
      }
    };

    fetchStats();
  }, [apiUrl]);

  // Fetch feedback summary
  useEffect(() => {
    const fetchFeedbackSummary = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${apiUrl}/api/dashboard/feedback-summary`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          setFeedbackSummary(data);
        }
      } catch (error) {
        console.error('Failed to fetch feedback summary:', error);
      }
    };

    fetchFeedbackSummary();
  }, [apiUrl]);

  // Fetch visit source stats
  useEffect(() => {
    const fetchVisitSourceStats = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${apiUrl}/api/visit-source-settings/stats`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          setVisitSourceData(data.distribution || []);
        }
      } catch (error) {
        console.error('Failed to fetch visit source stats:', error);
      }
    };

    fetchVisitSourceStats();
  }, [apiUrl]);

  // Fetch retarget credits
  useEffect(() => {
    const fetchRetargetCredits = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${apiUrl}/api/monthly-credit/status`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success && data.data) {
            setRetargetCredits({
              remainingCredits: data.data.remainingCredits,
              totalCredits: data.data.totalCredits,
            });
          }
        }
      } catch (error) {
        console.error('Failed to fetch retarget credits:', error);
      }
    };

    fetchRetargetCredits();
  }, [apiUrl]);

  // Fetch automation marketing status
  useEffect(() => {
    const fetchAutomationStatus = async () => {
      try {
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };

        const [rulesRes, previewRes, dashRes] = await Promise.all([
          fetch(`${apiUrl}/api/automation/rules`, { headers }),
          fetch(`${apiUrl}/api/automation/preview-all`, { headers }),
          fetch(`${apiUrl}/api/automation/dashboard`, { headers }),
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

        setAutomationStatus({ hasActiveRules, previews, dashboard });
      } catch (error) {
        console.error('Failed to fetch automation status:', error);
      }
    };

    fetchAutomationStatus();
  }, [apiUrl]);

  // Refresh feedback summary
  const handleRefreshFeedback = async () => {
    setIsRefreshingFeedback(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${apiUrl}/api/dashboard/feedback-summary`, {
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

  // Fetch visitor chart data based on period
  useEffect(() => {
    const fetchVisitorChartData = async () => {
      try {
        const token = localStorage.getItem('token');
        const days = chartPeriod === '7일' ? 7 : chartPeriod === '30일' ? 30 : chartPeriod === '90일' ? 90 : 365;

        // Fetch visitor chart data
        const res = await fetch(`${apiUrl}/api/dashboard/visitor-chart?days=${days}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          setVisitorStats(data);
          // Format the chart data
          const formattedData = data.chartData.map((item: VisitorChartData) => {
            const date = new Date(item.date);
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return {
              day: `${month}/${day}`,
              visitors: item.visitors,
            };
          });
          setVisitorChartData(formattedData);
        }
      } catch (error) {
        console.error('Failed to fetch visitor chart data:', error);
      }
    };

    fetchVisitorChartData();
  }, [apiUrl, chartPeriod]);

  // Refresh visitor chart data
  const handleRefreshVisitorChart = async () => {
    setIsRefreshingChart(true);
    setIsRefreshingStats(true);
    try {
      const token = localStorage.getItem('token');
      const days = chartPeriod === '7일' ? 7 : chartPeriod === '30일' ? 30 : chartPeriod === '90일' ? 90 : 365;

      // Refetch visitor chart data
      const res = await fetch(`${apiUrl}/api/dashboard/visitor-chart?days=${days}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setVisitorStats(data);
        const formattedData = data.chartData.map((item: VisitorChartData) => {
          const date = new Date(item.date);
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          return {
            day: `${month}/${day}`,
            visitors: item.visitors,
          };
        });
        setVisitorChartData(formattedData);
      }
    } catch (error) {
      console.error('Failed to refresh visitor chart:', error);
    } finally {
      setIsRefreshingChart(false);
      setIsRefreshingStats(false);
    }
  };

  // StarDisplay component for showing ratings
  const StarDisplay = ({ rating, size = 'md' }: { rating: number; size?: 'sm' | 'md' | 'lg' }) => {
    const sizeClasses = {
      sm: 'w-3 h-3',
      md: 'w-5 h-5',
      lg: 'w-6 h-6',
    };

    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => {
          const filled = star <= Math.floor(rating);
          const partial = !filled && star === Math.ceil(rating) && rating % 1 > 0;
          const partialWidth = partial ? `${(rating % 1) * 100}%` : '0%';

          return (
            <div key={star} className="relative">
              <Star
                className={`${sizeClasses[size]} text-neutral-200`}
                fill="#e5e7eb"
              />
              {(filled || partial) && (
                <div
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: filled ? '100%' : partialWidth }}
                >
                  <Star
                    className={`${sizeClasses[size]} text-yellow-400`}
                    fill="#facc15"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // 방문 경로 파이차트 색상
  const visitSourceColors = [
    '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
    '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#94a3b8',
  ];

  // 방문 경로 파이차트 렌더링
  const renderVisitSourcePie = () => {
    // none 제외
    const filteredData = visitSourceData.filter((item) => item.source !== 'none');
    if (filteredData.length === 0) {
      return (
        <div className="flex items-center justify-center h-32 text-neutral-400 text-sm">
          데이터가 없습니다
        </div>
      );
    }

    const totalCount = filteredData.reduce((sum, item) => sum + item.count, 0);
    let cumulative = 0;
    const gradientParts = filteredData.map((item, idx) => {
      const start = cumulative;
      const pct = totalCount > 0 ? Math.round((item.count / totalCount) * 100) : 0;
      cumulative += pct;
      return `${visitSourceColors[idx % visitSourceColors.length]} ${start}% ${cumulative}%`;
    });

    return (
      <div className="flex items-center gap-6">
        <div
          className="relative w-28 h-28 rounded-full flex-shrink-0"
          style={{
            background: `conic-gradient(${gradientParts.join(', ')})`,
          }}
        >
          <div className="absolute inset-3 bg-white rounded-full flex items-center justify-center">
            <span className="text-xs font-medium text-neutral-600 text-center">방문<br />경로</span>
          </div>
        </div>
        <div className="space-y-1.5 flex-1 min-w-0">
          {filteredData.slice(0, 5).map((item, idx) => {
            const pct = totalCount > 0 ? Math.round((item.count / totalCount) * 100) : 0;
            return (
              <div key={item.source} className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: visitSourceColors[idx % visitSourceColors.length] }}
                />
                <span className="text-sm text-neutral-700 truncate">{item.label}</span>
                <span className="text-xs text-neutral-400 ml-auto">({pct}%)</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // 방문 경로 막대차트 렌더링
  const renderVisitSourceBarChart = () => {
    // none 제외
    const filteredData = visitSourceData.filter((item) => item.source !== 'none');
    if (filteredData.length === 0) {
      return (
        <div className="flex items-center justify-center h-32 text-neutral-400 text-sm">
          데이터가 없습니다
        </div>
      );
    }

    const maxCount = Math.max(...filteredData.map((d) => d.count));

    return (
      <div className="space-y-2.5">
        {filteredData.slice(0, 5).map((item) => (
          <div key={item.source} className="flex items-center gap-3">
            <span className="text-sm text-neutral-600 w-20 truncate">{item.label}</span>
            <div className="flex-1 h-5 bg-neutral-100 rounded overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded transition-all duration-500"
                style={{ width: maxCount > 0 ? `${(item.count / maxCount) * 100}%` : '0%' }}
              />
            </div>
            <span className="text-sm text-neutral-600 w-12 text-right">{item.count}명</span>
          </div>
        ))}
      </div>
    );
  };

  // Helper function to render growth indicator
  const renderGrowthIndicator = (growth: number, prefix: string, suffix: string = '%') => {
    if (growth >= 0) {
      return (
        <p className="text-sm text-green-600 mt-2 flex items-center gap-1">
          <TrendingUp className="w-4 h-4" />
          {prefix} +{growth}{suffix}
        </p>
      );
    } else {
      return (
        <p className="text-sm text-red-600 mt-2 flex items-center gap-1">
          <TrendingDown className="w-4 h-4" />
          {prefix} {growth}{suffix}
        </p>
      );
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Announcements */}
      {announcements.length > 0 && (
        <div className="mb-6 space-y-3">
          {announcements.map((announcement) => (
            <div
              key={announcement.id}
              className="flex items-start gap-3 p-4 bg-brand-50 border border-brand-200 rounded-lg"
            >
              <div className="flex-shrink-0 mt-0.5">
                <Megaphone className="w-5 h-5 text-brand-700" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="info" className="text-xs">공지</Badge>
                  <span className="font-medium text-neutral-900">{announcement.title}</span>
                </div>
                <p className="text-sm text-neutral-700 whitespace-pre-wrap">{announcement.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {/* Total Customers */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-neutral-500 mb-1">총 고객 수</p>
                <p className="text-3xl font-bold text-neutral-900">
                  {formatNumber(stats?.totalCustomers ?? 0)}
                </p>
                {renderGrowthIndicator(stats?.customerGrowth ?? 0, '지난달 대비')}
              </div>
              <div className="p-3 bg-brand-50 rounded-lg">
                <Users className="w-6 h-6 text-brand-800" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Retarget Message Credits */}
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => router.push('/messages')}
        >
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-neutral-500 mb-1">[무료 지원]리타겟 메시지 잔여 발송 수</p>
                <p className="text-3xl font-bold text-neutral-900">
                  {formatNumber(retargetCredits?.remainingCredits ?? 0)}
                </p>
                <p className="text-sm text-neutral-400 mt-2">
                  이번 달 {retargetCredits?.totalCredits ?? 30}건 중 잔여
                </p>
              </div>
              <div className="p-3 bg-emerald-50 rounded-lg">
                <Mail className="w-6 h-6 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Review Balance */}
        <Card
          className="border-brand-200 bg-brand-50/30 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => router.push('/billing')}
        >
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-neutral-500 mb-1">알림톡 발송 가능액</p>
                <p className="text-3xl font-bold text-neutral-900">
                  {formatCurrency(stats?.reviewBalance ?? 0)}
                </p>
                <p className="text-sm text-neutral-500 mt-2">
                  충전이 필요하면 클릭하세요
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                {(stats?.reviewBalance ?? 0) < 1000 && (
                  <Badge variant="error" className="flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    잔액 부족
                  </Badge>
                )}
                <div className="p-3 bg-brand-100 rounded-lg">
                  <Wallet className="w-6 h-6 text-brand-800" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Automation Marketing CTA */}
      {automationStatus && !automationStatus.hasActiveRules && (
        <div
          className="mb-8 border border-brand-200 rounded-2xl bg-gradient-to-r from-brand-50 to-white p-6 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => router.push('/automation')}
        >
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-5 h-5 text-brand-700" />
            <h3 className="text-lg font-bold text-neutral-900">자동 마케팅이 꺼져 있습니다</h3>
          </div>
          <p className="text-sm text-neutral-600 mb-5">
            지금 이 고객들에게 자동으로 쿠폰을 보낼 수 있습니다
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            {/* 이탈 위험 고객 */}
            <div className="bg-white border border-neutral-100 rounded-xl p-4 text-center">
              <div className="flex justify-center mb-2">
                <div className="p-2 bg-red-50 rounded-lg">
                  <Bell className="w-5 h-5 text-red-500" />
                </div>
              </div>
              <p className="text-sm font-medium text-neutral-700 mb-1">이탈 위험 고객</p>
              <p className="text-2xl font-bold text-brand-700">
                {automationStatus.previews?.CHURN_PREVENTION?.thisMonthEstimate ?? 0}명
              </p>
              <p className="text-xs text-neutral-400 mt-1">30일 이상 미방문</p>
            </div>

            {/* 이번 달 생일 */}
            <div className="bg-white border border-neutral-100 rounded-xl p-4 text-center">
              <div className="flex justify-center mb-2">
                <div className="p-2 bg-pink-50 rounded-lg">
                  <Cake className="w-5 h-5 text-pink-500" />
                </div>
              </div>
              <p className="text-sm font-medium text-neutral-700 mb-1">이번 달 생일</p>
              <p className="text-2xl font-bold text-brand-700">
                {automationStatus.previews?.BIRTHDAY?.thisMonthEstimate ?? 0}명
              </p>
              <p className="text-xs text-neutral-400 mt-1">축하 쿠폰 자동 발송</p>
            </div>

            {/* 첫 방문 고객 */}
            <div className="bg-white border border-neutral-100 rounded-xl p-4 text-center">
              <div className="flex justify-center mb-2">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <UserPlus className="w-5 h-5 text-blue-500" />
                </div>
              </div>
              <p className="text-sm font-medium text-neutral-700 mb-1">첫 방문 고객</p>
              <p className="text-2xl font-bold text-brand-700">
                {automationStatus.previews?.FIRST_VISIT_FOLLOWUP?.thisMonthEstimate ?? 0}명
              </p>
              <p className="text-xs text-neutral-400 mt-1">재방문 쿠폰 자동 발송</p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-neutral-500">
              <span className="font-medium text-neutral-700">월 30건까지 무료!</span>
              {' · '}태그히어 평균 쿠폰 사용률 38%
            </p>
            <div className="flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800">
              자동 마케팅 시작하기
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>
        </div>
      )}

      {/* Automation Active Banner (State C) */}
      {automationStatus && automationStatus.hasActiveRules && automationStatus.dashboard && automationStatus.dashboard.totalSent > 0 && (
        <div
          className="mb-8 flex items-center justify-between border border-neutral-200 rounded-xl bg-neutral-50 px-5 py-3.5 cursor-pointer hover:shadow-sm transition-shadow"
          onClick={() => router.push('/automation')}
        >
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-emerald-100 rounded-lg">
              <Zap className="w-4 h-4 text-emerald-600" />
            </div>
            <span className="text-sm text-neutral-700">
              이번 달 자동 마케팅:{' '}
              <span className="font-semibold text-neutral-900">{automationStatus.dashboard.totalSent}건 발송</span>
              {automationStatus.dashboard.totalCouponUsed > 0 && (
                <>
                  , <span className="font-semibold text-emerald-600">{automationStatus.dashboard.totalCouponUsed}건 사용 ({Math.round(automationStatus.dashboard.usageRate)}%)</span>
                </>
              )}
            </span>
          </div>
          <div className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700">
            성과 보기
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </div>
      )}

      {/* Visit Source Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* 방문 경로 분포 - 파이차트 */}
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => router.push('/insights/customers')}
        >
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="w-4 h-4 text-neutral-400" />
              <span className="text-sm font-medium text-neutral-900">방문 경로 분포</span>
            </div>
            {renderVisitSourcePie()}
          </CardContent>
        </Card>

        {/* 방문 경로별 고객 수 - 막대차트 */}
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => router.push('/insights/customers')}
        >
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="w-4 h-4 text-neutral-400" />
              <span className="text-sm font-medium text-neutral-900">방문 경로별 고객 수</span>
            </div>
            {renderVisitSourceBarChart()}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Visitor Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg font-semibold">
                일자별 방문자 수 추이
              </CardTitle>
              <button
                onClick={handleRefreshVisitorChart}
                disabled={isRefreshingChart}
                className="p-1.5 rounded-md hover:bg-neutral-100 transition-colors disabled:opacity-50"
                title="새로고침"
              >
                <RefreshCw className={`w-4 h-4 text-neutral-500 ${isRefreshingChart ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="flex gap-1 p-1 bg-neutral-100 rounded-lg">
              {(['7일', '30일', '90일', '전체'] as PeriodKey[]).map((period) => (
                <button
                  key={period}
                  onClick={() => setChartPeriod(period)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    chartPeriod === period
                      ? 'bg-white text-neutral-900 shadow-sm'
                      : 'text-neutral-500 hover:text-neutral-700'
                  }`}
                >
                  {period}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={visitorChartData}>
                  <defs>
                    <linearGradient id="colorVisitors" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1E3A5F" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#1E3A5F" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis
                    dataKey="day"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#64748B', fontSize: 12 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#64748B', fontSize: 12 }}
                    tickFormatter={(value) => formatNumber(value)}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                      padding: '8px 12px',
                    }}
                    formatter={(value: number) => [formatNumber(value), '방문자 수']}
                  />
                  <Area
                    type="monotone"
                    dataKey="visitors"
                    stroke="#1E3A5F"
                    strokeWidth={2}
                    fill="url(#colorVisitors)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-center gap-2 mt-4 text-sm text-neutral-500">
              <div className="w-3 h-3 rounded-full bg-brand-800" />
              일자별 방문자 수
            </div>
          </CardContent>
        </Card>

        {/* Customer Feedback */}
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push('/feedback')}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-neutral-900">
                고객 피드백
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRefreshFeedback();
                }}
                disabled={isRefreshingFeedback}
                className="p-1.5 rounded-md hover:bg-neutral-100 transition-colors disabled:opacity-50"
                title="새로고침"
              >
                <RefreshCw className={`w-4 h-4 text-neutral-500 ${isRefreshingFeedback ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Average Rating */}
            <div className="flex items-center gap-3 mb-2">
              <StarDisplay rating={feedbackSummary?.averageRating ?? 0} size="lg" />
              <span className="text-2xl font-bold text-neutral-900">
                {feedbackSummary?.averageRating?.toFixed(1) ?? '0.0'}
              </span>
            </div>
            <p className="text-sm text-neutral-500 mb-4">
              총 {formatNumber(feedbackSummary?.totalFeedbackCount ?? 0)}개 피드백
            </p>

            {/* Low Rating Warning */}
            {(feedbackSummary?.lowRatingCount ?? 0) > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg mb-4">
                <AlertTriangle className="w-4 h-4 text-orange-600 flex-shrink-0" />
                <span className="text-sm text-orange-700">
                  개선 필요 피드백 {feedbackSummary?.lowRatingCount}개
                </span>
              </div>
            )}

            {/* Feedback List */}
            <div className="space-y-3">
              {feedbackSummary?.feedbacks && feedbackSummary.feedbacks.length > 0 ? (
                feedbackSummary.feedbacks.map((feedback) => (
                  <div
                    key={feedback.id}
                    className={`p-3 rounded-lg ${
                      feedback.rating < 3
                        ? 'bg-red-50 border border-red-200'
                        : 'bg-neutral-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <StarDisplay rating={feedback.rating} size="sm" />
                        <span className="text-xs text-neutral-600">
                          {feedback.customerName || '익명'}
                        </span>
                      </div>
                      <span className="text-xs text-neutral-400">
                        {new Date(feedback.createdAt).toLocaleDateString('ko-KR')}
                      </span>
                    </div>
                    {feedback.text && (
                      <p className={`text-sm mt-1 line-clamp-2 ${
                        feedback.rating < 3 ? 'text-red-700' : 'text-neutral-700'
                      }`}>
                        {feedback.text}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <div className="p-4 bg-neutral-50 rounded-lg text-center">
                  <MessageSquare className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
                  <p className="text-sm text-neutral-500">아직 피드백이 없습니다</p>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="mt-4 p-3 bg-neutral-50 rounded-lg">
              <p className="text-xs text-neutral-500">
                고객이 포인트 적립 시 남긴 피드백이 표시됩니다.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Promo Popup */}
      <Modal open={showPromoPopup} onOpenChange={(open) => !open && handleClosePromoPopup()}>
        <ModalContent className="max-w-[800px] p-0 overflow-hidden">
          <div className="flex flex-col md:flex-row">
            {/* Left: Phone mockup image */}
            <div className="w-full md:w-1/2 bg-[#f1f5f9] p-6 md:p-8 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/sms-mockup.png"
                alt="SMS 메시지 미리보기"
                className="max-h-[300px] md:max-h-[400px] object-contain"
              />
            </div>

            {/* Right: Text content */}
            <div className="w-full md:w-1/2 p-6 md:p-8 flex flex-col justify-center">
              <h2 className="text-xl md:text-2xl font-bold text-neutral-900 mb-3 md:mb-4">
                매월 고객 30명에게 무료로 문자 메시지를 보낼 수 있어요
              </h2>
              <p className="text-sm md:text-base text-neutral-600 mb-6 md:mb-8">
                태그히어 리타겟 마케팅을 통해 매월 30명에게 무료로 발송해 보세요!
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={handleGoToMessages}
                  className="w-full py-3 px-4 bg-neutral-900 text-white font-semibold rounded-lg hover:bg-neutral-800 transition-colors"
                >
                  30명에게 무료로 메시지 보내기
                </button>
                <button
                  onClick={handleClosePromoPopup}
                  className="w-full py-2 px-4 text-neutral-500 font-medium hover:text-neutral-700 transition-colors"
                >
                  다음에 할게요
                </button>
              </div>
            </div>
          </div>
        </ModalContent>
      </Modal>
    </div>
  );
}
