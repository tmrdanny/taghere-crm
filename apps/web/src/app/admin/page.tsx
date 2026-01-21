'use client';

import { useEffect, useState } from 'react';
import { formatNumber } from '@/lib/utils';

interface Stats {
  storeCount: number;
  customerCount: number;
  userCount: number;
}

interface PaymentStats {
  totalRealPayments: number;
  monthlyRealPayments: number;
  totalTransactions: number;
}

interface PointStats {
  totalEarnedPoints: number;
  monthlyEarnedPoints: number;
}

interface TrendData {
  date: string;
  count: number;
  cumulative: number;
}

interface CustomerTrend {
  trend: TrendData[];
  totalCustomers: number;
  periodNew: number;
}

interface ExternalCustomerData {
  date: string;
  count: number;
}

interface ExternalCustomerStats {
  period: 'daily' | 'weekly' | 'monthly';
  data: ExternalCustomerData[];
  summary: {
    total: number;
    periodTotal: number;
    averagePerDay: number;
  };
}

type PeriodType = '1' | '7' | '30' | '90' | 'all';
type ExternalPeriodType = 'daily' | 'weekly' | 'monthly';

export default function AdminHomePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [paymentStats, setPaymentStats] = useState<PaymentStats | null>(null);
  const [pointStats, setPointStats] = useState<PointStats | null>(null);
  const [customerTrend, setCustomerTrend] = useState<CustomerTrend | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('30');
  const [isLoading, setIsLoading] = useState(true);
  const [isTrendLoading, setIsTrendLoading] = useState(false);

  // External Customer Stats
  const [externalStats, setExternalStats] = useState<ExternalCustomerStats | null>(null);
  const [externalPeriod, setExternalPeriod] = useState<ExternalPeriodType>('daily');
  const [isExternalLoading, setIsExternalLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    fetchCustomerTrend(selectedPeriod);
  }, [selectedPeriod]);

  useEffect(() => {
    fetchExternalCustomerStats(externalPeriod);
  }, [externalPeriod]);

  const fetchData = async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    try {
      const [statsRes, paymentStatsRes, pointStatsRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/admin/stats`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/admin/payment-stats`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/admin/point-stats`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      if (paymentStatsRes.ok) {
        const paymentData = await paymentStatsRes.json();
        setPaymentStats(paymentData);
      }

      if (pointStatsRes.ok) {
        const pointData = await pointStatsRes.json();
        setPointStats(pointData);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCustomerTrend = async (period: PeriodType) => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    setIsTrendLoading(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/admin/customer-trend?days=${period}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setCustomerTrend(data);
      }
    } catch (error) {
      console.error('Failed to fetch customer trend:', error);
    } finally {
      setIsTrendLoading(false);
    }
  };

  const fetchExternalCustomerStats = async (period: ExternalPeriodType) => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    setIsExternalLoading(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/admin/external-customer-stats?period=${period}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setExternalStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch external customer stats:', error);
    } finally {
      setIsExternalLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const currentMonth = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });

  return (
    <div className="space-y-8">
      {/* Key Metrics - Payment Stats */}
      <section>
        <div className="mb-4">
          <h2 className="text-[18px] font-semibold text-neutral-900">Key Metrics</h2>
          <p className="text-[14px] text-neutral-500 mt-0.5">{currentMonth} 기준</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Total Real Payments */}
          <div className="bg-white border border-[#EAEAEA] rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[14px] text-neutral-500">누적 CRM 매출액</p>
              <span className="text-[12px] text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded">TossPayments</span>
            </div>
            <p className="text-[28px] font-semibold text-neutral-900">
              {formatNumber(paymentStats?.totalRealPayments || 0)}
              <span className="text-[16px] font-normal text-neutral-500 ml-1">원</span>
            </p>
          </div>

          {/* Monthly Payments */}
          <div className="bg-white border border-[#EAEAEA] rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[14px] text-neutral-500">이번 달 CRM 매출</p>
            </div>
            <p className="text-[28px] font-semibold text-neutral-900">
              {formatNumber(paymentStats?.monthlyRealPayments || 0)}
              <span className="text-[16px] font-normal text-neutral-500 ml-1">원</span>
            </p>
          </div>

          {/* Total Earned Points */}
          <div className="bg-white border border-[#EAEAEA] rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[14px] text-neutral-500">누적 적립 포인트</p>
              <span className="text-[12px] text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded">포인트</span>
            </div>
            <p className="text-[28px] font-semibold text-neutral-900">
              {formatNumber(pointStats?.totalEarnedPoints || 0)}
              <span className="text-[16px] font-normal text-neutral-500 ml-1">P</span>
            </p>
            <p className="text-[13px] text-neutral-400 mt-2">
              이번 달 +{formatNumber(pointStats?.monthlyEarnedPoints || 0)}P
            </p>
          </div>
        </div>
      </section>

      {/* Customer Trend Chart */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[18px] font-semibold text-neutral-900">전체 고객 증감 추이</h2>
          <div className="flex gap-1">
            {(['1', '7', '30', '90', 'all'] as PeriodType[]).map((period) => (
              <button
                key={period}
                onClick={() => setSelectedPeriod(period)}
                className={`px-3 py-1.5 text-[13px] rounded-lg transition-colors ${
                  selectedPeriod === period
                    ? 'bg-neutral-900 text-white'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                {period === 'all' ? 'All' : `${period}일`}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white border border-[#EAEAEA] rounded-xl p-6">
          {isTrendLoading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : customerTrend && customerTrend.trend.length > 0 ? (
            <div>
              <div className="flex items-center gap-6 mb-4">
                <div>
                  <p className="text-[13px] text-neutral-500">현재 총 고객</p>
                  <p className="text-[24px] font-semibold text-neutral-900">
                    {formatNumber(customerTrend.totalCustomers)}명
                  </p>
                </div>
                <div>
                  <p className="text-[13px] text-neutral-500">기간 내 신규</p>
                  <p className="text-[24px] font-semibold text-green-600">
                    +{formatNumber(customerTrend.periodNew)}명
                  </p>
                </div>
              </div>
              <div className="h-48 relative">
                <CustomerTrendChart data={customerTrend.trend} />
              </div>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-neutral-400">
              데이터가 없습니다
            </div>
          )}
        </div>
      </section>

      {/* External Customer Collection Stats */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-[18px] font-semibold text-neutral-900">신규고객 수집 현황</h2>
            <p className="text-[13px] text-neutral-500 mt-0.5">gain_customer 페이지 수집 통계</p>
          </div>
          <div className="flex gap-1">
            {(['daily', 'weekly', 'monthly'] as ExternalPeriodType[]).map((period) => (
              <button
                key={period}
                onClick={() => setExternalPeriod(period)}
                className={`px-3 py-1.5 text-[13px] rounded-lg transition-colors ${
                  externalPeriod === period
                    ? 'bg-neutral-900 text-white'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                {period === 'daily' ? '일별' : period === 'weekly' ? '주별' : '월별'}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white border border-[#EAEAEA] rounded-xl p-6">
          {isExternalLoading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : externalStats ? (
            <div>
              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="text-center p-4 bg-blue-50 rounded-xl">
                  <p className="text-[28px] font-semibold text-blue-600">
                    {formatNumber(externalStats.summary.total)}
                  </p>
                  <p className="text-[13px] text-neutral-500 mt-1">전체 수집</p>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-xl">
                  <p className="text-[28px] font-semibold text-green-600">
                    {formatNumber(externalStats.summary.periodTotal)}
                  </p>
                  <p className="text-[13px] text-neutral-500 mt-1">
                    1/18 이후
                  </p>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-xl">
                  <p className="text-[28px] font-semibold text-purple-600">
                    {externalStats.summary.averagePerDay}
                  </p>
                  <p className="text-[13px] text-neutral-500 mt-1">일평균</p>
                </div>
              </div>

              {/* Bar Chart */}
              {externalStats.data.length > 0 ? (
                <div className="h-48 relative">
                  <ExternalCustomerChart data={externalStats.data} period={externalPeriod} />
                </div>
              ) : (
                <div className="h-48 flex items-center justify-center text-neutral-400">
                  기간 내 데이터가 없습니다
                </div>
              )}
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-neutral-400">
              데이터가 없습니다
            </div>
          )}
        </div>
      </section>

      {/* Platform Stats */}
      <section>
        <div className="mb-4">
          <h2 className="text-[18px] font-semibold text-neutral-900">플랫폼 현황</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Store Count */}
          <div className="bg-white border border-[#EAEAEA] rounded-xl p-6">
            <p className="text-[14px] text-neutral-500 mb-4">전체 매장</p>
            <p className="text-[28px] font-semibold text-neutral-900">
              {formatNumber(stats?.storeCount || 0)}
              <span className="text-[16px] font-normal text-neutral-500 ml-1">개</span>
            </p>
          </div>

          {/* Customer Count */}
          <div className="bg-white border border-[#EAEAEA] rounded-xl p-6">
            <p className="text-[14px] text-neutral-500 mb-4">전체 고객</p>
            <p className="text-[28px] font-semibold text-neutral-900">
              {formatNumber(stats?.customerCount || 0)}
              <span className="text-[16px] font-normal text-neutral-500 ml-1">명</span>
            </p>
          </div>

          {/* User Count */}
          <div className="bg-white border border-[#EAEAEA] rounded-xl p-6">
            <p className="text-[14px] text-neutral-500 mb-4">전체 사용자</p>
            <p className="text-[28px] font-semibold text-neutral-900">
              {formatNumber(stats?.userCount || 0)}
              <span className="text-[16px] font-normal text-neutral-500 ml-1">명</span>
            </p>
          </div>
        </div>
      </section>

      {/* Quick Actions */}
      <section>
        <div className="mb-4">
          <h2 className="text-[18px] font-semibold text-neutral-900">바로가기</h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <a
            href="/admin/stores"
            className="bg-white border border-[#EAEAEA] rounded-xl p-5 hover:border-[#FFD541] hover:shadow-sm transition-all group"
          >
            <div className="w-10 h-10 bg-[#FFF8E1] rounded-lg flex items-center justify-center mb-3 group-hover:bg-[#FFD541] transition-colors">
              <svg className="w-5 h-5 text-[#F9A825] group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
              </svg>
            </div>
            <p className="text-[14px] font-medium text-neutral-900">매장 관리</p>
            <p className="text-[12px] text-neutral-500 mt-0.5">매장 목록 및 설정</p>
          </a>

          <a
            href="/admin/announcements"
            className="bg-white border border-[#EAEAEA] rounded-xl p-5 hover:border-[#FFD541] hover:shadow-sm transition-all group"
          >
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center mb-3 group-hover:bg-blue-500 transition-colors">
              <svg className="w-5 h-5 text-blue-500 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />
              </svg>
            </div>
            <p className="text-[14px] font-medium text-neutral-900">공지사항</p>
            <p className="text-[12px] text-neutral-500 mt-0.5">공지 관리</p>
          </a>

          <a
            href="/admin/banners"
            className="bg-white border border-[#EAEAEA] rounded-xl p-5 hover:border-[#FFD541] hover:shadow-sm transition-all group"
          >
            <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center mb-3 group-hover:bg-purple-500 transition-colors">
              <svg className="w-5 h-5 text-purple-500 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
            </div>
            <p className="text-[14px] font-medium text-neutral-900">배너 관리</p>
            <p className="text-[12px] text-neutral-500 mt-0.5">주문완료 배너</p>
          </a>

          <div className="bg-white border border-[#EAEAEA] rounded-xl p-5 opacity-50 cursor-not-allowed">
            <div className="w-10 h-10 bg-neutral-100 rounded-lg flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            </div>
            <p className="text-[14px] font-medium text-neutral-400">통계 분석</p>
            <p className="text-[12px] text-neutral-400 mt-0.5">준비 중</p>
          </div>
        </div>
      </section>
    </div>
  );
}

// Simple line chart component using SVG
function CustomerTrendChart({ data }: { data: TrendData[] }) {
  if (data.length === 0) return null;

  const padding = { top: 10, right: 10, bottom: 30, left: 50 };
  const width = 100; // percentage
  const height = 192; // h-48 = 12rem = 192px

  const maxValue = Math.max(...data.map((d) => d.cumulative));
  const minValue = Math.min(...data.map((d) => d.cumulative));
  const valueRange = maxValue - minValue || 1;

  // Generate path
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1 || 1)) * 100;
    const y = 100 - ((d.cumulative - minValue) / valueRange) * 100;
    return { x, y, data: d };
  });

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');

  // Area fill path
  const areaD = `${pathD} L 100 100 L 0 100 Z`;

  // Y-axis labels
  const yLabels = [maxValue, Math.round((maxValue + minValue) / 2), minValue];

  // X-axis labels (show first, middle, last dates)
  const xLabels =
    data.length > 2
      ? [
          data[0].date.slice(5),
          data[Math.floor(data.length / 2)].date.slice(5),
          data[data.length - 1].date.slice(5),
        ]
      : data.map((d) => d.date.slice(5));

  return (
    <div className="w-full h-full relative">
      {/* Y-axis labels */}
      <div className="absolute left-0 top-0 bottom-6 w-10 flex flex-col justify-between text-[11px] text-neutral-400">
        {yLabels.map((label, i) => (
          <span key={i}>{label.toLocaleString()}</span>
        ))}
      </div>

      {/* Chart area */}
      <div className="absolute left-12 right-0 top-0 bottom-6">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="w-full h-full"
        >
          {/* Grid lines */}
          <line x1="0" y1="0" x2="100" y2="0" stroke="#E5E5E5" strokeWidth="0.5" />
          <line x1="0" y1="50" x2="100" y2="50" stroke="#E5E5E5" strokeWidth="0.5" />
          <line x1="0" y1="100" x2="100" y2="100" stroke="#E5E5E5" strokeWidth="0.5" />

          {/* Area fill */}
          <path d={areaD} fill="url(#gradient)" opacity="0.3" />

          {/* Line */}
          <path
            d={pathD}
            fill="none"
            stroke="#FFD541"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />

          {/* Gradient definition */}
          <defs>
            <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFD541" />
              <stop offset="100%" stopColor="#FFD541" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* X-axis labels */}
      <div className="absolute left-12 right-0 bottom-0 h-6 flex justify-between text-[11px] text-neutral-400">
        {xLabels.map((label, i) => (
          <span key={i}>{label}</span>
        ))}
      </div>
    </div>
  );
}

// Line chart component for External Customer stats
function ExternalCustomerChart({ data, period }: { data: ExternalCustomerData[]; period: ExternalPeriodType }) {
  if (data.length === 0) return null;

  const maxValue = Math.max(...data.map((d) => d.count), 1);
  const minValue = 0;

  // Format date label based on period
  const formatLabel = (dateStr: string) => {
    if (period === 'monthly') {
      // YYYY-MM -> M월
      const [year, month] = dateStr.split('-');
      return `${parseInt(month)}월`;
    } else {
      // YYYY-MM-DD -> MM/DD
      return dateStr.slice(5).replace('-', '/');
    }
  };

  // Y-axis labels
  const yLabels = [maxValue, Math.round(maxValue / 2), minValue];

  // Generate line path points
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1 || 1)) * 100;
    const y = 100 - ((d.count - minValue) / (maxValue - minValue || 1)) * 100;
    return { x, y, data: d };
  });

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');

  // Area fill path
  const areaD = `${pathD} L 100 100 L 0 100 Z`;

  // X-axis labels (show a few labels to avoid overcrowding)
  const xLabels =
    data.length > 2
      ? [
          data[0].date,
          data[Math.floor(data.length / 2)].date,
          data[data.length - 1].date,
        ]
      : data.map((d) => d.date);

  return (
    <div className="w-full h-full relative">
      {/* Y-axis labels */}
      <div className="absolute left-0 top-0 bottom-6 w-8 flex flex-col justify-between text-[11px] text-neutral-400">
        {yLabels.map((label, i) => (
          <span key={i}>{label}</span>
        ))}
      </div>

      {/* Chart area */}
      <div className="absolute left-10 right-0 top-0 bottom-6">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="w-full h-full"
        >
          {/* Grid lines */}
          <line x1="0" y1="0" x2="100" y2="0" stroke="#E5E5E5" strokeWidth="0.5" />
          <line x1="0" y1="50" x2="100" y2="50" stroke="#E5E5E5" strokeWidth="0.5" />
          <line x1="0" y1="100" x2="100" y2="100" stroke="#E5E5E5" strokeWidth="0.5" />

          {/* Area fill */}
          <path d={areaD} fill="url(#externalGradient)" opacity="0.3" />

          {/* Line */}
          <path
            d={pathD}
            fill="none"
            stroke="#10B981"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />

          {/* Gradient definition */}
          <defs>
            <linearGradient id="externalGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* X-axis labels */}
      <div className="absolute left-10 right-0 bottom-0 h-6 flex justify-between text-[10px] text-neutral-400 px-1">
        {xLabels.map((dateStr, i) => (
          <span key={i} className="truncate">
            {formatLabel(dateStr)}
          </span>
        ))}
      </div>
    </div>
  );
}
