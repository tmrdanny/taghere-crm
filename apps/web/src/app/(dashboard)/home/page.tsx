'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatNumber, formatCurrency } from '@/lib/utils';
import { Users, UserPlus, TrendingUp, TrendingDown, Wallet, AlertTriangle, RefreshCw, Megaphone } from 'lucide-react';
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

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

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

        {/* Today Visitors */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-neutral-900">
                오늘 방문자 수
              </span>
              <button
                onClick={handleRefreshVisitorChart}
                disabled={isRefreshingStats}
                className="p-1.5 rounded-md hover:bg-neutral-100 transition-colors disabled:opacity-50"
                title="새로고침"
              >
                <RefreshCw className={`w-4 h-4 text-neutral-500 ${isRefreshingStats ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm mb-4 ${
              (visitorStats?.growth ?? 0) >= 0
                ? 'bg-green-50 text-green-700'
                : 'bg-red-50 text-red-700'
            }`}>
              {(visitorStats?.growth ?? 0) >= 0 ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              어제 대비 {(visitorStats?.growth ?? 0) >= 0 ? '+' : ''}{visitorStats?.growth ?? 0}%
            </div>
            <p className="text-4xl font-bold text-neutral-900 mb-2">
              {formatNumber(visitorStats?.todayVisitors ?? 0)}명
            </p>
            <p className="text-sm text-neutral-500 mb-4">
              오늘 포인트 적립 또는 신규 등록된 고객 수
            </p>
            <div className="p-4 bg-brand-50 rounded-lg text-sm text-neutral-700 mb-4">
              <p className="font-medium">
                어제 방문자: {formatNumber(visitorStats?.yesterdayVisitors ?? 0)}명
              </p>
            </div>
            <div className="p-4 bg-neutral-50 rounded-lg text-sm text-neutral-600">
              <p>
                포인트 적립 및 신규 고객 등록이 방문자 수로 집계됩니다.
              </p>
              <p className="mt-2">
                같은 날 여러 번 방문한 고객은 1명으로 계산됩니다.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
