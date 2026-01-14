'use client';

import { useState, useEffect } from 'react';
import { Store, Users, UserPlus, CreditCard, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';

interface OverviewData {
  totalStores: number;
  totalCustomers: number;
  newCustomersThisMonth: number;
  walletBalance: number;
  storeGrowth?: number;
  customerGrowth?: number;
  newCustomerGrowth?: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Skeleton component for loading state
function KpiCardSkeleton() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
      <div className="flex items-start justify-between">
        <div className="space-y-3 flex-1">
          <div className="h-4 w-24 bg-slate-200 rounded animate-pulse" />
          <div className="h-8 w-20 bg-slate-200 rounded animate-pulse" />
          <div className="h-3 w-32 bg-slate-100 rounded animate-pulse" />
        </div>
        <div className="w-12 h-12 bg-slate-100 rounded-lg animate-pulse" />
      </div>
    </div>
  );
}

// KPI Card component
interface KpiCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  iconBgColor: string;
  iconColor: string;
  growth?: number;
  growthLabel?: string;
}

function KpiCard({ title, value, icon: Icon, iconBgColor, iconColor, growth, growthLabel }: KpiCardProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="text-3xl font-bold text-slate-900 mt-2">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {growth !== undefined && (
            <div className="flex items-center gap-1 mt-2">
              {growth >= 0 ? (
                <TrendingUp className="w-4 h-4 text-emerald-500" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-500" />
              )}
              <span className={`text-sm font-medium ${growth >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {growth >= 0 ? '+' : ''}{growth}%
              </span>
              {growthLabel && (
                <span className="text-sm text-slate-400">{growthLabel}</span>
              )}
            </div>
          )}
        </div>
        <div className={`w-12 h-12 ${iconBgColor} rounded-lg flex items-center justify-center`}>
          <Icon className={`w-6 h-6 ${iconColor}`} />
        </div>
      </div>
    </div>
  );
}

// Empty state component
function EmptyState() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-12 text-center">
      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <AlertCircle className="w-8 h-8 text-slate-400" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 mb-2">
        데이터가 없습니다
      </h3>
      <p className="text-slate-500 max-w-sm mx-auto">
        아직 등록된 가맹점이 없습니다. 설정 페이지에서 가맹점을 연동해주세요.
      </p>
    </div>
  );
}

export default function FranchiseHomePage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        setData(responseData);
      } catch (err: any) {
        setError(err.message);
        // Set default empty data on error
        setData({
          totalStores: 0,
          totalCustomers: 0,
          newCustomersThisMonth: 0,
          walletBalance: 0,
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchOverviewData();
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">홈</h1>
        <p className="text-slate-500 mt-1">
          프랜차이즈 전체 현황을 한눈에 확인하세요
        </p>
      </div>

      {/* KPI Cards Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <KpiCardSkeleton />
          <KpiCardSkeleton />
          <KpiCardSkeleton />
          <KpiCardSkeleton />
        </div>
      ) : data && (data.totalStores > 0 || data.totalCustomers > 0) ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <KpiCard
            title="총 가맹점 수"
            value={data.totalStores}
            icon={Store}
            iconBgColor="bg-indigo-50"
            iconColor="text-indigo-600"
            growth={data.storeGrowth}
            growthLabel="지난달 대비"
          />
          <KpiCard
            title="총 고객 수"
            value={data.totalCustomers}
            icon={Users}
            iconBgColor="bg-emerald-50"
            iconColor="text-emerald-600"
            growth={data.customerGrowth}
            growthLabel="지난달 대비"
          />
          <KpiCard
            title="이번 달 신규 고객"
            value={data.newCustomersThisMonth}
            icon={UserPlus}
            iconBgColor="bg-blue-50"
            iconColor="text-blue-600"
            growth={data.newCustomerGrowth}
            growthLabel="지난달 대비"
          />
          <KpiCard
            title="충전 잔액"
            value={formatCurrency(data.walletBalance)}
            icon={CreditCard}
            iconBgColor="bg-amber-50"
            iconColor="text-amber-600"
          />
        </div>
      ) : (
        <EmptyState />
      )}

      {/* Additional Sections Placeholder */}
      {!isLoading && data && (data.totalStores > 0 || data.totalCustomers > 0) && (
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Activity Card */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">최근 활동</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg">
                <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                  <Store className="w-5 h-5 text-indigo-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">가맹점 현황</p>
                  <p className="text-sm text-slate-500">
                    {data.totalStores}개의 가맹점이 연동되어 있습니다.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-lg">
                <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                  <Users className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">고객 현황</p>
                  <p className="text-sm text-slate-500">
                    총 {data.totalCustomers.toLocaleString()}명의 고객 데이터가 있습니다.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions Card */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">빠른 작업</h3>
            <div className="space-y-3">
              <a
                href="/franchise/stores"
                className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <Store className="w-5 h-5 text-slate-600" />
                  <span className="text-sm font-medium text-slate-700">가맹점 관리</span>
                </div>
                <svg className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </a>
              <a
                href="/franchise/customers"
                className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-slate-600" />
                  <span className="text-sm font-medium text-slate-700">고객 목록 보기</span>
                </div>
                <svg className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </a>
              <a
                href="/franchise/settings"
                className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <UserPlus className="w-5 h-5 text-slate-600" />
                  <span className="text-sm font-medium text-slate-700">가맹점 연동하기</span>
                </div>
                <svg className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
