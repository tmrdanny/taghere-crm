'use client';

import { useState, useEffect } from 'react';
import {
  TrendingUp,
  DollarSign,
  Gift,
  Users,
  RefreshCw,
  Info,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

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
      const res = await fetch(`${apiUrl}/api/insights/revenue`, {
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
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        <div className="text-center py-12 text-neutral-500">불러오는 중...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        <div className="text-center py-12 text-neutral-500">데이터를 불러올 수 없습니다.</div>
      </div>
    );
  }

  const hasData = data.totalRevenue > 0 || data.totalCost > 0 || data.summary.couponsSent > 0;

  // 월별 추이 차트 최대값
  const maxRevenue = Math.max(...data.monthlyTrend.map((m) => m.revenue), 1);

  // 채널별 최대값
  const maxChannelRevenue = Math.max(...data.channels.map((c) => c.revenue), 1);

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">매출 기여 분석</h1>
          <p className="text-neutral-500 mt-1">
            CRM이 만들어낸 추가 매출을 분석합니다 (이번 달)
          </p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-600 hover:text-neutral-900 border rounded-lg hover:bg-neutral-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          새로고침
        </button>
      </div>

      {!hasData ? (
        <Card>
          <CardContent className="pt-8 pb-8">
            <div className="text-center">
              <DollarSign className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-neutral-700 mb-2">아직 매출 데이터가 없습니다</h3>
              <p className="text-sm text-neutral-500 max-w-md mx-auto">
                자동 마케팅을 활성화하고 쿠폰이 사용되면 매출 기여 데이터가 표시됩니다.
                쿠폰 사용 시 결제 금액이 기록되어야 정확한 분석이 가능합니다.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 핵심 지표 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-1.5 text-neutral-500 text-xs mb-1">
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>CRM 추가 매출</span>
                </div>
                <div className="text-xl font-bold text-neutral-900">
                  {data.totalRevenue > 0 ? `${data.totalRevenue.toLocaleString()}원` : '-'}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-1.5 text-neutral-500 text-xs mb-1">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>CRM ROI</span>
                </div>
                <div className="text-xl font-bold text-neutral-900">
                  {data.roi > 0 ? `${data.roi}x` : '-'}
                </div>
                {data.roi > 0 && (
                  <div className="text-xs text-neutral-400">투자 대비 {data.roi}배 매출</div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-1.5 text-neutral-500 text-xs mb-1">
                  <Gift className="w-3.5 h-3.5" />
                  <span>쿠폰 사용률</span>
                </div>
                <div className="text-xl font-bold text-neutral-900">
                  {data.couponUsageRate > 0 ? `${data.couponUsageRate}%` : '-'}
                </div>
                <div className="text-xs text-neutral-400">
                  {data.summary.couponsUsed}/{data.summary.couponsSent}건
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-1.5 text-neutral-500 text-xs mb-1">
                  <Users className="w-3.5 h-3.5" />
                  <span>활성 고객</span>
                </div>
                <div className="text-xl font-bold text-neutral-900">{data.activeCustomers}명</div>
                <div className="text-xs text-neutral-400">최근 30일 방문</div>
              </CardContent>
            </Card>
          </div>

          {/* 채널별 매출 기여 */}
          {data.channels.length > 0 && (
            <Card className="mb-6">
              <CardContent className="pt-6">
                <h3 className="font-medium text-neutral-900 mb-4">채널별 매출 기여</h3>
                <div className="space-y-3">
                  {data.channels.map((ch) => (
                    <div key={ch.name} className="flex items-center gap-3">
                      <div className="w-32 text-sm text-neutral-600 flex-shrink-0">{ch.name}</div>
                      <div className="flex-1 h-8 bg-neutral-100 rounded-md overflow-hidden relative">
                        <div
                          className="h-full bg-brand-500 rounded-md transition-all duration-500"
                          style={{
                            width: `${Math.max((ch.revenue / maxChannelRevenue) * 100, ch.revenue > 0 ? 3 : 0)}%`,
                          }}
                        />
                      </div>
                      <div className="w-28 text-right text-sm font-medium text-neutral-900 flex-shrink-0">
                        {ch.revenue > 0 ? `${ch.revenue.toLocaleString()}원` : `${ch.couponsUsed}건 사용`}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 월별 매출 추이 */}
          <Card className="mb-6">
            <CardContent className="pt-6">
              <h3 className="font-medium text-neutral-900 mb-4">월별 CRM 매출 추이</h3>
              <div className="flex items-end gap-2 h-40">
                {data.monthlyTrend.map((m) => {
                  const height = maxRevenue > 0 ? (m.revenue / maxRevenue) * 100 : 0;
                  const monthLabel = m.month.split('-')[1] + '월';
                  return (
                    <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                      <div className="text-xs text-neutral-500">
                        {m.revenue > 0 ? `${(m.revenue / 10000).toFixed(0)}만` : '-'}
                      </div>
                      <div className="w-full flex items-end justify-center" style={{ height: '100px' }}>
                        <div
                          className={cn(
                            'w-full max-w-10 rounded-t-md transition-all duration-500',
                            m.revenue > 0 ? 'bg-brand-400' : 'bg-neutral-200'
                          )}
                          style={{ height: `${Math.max(height, m.revenue > 0 ? 4 : 2)}%` }}
                        />
                      </div>
                      <div className="text-xs text-neutral-500">{monthLabel}</div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* 비용 대비 효과 */}
          <Card className="mb-6">
            <CardContent className="pt-6">
              <h3 className="font-medium text-neutral-900 mb-4">비용 대비 효과</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-neutral-500">
                      <th className="text-left py-2 px-3 font-medium">항목</th>
                      <th className="text-right py-2 px-3 font-medium">비용</th>
                      <th className="text-right py-2 px-3 font-medium">매출 기여</th>
                      <th className="text-right py-2 px-3 font-medium">ROI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.costEffectiveness.map((item) => (
                      <tr key={item.name} className="border-b">
                        <td className="py-2.5 px-3 text-neutral-900">{item.name}</td>
                        <td className="py-2.5 px-3 text-right text-neutral-600">
                          {item.cost > 0 ? `${item.cost.toLocaleString()}원` : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right text-neutral-900">
                          {item.revenue > 0 ? `${item.revenue.toLocaleString()}원` : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium">
                          {item.roi > 0 ? (
                            <span className="text-green-600">{item.roi}x</span>
                          ) : (
                            <span className="text-neutral-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {/* 합계 */}
                    <tr className="font-medium">
                      <td className="py-2.5 px-3 text-neutral-900">합계</td>
                      <td className="py-2.5 px-3 text-right text-neutral-900">
                        {data.totalCost > 0 ? `${data.totalCost.toLocaleString()}원` : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right text-neutral-900">
                        {data.totalRevenue > 0 ? `${data.totalRevenue.toLocaleString()}원` : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {data.roi > 0 ? (
                          <span className="text-green-600">{data.roi}x</span>
                        ) : (
                          <span className="text-neutral-400">-</span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {data.roi > 0 && (
                <div className="mt-4 flex items-start gap-2 text-sm text-brand-700 bg-brand-50 rounded-lg p-3">
                  <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <p>CRM에 1원 투자할 때마다 {data.roi}원의 매출이 발생합니다.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* 안내 */}
      <div className="mt-4 flex items-start gap-2 text-sm text-neutral-500 bg-neutral-50 rounded-lg p-4">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <p>
          매출 기여는 자동 마케팅 쿠폰이 사용되고 결제 금액이 기록된 경우에만 집계됩니다.
          쿠폰 사용 시 직원이 확인 처리하면 매출 데이터가 자동으로 반영됩니다.
        </p>
      </div>
    </div>
  );
}
