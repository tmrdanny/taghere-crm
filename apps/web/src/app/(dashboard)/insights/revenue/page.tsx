'use client';

import { API_BASE } from '@/lib/api-config';
import { useState, useEffect } from 'react';
import {
  TrendingUp,
  DollarSign,
  Gift,
  Users,
  RefreshCw,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';


interface Channel {
  name: string;
  revenue: number;
  couponsUsed: number;
}

interface MonthlyTrend {
  month: string;
  revenue: number;
  cost: number;
}

interface CostEffectiveness {
  name: string;
  cost: number;
  revenue: number;
  roi: number;
}

interface RevenueData {
  totalRevenue: number;
  totalCost: number;
  roi: number;
  couponUsageRate: number;
  activeCustomers: number;
  channels: Channel[];
  monthlyTrend: MonthlyTrend[];
  costEffectiveness: CostEffectiveness[];
  summary: {
    automationSent: number;
    couponsSent: number;
    couponsUsed: number;
  };
}

export default function RevenuePage() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/insights/revenue`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (error) {
      console.error('Failed to fetch revenue data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 sm:px-8 lg:pt-8">
        <div className="py-12 text-center text-[13px] text-[color:var(--ad-faint)]">불러오는 중...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 sm:px-8 lg:pt-8">
        <div className="py-12 text-center text-[13px] text-[color:var(--ad-faint)]">데이터를 불러올 수 없습니다.</div>
      </div>
    );
  }

  const hasData = data.totalRevenue > 0 || data.totalCost > 0 || data.summary.couponsSent > 0;

  // 월별 추이 차트 최대값
  const maxRevenue = Math.max(...data.monthlyTrend.map((m) => m.revenue), 1);

  // 채널별 최대값
  const maxChannelRevenue = Math.max(...data.channels.map((c) => c.revenue), 1);

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 sm:px-8 lg:pt-8">
      {/* 헤더 */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-[color:var(--ad-ink)]">매출 기여 분석</h1>
          <p className="mt-1 text-[13px] text-[color:var(--ad-muted)]">
            CRM이 만들어낸 추가 매출을 분석합니다 (이번 달)
          </p>
        </div>
        <button
          onClick={fetchData}
          className="ad-press inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] bg-white px-3.5 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
        >
          <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.8} />
          새로고침
        </button>
      </div>

      {!hasData ? (
        <div className="ad-card px-5 py-10">
          <div className="text-center">
            <DollarSign className="mx-auto mb-3 h-8 w-8 text-[color:var(--ad-line-strong)]" strokeWidth={1.7} />
            <h3 className="mb-2 text-[14px] font-semibold text-[color:var(--ad-ink-2)]">아직 매출 데이터가 없습니다</h3>
            <p className="mx-auto max-w-md text-[13px] text-[color:var(--ad-muted)]">
              자동 마케팅을 활성화하고 쿠폰이 사용되면 매출 기여 데이터가 표시됩니다.
              쿠폰 사용 시 결제 금액이 기록되어야 정확한 분석이 가능합니다.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* 핵심 지표 카드 */}
          <div className="ad-card grid grid-cols-2 md:grid-cols-4">
            <div className="p-5">
              <div className="mb-1 flex items-center gap-1.5 text-[12px] text-[color:var(--ad-muted)]">
                <DollarSign className="h-3.5 w-3.5" />
                <span>CRM 추가 매출</span>
              </div>
              <div className="ad-tnum text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">
                {data.totalRevenue > 0 ? `${data.totalRevenue.toLocaleString()}원` : '-'}
              </div>
            </div>
            <div className="border-l border-[color:var(--ad-line)] p-5">
              <div className="mb-1 flex items-center gap-1.5 text-[12px] text-[color:var(--ad-muted)]">
                <TrendingUp className="h-3.5 w-3.5" />
                <span>CRM ROI</span>
              </div>
              <div className="ad-tnum text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">
                {data.roi > 0 ? `${data.roi}x` : '-'}
              </div>
              {data.roi > 0 && (
                <div className="mt-0.5 text-[12px] text-[color:var(--ad-faint)]">투자 대비 {data.roi}배 매출</div>
              )}
            </div>
            <div className="border-t border-[color:var(--ad-line)] p-5 md:border-l md:border-t-0">
              <div className="mb-1 flex items-center gap-1.5 text-[12px] text-[color:var(--ad-muted)]">
                <Gift className="h-3.5 w-3.5" />
                <span>쿠폰 사용률</span>
              </div>
              <div className="ad-tnum text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">
                {data.couponUsageRate > 0 ? `${data.couponUsageRate}%` : '-'}
              </div>
              <div className="ad-tnum mt-0.5 text-[12px] text-[color:var(--ad-faint)]">
                {data.summary.couponsUsed}/{data.summary.couponsSent}건
              </div>
            </div>
            <div className="border-l border-t border-[color:var(--ad-line)] p-5 md:border-t-0">
              <div className="mb-1 flex items-center gap-1.5 text-[12px] text-[color:var(--ad-muted)]">
                <Users className="h-3.5 w-3.5" />
                <span>활성 고객</span>
              </div>
              <div className="ad-tnum text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">{data.activeCustomers}명</div>
              <div className="mt-0.5 text-[12px] text-[color:var(--ad-faint)]">최근 30일 방문</div>
            </div>
          </div>

          {/* 채널별 매출 기여 */}
          {data.channels.length > 0 && (
            <div className="ad-card p-5">
              <h3 className="mb-4 text-[14px] font-semibold text-[color:var(--ad-ink)]">채널별 매출 기여</h3>
              <div className="space-y-3">
                {data.channels.map((ch) => (
                  <div key={ch.name} className="flex items-center gap-3">
                    <div className="w-32 flex-shrink-0 text-[13px] text-[color:var(--ad-ink-2)]">{ch.name}</div>
                    <div className="relative h-7 flex-1 overflow-hidden rounded-md bg-[color:var(--ad-bg)]">
                      <div
                        className="h-full rounded-md bg-[#6eadff] transition-all duration-500"
                        style={{
                          width: `${Math.max((ch.revenue / maxChannelRevenue) * 100, ch.revenue > 0 ? 3 : 0)}%`,
                        }}
                      />
                    </div>
                    <div className="ad-tnum w-28 flex-shrink-0 text-right text-[13px] font-medium text-[color:var(--ad-ink)]">
                      {ch.revenue > 0 ? `${ch.revenue.toLocaleString()}원` : `${ch.couponsUsed}건 사용`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 월별 매출 추이 */}
          <div className="ad-card p-5">
            <h3 className="mb-4 text-[14px] font-semibold text-[color:var(--ad-ink)]">월별 CRM 매출 추이</h3>
            <div className="flex h-40 items-end gap-2">
              {data.monthlyTrend.map((m) => {
                const height = maxRevenue > 0 ? (m.revenue / maxRevenue) * 100 : 0;
                const monthLabel = m.month.split('-')[1] + '월';
                return (
                  <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                    <div className="ad-tnum text-[11.5px] text-[color:var(--ad-muted)]">
                      {m.revenue > 0 ? `${(m.revenue / 10000).toFixed(0)}만` : '-'}
                    </div>
                    <div className="flex w-full items-end justify-center" style={{ height: '100px' }}>
                      <div
                        className={cn(
                          'w-full max-w-10 rounded-t-md transition-all duration-500',
                          m.revenue > 0 ? 'bg-[#6eadff]' : 'bg-[color:var(--ad-line)]'
                        )}
                        style={{ height: `${Math.max(height, m.revenue > 0 ? 4 : 2)}%` }}
                      />
                    </div>
                    <div className="text-[11.5px] text-[color:var(--ad-muted)]">{monthLabel}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 비용 대비 효과 */}
          <div className="ad-card overflow-hidden">
            <div className="px-5 pb-3 pt-5">
              <h3 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">비용 대비 효과</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-y border-[color:var(--ad-line)] bg-[color:var(--ad-bg-alt)] text-left text-[11.5px] text-[color:var(--ad-muted)]">
                    <th className="px-4 py-2.5 text-left font-medium">항목</th>
                    <th className="px-4 py-2.5 text-right font-medium">비용</th>
                    <th className="px-4 py-2.5 text-right font-medium">매출 기여</th>
                    <th className="px-4 py-2.5 text-right font-medium">ROI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--ad-line)] text-[13px]">
                  {data.costEffectiveness.map((item) => (
                    <tr key={item.name} className="hover:bg-[color:var(--ad-bg-alt)]">
                      <td className="px-4 py-2.5 text-[color:var(--ad-ink)]">{item.name}</td>
                      <td className="ad-tnum px-4 py-2.5 text-right text-[color:var(--ad-muted)]">
                        {item.cost > 0 ? `${item.cost.toLocaleString()}원` : '-'}
                      </td>
                      <td className="ad-tnum px-4 py-2.5 text-right text-[color:var(--ad-ink)]">
                        {item.revenue > 0 ? `${item.revenue.toLocaleString()}원` : '-'}
                      </td>
                      <td className="ad-tnum px-4 py-2.5 text-right font-medium">
                        {item.roi > 0 ? (
                          <span className="text-[color:var(--ad-pos)]">{item.roi}x</span>
                        ) : (
                          <span className="text-[color:var(--ad-faint)]">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {/* 합계 */}
                  <tr className="bg-[color:var(--ad-bg-alt)] font-semibold">
                    <td className="px-4 py-2.5 text-[color:var(--ad-ink)]">합계</td>
                    <td className="ad-tnum px-4 py-2.5 text-right text-[color:var(--ad-ink)]">
                      {data.totalCost > 0 ? `${data.totalCost.toLocaleString()}원` : '-'}
                    </td>
                    <td className="ad-tnum px-4 py-2.5 text-right text-[color:var(--ad-ink)]">
                      {data.totalRevenue > 0 ? `${data.totalRevenue.toLocaleString()}원` : '-'}
                    </td>
                    <td className="ad-tnum px-4 py-2.5 text-right">
                      {data.roi > 0 ? (
                        <span className="text-[color:var(--ad-pos)]">{data.roi}x</span>
                      ) : (
                        <span className="text-[color:var(--ad-faint)]">-</span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {data.roi > 0 && (
              <div className="m-5 flex items-start gap-2 rounded-[12px] bg-[color:var(--ad-bg-alt)] px-4 py-3 text-[13px] text-[color:var(--ad-muted)]">
                <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                <p>CRM에 1원 투자할 때마다 {data.roi}원의 매출이 발생합니다.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 안내 */}
      <div className="mt-4 flex items-start gap-2 rounded-[12px] bg-[color:var(--ad-bg-alt)] px-4 py-3 text-[13px] text-[color:var(--ad-muted)]">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
        <p>
          매출 기여는 자동 마케팅 쿠폰이 사용되고 결제 금액이 기록된 경우에만 집계됩니다.
          쿠폰 사용 시 직원이 확인 처리하면 매출 데이터가 자동으로 반영됩니다.
        </p>
      </div>
    </div>
  );
}
