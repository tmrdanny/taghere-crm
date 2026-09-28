'use client';

import { API_BASE } from '@/lib/api-config';
import { useState, useEffect } from 'react';
import { Clock, Users, AlertCircle, TrendingDown, RefreshCw, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';


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
      const res = await fetch(`${API_BASE}/api/insights/visit-cycle`, {
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

  // 히스토그램 최대값
  const maxCount = Math.max(...data.distribution.map((d) => d.count), 1);
  const totalNudge = data.nudgeTargets.stage1 + data.nudgeTargets.stage2 + data.nudgeTargets.stage3;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 sm:px-8 lg:pt-8">
      {/* 헤더 */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-[color:var(--ad-ink)]">방문 주기 분석</h1>
          <p className="mt-1 text-[13px] text-[color:var(--ad-muted)]">
            고객별 평균 방문 주기를 분석하여 최적의 마케팅 타이밍을 파악합니다
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

      <div className="space-y-4">
        {/* 핵심 지표 */}
        <div className="ad-card grid grid-cols-2">
          <div className="p-5">
            <div className="mb-1 flex items-center gap-1.5 text-[12px] text-[color:var(--ad-muted)]">
              <Clock className="h-3.5 w-3.5" />
              <span>매장 평균 방문 주기</span>
            </div>
            <div className="ad-tnum text-[24px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">
              {data.avgCycleDays > 0 ? `${data.avgCycleDays}일` : '-'}
            </div>
          </div>
          <div className="border-l border-[color:var(--ad-line)] p-5">
            <div className="mb-1 flex items-center gap-1.5 text-[12px] text-[color:var(--ad-muted)]">
              <Users className="h-3.5 w-3.5" />
              <span>분석 가능 고객</span>
            </div>
            <div className="ad-tnum text-[24px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">
              {data.analyzableCount}명
              <span className="ml-1 text-[13px] font-normal tracking-normal text-[color:var(--ad-muted)]">
                / {data.totalCustomers}명
              </span>
            </div>
            <div className="mt-0.5 text-[12px] text-[color:var(--ad-faint)]">3회 이상 방문 고객 기준</div>
          </div>
        </div>

        {/* 방문 주기 분포 히스토그램 */}
        <div className="ad-card p-5">
          <h3 className="mb-1 text-[14px] font-semibold text-[color:var(--ad-ink)]">방문 주기 분포</h3>
          <p className="mb-5 text-[12.5px] text-[color:var(--ad-muted)]">
            가장 많은 고객의 방문 주기: <span className="font-medium text-[color:var(--ad-ink-2)]">{data.peakRange}</span> ({data.peakCount}명)
          </p>

          {data.analyzableCount === 0 ? (
            <div className="py-8 text-center text-[13px] text-[color:var(--ad-faint)]">
              분석 가능한 고객이 없습니다. 3회 이상 방문한 고객이 있어야 분석이 가능합니다.
            </div>
          ) : (
            <div className="space-y-2">
              {data.distribution.map((d) => (
                <div key={d.label} className="flex items-center gap-3">
                  <div className="w-16 flex-shrink-0 text-right text-[12.5px] text-[color:var(--ad-ink-2)]">
                    {d.label}
                  </div>
                  <div className="relative h-7 flex-1 overflow-hidden rounded-md bg-[color:var(--ad-bg)]">
                    <div
                      className="h-full rounded-md bg-[#6eadff] transition-all duration-500"
                      style={{
                        width: `${Math.max((d.count / maxCount) * 100, d.count > 0 ? 2 : 0)}%`,
                      }}
                    />
                    {d.count > 0 && (
                      <span className={cn(
                        'ad-tnum absolute top-1/2 -translate-y-1/2 text-[11.5px] font-medium',
                        (d.count / maxCount) > 0.3
                          ? 'text-[color:var(--ad-ink)] left-2'
                          : 'text-[color:var(--ad-ink-2)] left-[calc(100%+8px)]'
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
        </div>

        {/* 넛지 대상 현황 */}
        <div className="ad-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">재방문 유도 대상 현황</h3>
            {totalNudge > 0 && (
              <span className="ad-tnum text-[12.5px] text-[color:var(--ad-muted)]">총 {totalNudge}명</span>
            )}
          </div>

          <div className="divide-y divide-[color:var(--ad-line)] rounded-[12px] border border-[color:var(--ad-line)]">
            {/* 1단계 */}
            <div className="flex items-center gap-4 p-4">
              <AlertCircle className="h-4 w-4 flex-shrink-0 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
              <div className="flex-1">
                <div className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">1단계: 가벼운 리마인드</div>
                <div className="text-[12.5px] text-[color:var(--ad-muted)]">
                  평균 방문 주기 경과 (쿠폰 없이 안부 메시지)
                </div>
              </div>
              <div className="ad-tnum text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">{data.nudgeTargets.stage1}명</div>
            </div>

            {/* 2단계 */}
            <div className="flex items-center gap-4 p-4">
              <TrendingDown className="h-4 w-4 flex-shrink-0 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
              <div className="flex-1">
                <div className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">2단계: 쿠폰 유도</div>
                <div className="text-[12.5px] text-[color:var(--ad-muted)]">
                  평균 주기 x1.5 경과 (재방문 쿠폰 포함)
                </div>
              </div>
              <div className="ad-tnum text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">{data.nudgeTargets.stage2}명</div>
            </div>

            {/* 3단계 */}
            <div className="flex items-center gap-4 p-4">
              <AlertCircle className="h-4 w-4 flex-shrink-0 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
              <div className="flex-1">
                <div className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">3단계: 최종 윈백</div>
                <div className="text-[12.5px] text-[color:var(--ad-muted)]">
                  평균 주기 x3 또는 90일+ 경과 (특별 할인 쿠폰)
                </div>
              </div>
              <div className="ad-tnum text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">{data.nudgeTargets.stage3}명</div>
            </div>
          </div>

          {/* 자동화 연결 안내 */}
          <button
            onClick={() => router.push('/automation')}
            className="ad-press mt-4 flex h-10 w-full items-center justify-center gap-1.5 rounded-[12px] bg-[color:var(--ad-ink)] px-4 text-[13.5px] font-semibold text-white hover:bg-[#383c40] disabled:opacity-40"
          >
            자동 마케팅 설정으로 이동
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 안내 */}
      <div className="mt-6 text-center text-[12px] text-[color:var(--ad-faint)]">
        방문 주기는 포인트 적립 기록 기반으로 계산됩니다. 같은 날 중복 방문은 1회로 처리됩니다.
      </div>
    </div>
  );
}
