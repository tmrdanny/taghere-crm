'use client';

import { API_BASE } from '@/lib/api-config';
import { useCallback, useEffect, useState } from 'react';
import { AnalyticsDashboard, AnalyticsData, StayTimeSummary } from '@/components/insights/AnalyticsDashboard';

// 인사이트 > 데이터 분석 (매장)
export default function StoreAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [days, setDays] = useState(90);
  const [stayTime, setStayTime] = useState<StayTimeSummary | null>(null);

  const fetchData = useCallback(async (d: number) => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/insights/analytics?days=${d}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setData(await res.json());
    } catch (e) {
      console.error('Failed to fetch analytics:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 평균 체류 시간은 별도 요청 — 실패해도 본 분석 데이터를 막지 않는다
  const fetchStayTime = useCallback(async (d: number) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/insights/stay-time?days=${d}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setStayTime(await res.json());
    } catch (e) {
      console.error('Failed to fetch stay time:', e);
    }
  }, []);

  useEffect(() => {
    fetchData(days);
    fetchStayTime(days);
  }, [days, fetchData, fetchStayTime]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">데이터 분석</h1>
        <p className="text-neutral-500 mt-1">
          시간대별 메뉴 판매량, 세그먼트별 객단가, 재방문 주기 등 매장 데이터를 깊이 있게 분석합니다.
        </p>
      </div>
      <AnalyticsDashboard data={data} isLoading={isLoading} days={days} onChangeDays={setDays} stayTime={stayTime} />
    </div>
  );
}
