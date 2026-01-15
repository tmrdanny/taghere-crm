'use client';

import { useState, useEffect } from 'react';
import {
  Building2,
  Users2,
  UserRoundPlus,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
  ChevronRight,
  MapPin,
  Contact,
  Link2,
} from 'lucide-react';

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

// Demo data for fallback
const DEMO_DATA: OverviewData = {
  totalStores: 20,
  totalCustomers: 4836,
  newCustomersThisMonth: 523,
  walletBalance: 1000000,
  storeGrowth: 5,
  customerGrowth: 12.3,
  newCustomerGrowth: 8.7,
};

// Skeleton component for loading state
function KpiCardSkeleton() {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-6">
      <div className="space-y-4">
        <div className="h-3 w-20 bg-slate-100 rounded animate-pulse" />
        <div className="h-9 w-24 bg-slate-100 rounded animate-pulse" />
        <div className="h-3 w-28 bg-slate-50 rounded animate-pulse" />
      </div>
    </div>
  );
}

// KPI Card component - minimal design
interface KpiCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  accentColor: string;
  growth?: number;
  growthLabel?: string;
}

function KpiCard({ title, value, icon: Icon, accentColor, growth, growthLabel }: KpiCardProps) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-6 hover:border-slate-200 transition-all duration-200">
      <div className="flex items-start justify-between mb-4">
        <p className="text-[13px] font-medium text-slate-500 tracking-tight">{title}</p>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${accentColor}`}>
          <Icon className="w-[18px] h-[18px]" strokeWidth={1.5} />
        </div>
      </div>
      <p className="text-[28px] font-semibold text-slate-900 tracking-tight">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {growth !== undefined && (
        <div className="flex items-center gap-1.5 mt-3">
          {growth >= 0 ? (
            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" strokeWidth={2} />
          ) : (
            <ArrowDownRight className="w-3.5 h-3.5 text-rose-500" strokeWidth={2} />
          )}
          <span className={`text-xs font-medium ${growth >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {growth >= 0 ? '+' : ''}{growth}%
          </span>
          {growthLabel && (
            <span className="text-xs text-slate-400">{growthLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}

// Empty state component
function EmptyState() {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-16 text-center">
      <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
        <AlertCircle className="w-6 h-6 text-slate-400" strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-semibold text-slate-900 mb-2">
        데이터가 없습니다
      </h3>
      <p className="text-sm text-slate-500 max-w-xs mx-auto">
        아직 등록된 가맹점이 없습니다. 설정 페이지에서 가맹점을 연동해주세요.
      </p>
    </div>
  );
}

// Demo account email
const DEMO_EMAIL = 'franchise@tmr.com';

// Check if current user is demo account
function isDemoAccount(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const token = localStorage.getItem('franchiseToken');
    if (!token) return false;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.email === DEMO_EMAIL;
  } catch {
    return false;
  }
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
        // Use demo data only for demo account with empty results
        if (isDemoAccount() && responseData.totalStores === 0 && responseData.totalCustomers === 0) {
          setData(DEMO_DATA);
        } else {
          setData(responseData);
        }
      } catch (err: any) {
        setError(err.message);
        // Use demo data only for demo account on error
        if (isDemoAccount()) {
          setData(DEMO_DATA);
        } else {
          setData({
            totalStores: 0,
            totalCustomers: 0,
            newCustomersThisMonth: 0,
            walletBalance: 0,
          });
        }
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
        <h1 className="text-xl font-semibold text-slate-900 tracking-tight">홈</h1>
        <p className="text-sm text-slate-500 mt-1">
          프랜차이즈 전체 현황을 한눈에 확인하세요
        </p>
      </div>

      {/* KPI Cards Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCardSkeleton />
          <KpiCardSkeleton />
          <KpiCardSkeleton />
          <KpiCardSkeleton />
        </div>
      ) : data && (data.totalStores > 0 || data.totalCustomers > 0) ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="총 가맹점 수"
            value={data.totalStores}
            icon={Building2}
            accentColor="bg-slate-900 text-white"
            growth={data.storeGrowth}
            growthLabel="지난달 대비"
          />
          <KpiCard
            title="총 고객 수"
            value={data.totalCustomers}
            icon={Users2}
            accentColor="bg-emerald-500 text-white"
            growth={data.customerGrowth}
            growthLabel="지난달 대비"
          />
          <KpiCard
            title="이번 달 신규 고객"
            value={data.newCustomersThisMonth}
            icon={UserRoundPlus}
            accentColor="bg-blue-500 text-white"
            growth={data.newCustomerGrowth}
            growthLabel="지난달 대비"
          />
          <KpiCard
            title="충전 잔액"
            value={formatCurrency(data.walletBalance)}
            icon={Wallet}
            accentColor="bg-amber-500 text-white"
          />
        </div>
      ) : (
        <EmptyState />
      )}

      {/* Additional Sections */}
      {!isLoading && data && (data.totalStores > 0 || data.totalCustomers > 0) && (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Recent Activity Card */}
          <div className="bg-white border border-slate-100 rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">최근 활동</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-4 p-4 bg-slate-50/80 rounded-xl">
                <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center">
                  <MapPin className="w-[18px] h-[18px] text-white" strokeWidth={1.5} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">가맹점 현황</p>
                  <p className="text-[13px] text-slate-500">
                    {data.totalStores}개의 가맹점이 연동되어 있습니다.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 p-4 bg-slate-50/80 rounded-xl">
                <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
                  <Contact className="w-[18px] h-[18px] text-white" strokeWidth={1.5} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">고객 현황</p>
                  <p className="text-[13px] text-slate-500">
                    총 {data.totalCustomers.toLocaleString()}명의 고객 데이터가 있습니다.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions Card */}
          <div className="bg-white border border-slate-100 rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">빠른 작업</h3>
            <div className="space-y-2">
              <a
                href="/franchise/stores"
                className="flex items-center justify-between p-4 rounded-xl hover:bg-slate-50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <Building2 className="w-[18px] h-[18px] text-slate-400" strokeWidth={1.5} />
                  <span className="text-sm font-medium text-slate-700">가맹점 관리</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-400 transition-colors" strokeWidth={1.5} />
              </a>
              <a
                href="/franchise/customers"
                className="flex items-center justify-between p-4 rounded-xl hover:bg-slate-50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <Users2 className="w-[18px] h-[18px] text-slate-400" strokeWidth={1.5} />
                  <span className="text-sm font-medium text-slate-700">고객 목록 보기</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-400 transition-colors" strokeWidth={1.5} />
              </a>
              <a
                href="/franchise/settings"
                className="flex items-center justify-between p-4 rounded-xl hover:bg-slate-50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <Link2 className="w-[18px] h-[18px] text-slate-400" strokeWidth={1.5} />
                  <span className="text-sm font-medium text-slate-700">가맹점 연동하기</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-400 transition-colors" strokeWidth={1.5} />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
