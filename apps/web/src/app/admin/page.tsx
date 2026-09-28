'use client';

import { API_BASE } from '@/lib/api-config';
import { useEffect, useState } from 'react';
import { fetchJsonCached } from '@/lib/swr-cache';
import { X, Loader2 } from 'lucide-react';
import {
  CorporateAdTrendData,
  DemographicItem,
  ExternalCustomerData,
  ExternalPeriodType,
  TrendData,
  VisitSourceDistribution,
} from '@/features/admin-charts';
import { Skel, rise } from '@/features/admin-ui';
import { InsightsCard, MetricsCard, QuickLinks, StoreOrdersCard } from './_components/home';

export interface Stats {
  storeCount: number;
  customerCount: number;
  userCount: number;
}

export interface PaymentStats {
  totalRealPayments: number;
  monthlyRealPayments: number;
  totalTransactions: number;
  breakdown?: {
    store: number;
    franchise: number;
    external: number;
    monthlyStore: number;
    monthlyFranchise: number;
    monthlyExternal: number;
  };
}

export interface PointStats {
  totalEarnedPoints: number;
  monthlyEarnedPoints: number;
}

export interface CustomerTrend {
  trend: TrendData[];
  totalCustomers: number;
  periodNew: number;
}

export interface ExternalCustomerStats {
  period: 'daily' | 'weekly' | 'monthly';
  data: ExternalCustomerData[];
  summary: {
    total: number;
    periodTotal: number;
    averagePerDay: number;
  };
}

export interface VisitSourceStats {
  totalCustomers: number;
  totalWithSource: number;
  noSourceCount: number;
  distribution: VisitSourceDistribution[];
}

export interface DemographicStats {
  totalCustomers: number;
  genderDistribution: DemographicItem[];
  ageGroupDistribution: DemographicItem[];
}

export interface CorporateAdStats {
  trend: CorporateAdTrendData[];
  summary: {
    totalAlimTalk: number;
    totalSent: number;
    totalFailed: number;
    totalMembership: number;
  };
}

export interface StoreOrderItem {
  id: string;
  productName: string;
  quantity: number;
  price: number;
}

export interface StoreOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  totalAmount: number;
  status: 'PENDING' | 'PAID' | 'CANCELLED';
  paymentKey: string | null;
  paidAt: string | null;
  createdAt: string;
  store: {
    id: string;
    name: string;
  };
  items: StoreOrderItem[];
}

