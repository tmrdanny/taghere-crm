'use client';

import { useState, useEffect } from 'react';
import { Clock, Users, AlertCircle, TrendingDown, RefreshCw, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface Distribution {
  label: string;
  count: number;
}

interface VisitCycleData {
  avgCycleDays: number;
  analyzableCount: number;
  totalCustomers: number;
  distribution: Distribution[];
  peakRange: string;
  peakCount: number;
  nudgeTargets: {
    stage1: number;
    stage2: number;
    stage3: number;
  };
}

export default function VisitCyclePage() {
  const router = useRouter();
  const [data, setData] = useState<VisitCycleData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`${apiUrl}/api/insights/visit-cycle`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (error) {
      console.error('Failed to fetch visit cycle data:', error);
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

  // 히스토그램 최대값
  const maxCount = Math.max(...data.distribution.map((d) => d.count), 1);
  const totalNudge = data.nudgeTargets.stage1 + data.nudgeTargets.stage2 + data.nudgeTargets.stage3;

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">방문 주기 분석</h1>
          <p className="text-neutral-500 mt-1">
            고객별 평균 방문 주기를 분석하여 최적의 마케팅 타이밍을 파악합니다
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

      {/* 핵심 지표 */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 text-neutral-500 text-sm mb-2">
              <Clock className="w-4 h-4" />
              <span>매장 평균 방문 주기</span>
            </div>
            <div className="text-3xl font-bold text-neutral-900">
              {data.avgCycleDays > 0 ? `${data.avgCycleDays}일` : '-'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 text-neutral-500 text-sm mb-2">
              <Users className="w-4 h-4" />
              <span>분석 가능 고객</span>
            </div>
            <div className="text-3xl font-bold text-neutral-900">
              {data.analyzableCount}명
              <span className="text-sm font-normal text-neutral-500 ml-1">
                / {data.totalCustomers}명
              </span>
            </div>
            <div className="text-xs text-neutral-400 mt-1">3회 이상 방문 고객 기준</div>
          </CardContent>
        </Card>
      </div>

      {/* 방문 주기 분포 히스토그램 */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <h3 className="font-medium text-neutral-900 mb-1">방문 주기 분포</h3>
          <p className="text-sm text-neutral-500 mb-6">
            가장 많은 고객의 방문 주기: <span className="font-medium text-neutral-700">{data.peakRange}</span> ({data.peakCount}명)
          </p>

          {data.analyzableCount === 0 ? (
            <div className="text-center py-8 text-neutral-400">
              분석 가능한 고객이 없습니다. 3회 이상 방문한 고객이 있어야 분석이 가능합니다.
            </div>
          ) : (
            <div className="space-y-2">
              {data.distribution.map((d) => (
                <div key={d.label} className="flex items-center gap-3">
                  <div className="w-16 text-right text-sm text-neutral-600 flex-shrink-0">
                    {d.label}
                  </div>
                  <div className="flex-1 h-8 bg-neutral-100 rounded-md overflow-hidden relative">
                    <div
                      className="h-full bg-brand-500 rounded-md transition-all duration-500"
                      style={{
                        width: `${Math.max((d.count / maxCount) * 100, d.count > 0 ? 2 : 0)}%`,
                      }}
                    />
                    {d.count > 0 && (
                      <span className={cn(
                        'absolute top-1/2 -translate-y-1/2 text-xs font-medium',
                        (d.count / maxCount) > 0.3
                          ? 'text-white left-2'
                          : 'text-neutral-600 left-[calc(100%+8px)]'
                      )} style={{
                        left: (d.count / maxCount) > 0.3 ? '8px' : `${Math.max((d.count / maxCount) * 100, 2) + 1}%`,
                      }}>
                        {d.count}명
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 넛지 대상 현황 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-neutral-900">재방문 유도 대상 현황</h3>
            {totalNudge > 0 && (
              <span className="text-sm text-neutral-500">총 {totalNudge}명</span>
            )}
          </div>

          <div className="space-y-3">
            {/* 1단계 */}
            <div className="flex items-center gap-4 p-3 rounded-lg bg-blue-50">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <div className="font-medium text-neutral-900">1단계: 가벼운 리마인드</div>
                <div className="text-sm text-neutral-500">
                  평균 방문 주기 경과 (쿠폰 없이 안부 메시지)
                </div>
              </div>
              <div className="text-xl font-bold text-blue-600">{data.nudgeTargets.stage1}명</div>
            </div>

            {/* 2단계 */}
            <div className="flex items-center gap-4 p-3 rounded-lg bg-orange-50">
              <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
                <TrendingDown className="w-5 h-5 text-orange-600" />
              </div>
              <div className="flex-1">
                <div className="font-medium text-neutral-900">2단계: 쿠폰 유도</div>
                <div className="text-sm text-neutral-500">
                  평균 주기 x1.5 경과 (재방문 쿠폰 포함)
                </div>
              </div>
              <div className="text-xl font-bold text-orange-600">{data.nudgeTargets.stage2}명</div>
            </div>

            {/* 3단계 */}
            <div className="flex items-center gap-4 p-3 rounded-lg bg-red-50">
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <div className="flex-1">
                <div className="font-medium text-neutral-900">3단계: 최종 윈백</div>
                <div className="text-sm text-neutral-500">
                  평균 주기 x3 또는 90일+ 경과 (특별 할인 쿠폰)
                </div>
              </div>
              <div className="text-xl font-bold text-red-600">{data.nudgeTargets.stage3}명</div>
            </div>
          </div>

          {/* 자동화 연결 안내 */}
          <button
            onClick={() => router.push('/automation')}
            className="mt-4 w-full flex items-center justify-center gap-2 py-3 text-sm text-brand-600 hover:text-brand-700 border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors"
          >
            자동 마케팅 설정으로 이동
            <ArrowRight className="w-4 h-4" />
          </button>
        </CardContent>
      </Card>

      {/* 안내 */}
      <div className="mt-6 text-xs text-neutral-400 text-center">
        방문 주기는 포인트 적립 기록 기반으로 계산됩니다. 같은 날 중복 방문은 1회로 처리됩니다.
      </div>
    </div>
  );
}
