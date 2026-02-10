'use client';

import { useState, useEffect } from 'react';
import { Users, Star, Heart, TrendingUp, UserPlus, AlertTriangle, Moon, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface SegmentData {
  type: string;
  label: string;
  count: number;
  percentage: number;
}

interface CustomerItem {
  id: string;
  name: string | null;
  phone: string | null;
  visitCount: number;
  totalPoints: number;
  lastVisitAt: string | null;
  recencyDays: number;
  segment: string;
}

interface SegmentResponse {
  totalCustomers: number;
  segments: SegmentData[];
  customers?: CustomerItem[];
}

const SEGMENT_META: Record<string, { icon: React.ElementType; color: string; bgColor: string; badgeColor: string }> = {
  VIP: { icon: Star, color: 'text-amber-600', bgColor: 'bg-amber-50', badgeColor: 'bg-amber-100 text-amber-700' },
  REGULAR: { icon: Heart, color: 'text-emerald-600', bgColor: 'bg-emerald-50', badgeColor: 'bg-emerald-100 text-emerald-700' },
  GROWING: { icon: TrendingUp, color: 'text-blue-600', bgColor: 'bg-blue-50', badgeColor: 'bg-blue-100 text-blue-700' },
  NEW: { icon: UserPlus, color: 'text-violet-600', bgColor: 'bg-violet-50', badgeColor: 'bg-violet-100 text-violet-700' },
  AT_RISK: { icon: AlertTriangle, color: 'text-orange-600', bgColor: 'bg-orange-50', badgeColor: 'bg-orange-100 text-orange-700' },
  CHURNED: { icon: Moon, color: 'text-neutral-500', bgColor: 'bg-neutral-100', badgeColor: 'bg-neutral-200 text-neutral-600' },
};

export default function SegmentsPage() {
  const [data, setData] = useState<SegmentResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSegment, setSelectedSegment] = useState<string | null>(null);
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  useEffect(() => {
    fetchSegments();
  }, []);

  const fetchSegments = async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`${apiUrl}/api/insights/segments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (error) {
      console.error('Failed to fetch segments:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSegmentCustomers = async (segment: string) => {
    setSelectedSegment(segment);
    setLoadingCustomers(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${apiUrl}/api/insights/segments?segment=${segment}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setCustomers(json.customers || []);
      }
    } catch (error) {
      console.error('Failed to fetch segment customers:', error);
    } finally {
      setLoadingCustomers(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 max-w-5xl mx-auto">
        <div className="text-center py-12 text-neutral-500">불러오는 중...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 lg:p-8 max-w-5xl mx-auto">
        <div className="text-center py-12 text-neutral-500">데이터를 불러올 수 없습니다.</div>
      </div>
    );
  }

  // 도넛 차트용 데이터
  const donutSegments = data.segments.filter((s) => s.count > 0);
  const donutColors: Record<string, string> = {
    VIP: '#d97706',
    REGULAR: '#059669',
    GROWING: '#2563eb',
    NEW: '#7c3aed',
    AT_RISK: '#ea580c',
    CHURNED: '#a3a3a3',
  };

  // SVG 도넛 차트 계산
  const total = data.totalCustomers || 1;
  let cumulativePercent = 0;
  const donutArcs = donutSegments.map((seg) => {
    const percent = seg.count / total;
    const startAngle = cumulativePercent * 2 * Math.PI - Math.PI / 2;
    cumulativePercent += percent;
    const endAngle = cumulativePercent * 2 * Math.PI - Math.PI / 2;
    const largeArc = percent > 0.5 ? 1 : 0;
    const r = 60;
    const x1 = 80 + r * Math.cos(startAngle);
    const y1 = 80 + r * Math.sin(startAngle);
    const x2 = 80 + r * Math.cos(endAngle);
    const y2 = 80 + r * Math.sin(endAngle);
    return {
      type: seg.type,
      d: `M 80 80 L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`,
      color: donutColors[seg.type] || '#a3a3a3',
    };
  });

  const selectedMeta = selectedSegment ? SEGMENT_META[selectedSegment] : null;
  const selectedLabel = data.segments.find((s) => s.type === selectedSegment)?.label || '';

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">고객 세그먼트</h1>
          <p className="text-neutral-500 mt-1">
            RFM 분석 기반으로 고객을 자동 분류합니다 (총 {data.totalCustomers}명)
          </p>
        </div>
        <button
          onClick={fetchSegments}
          className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-600 hover:text-neutral-900 border rounded-lg hover:bg-neutral-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          새로고침
        </button>
      </div>

      {/* 세그먼트 요약 카드 (6개) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {data.segments.map((seg) => {
          const meta = SEGMENT_META[seg.type];
          const Icon = meta?.icon || Users;
          const isSelected = selectedSegment === seg.type;

          return (
            <Card
              key={seg.type}
              className={cn(
                'cursor-pointer transition-all hover:shadow-md',
                isSelected && 'ring-2 ring-brand-500'
              )}
              onClick={() => fetchSegmentCustomers(seg.type)}
            >
              <CardContent className="pt-4 pb-3 px-4">
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-2', meta?.bgColor)}>
                  <Icon className={cn('w-4 h-4', meta?.color)} />
                </div>
                <div className="text-xs text-neutral-500 mb-0.5">{seg.label}</div>
                <div className="text-xl font-bold text-neutral-900">{seg.count}명</div>
                <div className="text-xs text-neutral-400">{seg.percentage}%</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 세그먼트 분포 도넛 차트 */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <h3 className="font-medium text-neutral-900 mb-4">세그먼트 분포</h3>
          <div className="flex items-center justify-center gap-8">
            {/* 도넛 차트 */}
            <div className="relative">
              <svg width="160" height="160" viewBox="0 0 160 160">
                {donutArcs.length > 0 ? (
                  donutArcs.map((arc, i) => (
                    <path
                      key={i}
                      d={arc.d}
                      fill={arc.color}
                      stroke="white"
                      strokeWidth="2"
                      className="cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => fetchSegmentCustomers(arc.type)}
                    />
                  ))
                ) : (
                  <circle cx="80" cy="80" r="60" fill="#e5e5e5" />
                )}
                <circle cx="80" cy="80" r="35" fill="white" />
                <text x="80" y="75" textAnchor="middle" className="text-xs fill-neutral-500">
                  총 고객
                </text>
                <text x="80" y="95" textAnchor="middle" className="text-lg font-bold fill-neutral-900">
                  {data.totalCustomers}
                </text>
              </svg>
            </div>

            {/* 범례 */}
            <div className="space-y-2">
              {data.segments.map((seg) => (
                <div
                  key={seg.type}
                  className="flex items-center gap-2 cursor-pointer hover:bg-neutral-50 px-2 py-1 rounded transition-colors"
                  onClick={() => fetchSegmentCustomers(seg.type)}
                >
                  <div
                    className="w-3 h-3 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: donutColors[seg.type] }}
                  />
                  <span className="text-sm text-neutral-700">{seg.label}</span>
                  <span className="text-sm font-medium text-neutral-900">{seg.count}명</span>
                  <span className="text-xs text-neutral-400">({seg.percentage}%)</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 세그먼트별 상세 (선택 시) */}
      {selectedSegment && selectedMeta && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', selectedMeta.bgColor)}>
                <selectedMeta.icon className={cn('w-4 h-4', selectedMeta.color)} />
              </div>
              <h3 className="font-medium text-neutral-900">
                {selectedLabel} 고객 ({customers.length}명)
              </h3>
            </div>

            {loadingCustomers ? (
              <div className="text-center py-8 text-neutral-500">불러오는 중...</div>
            ) : customers.length === 0 ? (
              <div className="text-center py-8 text-neutral-400">해당 세그먼트에 고객이 없습니다.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-neutral-500">
                      <th className="text-left py-2 px-3 font-medium">이름</th>
                      <th className="text-left py-2 px-3 font-medium">연락처</th>
                      <th className="text-right py-2 px-3 font-medium">방문 횟수</th>
                      <th className="text-right py-2 px-3 font-medium">누적 포인트</th>
                      <th className="text-right py-2 px-3 font-medium">마지막 방문</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c) => (
                      <tr key={c.id} className="border-b last:border-b-0 hover:bg-neutral-50">
                        <td className="py-2.5 px-3 text-neutral-900">{c.name || '-'}</td>
                        <td className="py-2.5 px-3 text-neutral-600">
                          {c.phone ? `${c.phone.slice(0, 3)}****${c.phone.slice(-4)}` : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right text-neutral-900">{c.visitCount}회</td>
                        <td className="py-2.5 px-3 text-right text-neutral-900">
                          {c.totalPoints.toLocaleString()}P
                        </td>
                        <td className="py-2.5 px-3 text-right text-neutral-500">
                          {c.recencyDays === 999 ? '방문 없음' : `${c.recencyDays}일 전`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 세그먼트 설명 */}
      <div className="mt-6 bg-neutral-50 rounded-lg p-4">
        <h4 className="text-sm font-medium text-neutral-700 mb-2">세그먼트 분류 기준</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-neutral-500">
          <div><span className="font-medium">VIP:</span> 30일 내 방문, 10회+ 방문, 소비 상위 20%</div>
          <div><span className="font-medium">단골:</span> 45일 내 방문, 5~9회 방문</div>
          <div><span className="font-medium">성장 가능:</span> 30일 내 방문, 2~4회 방문</div>
          <div><span className="font-medium">신규:</span> 첫 방문 또는 1회 방문</div>
          <div><span className="font-medium">이탈 위험:</span> 45~90일 미방문, 2회+ 방문 이력</div>
          <div><span className="font-medium">이탈:</span> 90일 이상 미방문</div>
        </div>
      </div>
    </div>
  );
}