export type PeriodType = '1' | '7' | '30' | '90' | 'all';

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

  // Visit Source Stats
  const [visitSourceStats, setVisitSourceStats] = useState<VisitSourceStats | null>(null);
  const [isVisitSourceLoading, setIsVisitSourceLoading] = useState(false);

  // Demographic Stats
  const [demographicStats, setDemographicStats] = useState<DemographicStats | null>(null);
  const [isDemographicLoading, setIsDemographicLoading] = useState(false);

  // Corporate Ad Stats
  const [corporateAdStats, setCorporateAdStats] = useState<CorporateAdStats | null>(null);
  const [corporateAdPeriod, setCorporateAdPeriod] = useState<PeriodType>('30');
  const [isCorporateAdLoading, setIsCorporateAdLoading] = useState(false);

  // Store Orders
  const [storeOrders, setStoreOrders] = useState<StoreOrder[]>([]);
  const [isOrdersLoading, setIsOrdersLoading] = useState(false);

  // External Revenue Modal
  const [showRevenueModal, setShowRevenueModal] = useState(false);
  const [revenueAmount, setRevenueAmount] = useState('');
  const [revenueDescription, setRevenueDescription] = useState('계좌이체');
  const [isAddingRevenue, setIsAddingRevenue] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    fetchCustomerTrend(selectedPeriod);
  }, [selectedPeriod]);

  useEffect(() => {
    fetchExternalCustomerStats(externalPeriod);
  }, [externalPeriod]);

  useEffect(() => {
    fetchVisitSourceStats();
  }, []);

  useEffect(() => {
    fetchDemographicStats();
  }, []);

  useEffect(() => {
    fetchCorporateAdStats(corporateAdPeriod);
  }, [corporateAdPeriod]);

  const apiBase = API_BASE;

  const fetchData = async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    try {
      await Promise.all([
        fetchJsonCached<Stats>(`${apiBase}/api/admin/stats`, token, (data) => {
          setStats(data);
          setIsLoading(false);
        }),
        fetchJsonCached<PaymentStats>(`${apiBase}/api/admin/payment-stats`, token, setPaymentStats),
        fetchJsonCached<PointStats>(`${apiBase}/api/admin/point-stats`, token, setPointStats),
      ]);
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
      await fetchJsonCached<CustomerTrend>(
        `${apiBase}/api/admin/customer-trend?days=${period}`,
        token,
        (data) => {
          setCustomerTrend(data);
          setIsTrendLoading(false);
        }
      );
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
      await fetchJsonCached<ExternalCustomerStats>(
        `${apiBase}/api/admin/external-customer-stats?period=${period}`,
        token,
        (data) => {
          setExternalStats(data);
          setIsExternalLoading(false);
        }
      );
    } catch (error) {
      console.error('Failed to fetch external customer stats:', error);
    } finally {
      setIsExternalLoading(false);
    }
  };

  const fetchVisitSourceStats = async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    setIsVisitSourceLoading(true);
    try {
      await fetchJsonCached<VisitSourceStats>(
        `${apiBase}/api/admin/visit-source-stats`,
        token,
        (data) => {
          setVisitSourceStats(data);
          setIsVisitSourceLoading(false);
        }
      );
    } catch (error) {
      console.error('Failed to fetch visit source stats:', error);
    } finally {
      setIsVisitSourceLoading(false);
    }
  };

  const fetchDemographicStats = async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    setIsDemographicLoading(true);
    try {
      await fetchJsonCached<DemographicStats>(
        `${apiBase}/api/admin/demographic-stats`,
        token,
        (data) => {
          setDemographicStats(data);
          setIsDemographicLoading(false);
        }
      );
    } catch (error) {
      console.error('Failed to fetch demographic stats:', error);
    } finally {
      setIsDemographicLoading(false);
    }
  };

  const fetchCorporateAdStats = async (period: PeriodType) => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    setIsCorporateAdLoading(true);
    try {
      await fetchJsonCached<CorporateAdStats>(
        `${apiBase}/api/admin/corporate-ad-stats?days=${period}`,
        token,
        (data) => {
          setCorporateAdStats(data);
          setIsCorporateAdLoading(false);
        }
      );
    } catch (error) {
      console.error('Failed to fetch corporate ad stats:', error);
    } finally {
      setIsCorporateAdLoading(false);
    }
  };

  const fetchStoreOrders = async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    setIsOrdersLoading(true);
    try {
      await fetchJsonCached<{ orders: StoreOrder[] }>(
        `${apiBase}/api/admin/store-orders?limit=20`,
        token,
        (data) => {
          setStoreOrders(data.orders || []);
          setIsOrdersLoading(false);
        }
      );
    } catch (error) {
      console.error('Failed to fetch store orders:', error);
    } finally {
      setIsOrdersLoading(false);
    }
  };

  // 외부 매출 추가
  const addExternalRevenue = async () => {
    const token = localStorage.getItem('adminToken');
    if (!token) return;

    const amount = parseInt(revenueAmount.replace(/,/g, ''), 10);
    if (!amount || amount <= 0) {
      alert('금액을 입력해주세요.');
      return;
    }

    setIsAddingRevenue(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/admin/external-revenue`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount,
            description: revenueDescription || '계좌이체',
            revenueDate: new Date().toISOString(),
          }),
        }
      );

      if (res.ok) {
        // 성공 시 통계 새로고침
        fetchData();
        setShowRevenueModal(false);
        setRevenueAmount('');
        setRevenueDescription('계좌이체');
      } else {
        const data = await res.json();
        alert(data.error || '추가에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to add external revenue:', error);
      alert('외부 매출 추가 중 오류가 발생했습니다.');
    } finally {
      setIsAddingRevenue(false);
    }
  };

  useEffect(() => {
    fetchStoreOrders();
  }, []);

  const currentMonth = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });

  return (
    <div>
      <div className="ad-rise mb-3 flex items-baseline gap-2" style={rise(0)}>
        <h2 className="text-[14px] font-semibold">핵심 지표</h2>
        <span className="text-[12px] text-[color:var(--ad-faint)]">{currentMonth} 기준</span>
      </div>

      {isLoading ? (
        <div className="ad-card grid gap-6 p-5 lg:grid-cols-4">
          {[0, 1, 2, 3].map((k) => (
            <div key={k}>
              <Skel className="h-3 w-24" />
              <Skel className="mt-3 h-7 w-40" />
              <Skel className="mt-3 h-3 w-32" />
            </div>
          ))}
        </div>
      ) : (
        <MetricsCard
          stats={stats}
          paymentStats={paymentStats}
          pointStats={pointStats}
          onAddRevenue={() => setShowRevenueModal(true)}
        />
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)]">
        <InsightsCard
          customerTrend={customerTrend}
          isTrendLoading={isTrendLoading}
          selectedPeriod={selectedPeriod}
          onSelectedPeriod={setSelectedPeriod}
          corporateAdStats={corporateAdStats}
          isCorporateAdLoading={isCorporateAdLoading}
          corporateAdPeriod={corporateAdPeriod}
          onCorporateAdPeriod={setCorporateAdPeriod}
          externalStats={externalStats}
          isExternalLoading={isExternalLoading}
          externalPeriod={externalPeriod}
          onExternalPeriod={setExternalPeriod}
          visitSourceStats={visitSourceStats}
          isVisitSourceLoading={isVisitSourceLoading}
          demographicStats={demographicStats}
          isDemographicLoading={isDemographicLoading}
        />
        <QuickLinks />
      </div>

      <div className="mt-4">
        <StoreOrdersCard orders={storeOrders} isLoading={isOrdersLoading} />
      </div>

      {/* 외부 매출 추가 모달 */}
      {showRevenueModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.4)] backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-[20px] bg-white p-6 shadow-[0_24px_60px_-20px_rgba(19,22,81,0.4)]">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-[17px] font-bold">외부 매출 추가</h3>
              <button
                onClick={() => setShowRevenueModal(false)}
                aria-label="닫기"
                className="ad-press grid h-8 w-8 place-items-center rounded-lg text-[color:var(--ad-faint)] hover:bg-[color:var(--ad-bg)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">금액 (원)</label>
                <input
                  type="text"
                  value={revenueAmount}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9]/g, '');
                    setRevenueAmount(value ? Number(value).toLocaleString() : '');
                  }}
                  placeholder="예: 1,000,000"
                  className="h-11 w-full rounded-[10px] border border-[color:var(--ad-line-strong)] px-4 text-[15px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">설명 (선택)</label>
                <input
                  type="text"
                  value={revenueDescription}
                  onChange={(e) => setRevenueDescription(e.target.value)}
                  placeholder="예: 계좌이체, 현금"
                  className="h-11 w-full rounded-[10px] border border-[color:var(--ad-line-strong)] px-4 text-[15px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none"
                />
              </div>

              <p className="text-[13px] text-[color:var(--ad-faint)]">
                오늘 날짜({new Date().toLocaleDateString('ko-KR')})로 기록됩니다.
              </p>
            </div>

            <div className="mt-6 flex gap-2">
              <button
                onClick={() => setShowRevenueModal(false)}
                className="ad-press h-11 flex-1 rounded-[10px] bg-[color:var(--ad-bg)] text-[14px] font-medium text-[color:var(--ad-ink-2)] hover:bg-[#ebeced]"
              >
                취소
              </button>
              <button
                onClick={addExternalRevenue}
                disabled={isAddingRevenue || !revenueAmount}
                className="ad-press flex h-11 flex-1 items-center justify-center gap-2 rounded-[10px] bg-[color:var(--ad-yellow)] text-[14px] font-semibold text-[color:var(--ad-ink)] hover:bg-[color:var(--ad-yellow-strong)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isAddingRevenue ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    추가 중...
                  </>
                ) : (
                  '추가'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
