'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Modal, ModalContent } from '@/components/ui/modal';
import { formatNumber, formatCurrency } from '@/lib/utils';
import { Users, UserPlus, TrendingUp, TrendingDown, Wallet, AlertTriangle, RefreshCw, Megaphone, Star, MessageSquare } from 'lucide-react';
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

        {/* New Customers */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-neutral-500 mb-1">신규 등록 고객</p>
                <p className="text-3xl font-bold text-neutral-900">
                  {formatNumber(stats?.newCustomers ?? 0)}
                </p>
                {renderGrowthIndicator(stats?.newCustomersGrowth ?? 0, '지난주 대비')}
              </div>
              <div className="p-3 bg-blue-50 rounded-lg">
                <UserPlus className="w-6 h-6 text-blue-600" />
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
