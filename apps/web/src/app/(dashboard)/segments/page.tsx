'use client';

import { API_BASE } from '@/lib/api-config';
import { useState, useEffect } from 'react';
import { Users, Star, Heart, TrendingUp, UserPlus, AlertTriangle, Moon, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { CustomSegmentsSection } from '@/features/segments/CustomSegmentsSection';


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
  VIP: { icon: Star, color: 'text-[color:var(--ad-faint)]', bgColor: '', badgeColor: 'bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)]' },
  REGULAR: { icon: Heart, color: 'text-[color:var(--ad-faint)]', bgColor: '', badgeColor: 'bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)]' },
  GROWING: { icon: TrendingUp, color: 'text-[color:var(--ad-faint)]', bgColor: '', badgeColor: 'bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)]' },
  NEW: { icon: UserPlus, color: 'text-[color:var(--ad-faint)]', bgColor: '', badgeColor: 'bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)]' },
  AT_RISK: { icon: AlertTriangle, color: 'text-[color:var(--ad-faint)]', bgColor: '', badgeColor: 'bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)]' },
  CHURNED: { icon: Moon, color: 'text-[color:var(--ad-faint)]', bgColor: '', badgeColor: 'bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)]' },
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
      const res = await fetch(`${API_BASE}/api/insights/segments`, {
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
      const res = await fetch(`${API_BASE}/api/insights/segments?segment=${segment}`, {
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

  // 도넛 차트용 데이터
  const donutSegments = data.segments.filter((s) => s.count > 0);
  const donutColors: Record<string, string> = {
    VIP: '#1d2022',
    REGULAR: '#2a2d62',
    GROWING: '#6eadff',
    NEW: '#a5ccff',
    AT_RISK: '#91959a',
    CHURNED: '#d1d3d6',
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
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 sm:px-8 lg:pt-8">
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-[color:var(--ad-ink)]">고객 세그먼트</h1>
      </div>

      <CustomSegmentsSection />

      {/* 자동 분류 (RFM) */}
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">자동 분류</h2>
          <p className="mt-0.5 text-[12px] text-[color:var(--ad-faint)]">
            RFM 분석 기반으로 고객을 자동 분류합니다 (총 {data.totalCustomers}명)
          </p>
        </div>
        <button
          onClick={fetchSegments}
          className="ad-press inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] bg-white px-3.5 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
        >
          <RefreshCw className="w-4 h-4" />
          새로고침
        </button>
      </div>

      {/* 세그먼트 요약 카드 (6개) */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {data.segments.map((seg) => {
          const meta = SEGMENT_META[seg.type];
          const Icon = meta?.icon || Users;
          const isSelected = selectedSegment === seg.type;

          return (
            <Card
              key={seg.type}
              className={cn(
                'ad-card ad-press cursor-pointer border-0 transition-shadow hover:shadow-[0_0_0_1px_var(--ad-line-strong)]',
                isSelected && 'shadow-[0_0_0_1px_var(--ad-ink)] hover:shadow-[0_0_0_1px_var(--ad-ink)]'
              )}
              onClick={() => fetchSegmentCustomers(seg.type)}
            >
              <CardContent className="p-4">
                <Icon className={cn('mb-2 h-4 w-4', meta?.color)} strokeWidth={1.8} />
                <div className="mb-0.5 text-[12px] text-[color:var(--ad-muted)]">{seg.label}</div>
                <div className="ad-tnum text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">{seg.count}명</div>
                <div className="ad-tnum text-[11.5px] text-[color:var(--ad-faint)]">{seg.percentage}%</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 세그먼트 분포 도넛 차트 */}
      <Card className="ad-card mb-4 border-0">
        <CardContent className="p-5">
          <h3 className="mb-4 text-[14px] font-semibold text-[color:var(--ad-ink)]">세그먼트 분포</h3>
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
                  <circle cx="80" cy="80" r="60" fill="#ebeced" />
                )}
                <circle cx="80" cy="80" r="35" fill="white" />
                <text x="80" y="75" textAnchor="middle" className="fill-[#55595e] text-[11px]">
                  총 고객
                </text>
                <text x="80" y="95" textAnchor="middle" className="fill-[#1d2022] text-[18px] font-medium">
                  {data.totalCustomers}
                </text>
              </svg>
            </div>

            {/* 범례 */}
            <div className="space-y-2">
              {data.segments.map((seg) => (
                <div
                  key={seg.type}
                  className="flex cursor-pointer items-center gap-2 rounded-[8px] px-2 py-1 transition-colors hover:bg-[color:var(--ad-bg-alt)]"
                  onClick={() => fetchSegmentCustomers(seg.type)}
                >
                  <div
                    className="w-3 h-3 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: donutColors[seg.type] }}
                  />
                  <span className="text-[13px] text-[color:var(--ad-ink-2)]">{seg.label}</span>
                  <span className="ad-tnum text-[13px] font-medium text-[color:var(--ad-ink)]">{seg.count}명</span>
                  <span className="ad-tnum text-[11.5px] text-[color:var(--ad-faint)]">({seg.percentage}%)</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 세그먼트별 상세 (선택 시) */}
      {selectedSegment && selectedMeta && (
        <Card className="ad-card overflow-hidden border-0">
          <CardContent className="p-0">
            <div className="flex items-center gap-2 px-5 pb-3 pt-5">
              <selectedMeta.icon className={cn('h-4 w-4', selectedMeta.color)} strokeWidth={1.8} />
              <h3 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">
                {selectedLabel} 고객 ({customers.length}명)
              </h3>
            </div>

            {loadingCustomers ? (
              <div className="py-10 text-center text-[13px] text-[color:var(--ad-faint)]">불러오는 중...</div>
            ) : customers.length === 0 ? (
              <div className="py-10 text-center text-[13px] text-[color:var(--ad-faint)]">해당 세그먼트에 고객이 없습니다.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-y border-[color:var(--ad-line)] bg-[color:var(--ad-bg-alt)] text-left text-[11.5px] text-[color:var(--ad-muted)]">
                      <th className="px-4 py-2.5 text-left font-medium">이름</th>
                      <th className="px-4 py-2.5 text-left font-medium">연락처</th>
                      <th className="px-4 py-2.5 text-right font-medium">방문 횟수</th>
                      <th className="px-4 py-2.5 text-right font-medium">누적 포인트</th>
                      <th className="px-4 py-2.5 text-right font-medium">마지막 방문</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--ad-line)]">
                    {customers.map((c) => (
                      <tr key={c.id} className="hover:bg-[color:var(--ad-bg-alt)]">
                        <td className="py-2.5 px-4 text-[color:var(--ad-ink)]">{c.name || '-'}</td>
                        <td className="ad-tnum py-2.5 px-4 text-[color:var(--ad-ink-2)]">
                          {c.phone ? `${c.phone.slice(0, 3)}****${c.phone.slice(-4)}` : '-'}
                        </td>
                        <td className="ad-tnum py-2.5 px-4 text-right text-[color:var(--ad-ink)]">{c.visitCount}회</td>
                        <td className="ad-tnum py-2.5 px-4 text-right text-[color:var(--ad-ink)]">
                          {c.totalPoints.toLocaleString()}P
                        </td>
                        <td className="py-2.5 px-4 text-right text-[color:var(--ad-muted)]">
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
      <div className="ad-card mt-4 p-5">
        <h4 className="mb-2 text-[14px] font-semibold text-[color:var(--ad-ink)]">세그먼트 분류 기준</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[12px] text-[color:var(--ad-muted)]">
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
