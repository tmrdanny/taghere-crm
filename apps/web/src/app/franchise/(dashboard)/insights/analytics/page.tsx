'use client';

import { API_BASE } from '@/lib/api-config';
import { useCallback, useEffect, useState } from 'react';
import { AnalyticsDashboard, AnalyticsData } from '@/components/insights/AnalyticsDashboard';

interface StoreOption {
  id: string;
  name: string;
}

// 프랜차이즈 인사이트 > 데이터 분석 (본사 전체 또는 가맹점별)
export default function FranchiseAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [days, setDays] = useState(90);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storeId, setStoreId] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('franchiseToken');
    fetch(`${API_BASE}/api/franchise/stores`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = (d?.stores || d || []).map((s: any) => ({ id: s.id, name: s.name }));
        setStores(list);
      })
      .catch(() => {});
  }, []);

  const fetchData = useCallback(async (d: number, sid: string) => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('franchiseToken');
      const qs = new URLSearchParams({ days: String(d) });
      if (sid) qs.set('storeId', sid);
      const res = await fetch(`${API_BASE}/api/franchise/insights/analytics?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setData(await res.json());
    } catch (e) {
      console.error('Failed to fetch analytics:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(days, storeId);
  }, [days, storeId, fetchData]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">데이터 분석</h1>
        <p className="text-sm text-neutral-500 mt-1">
          전 가맹점 합산 또는 가맹점별로 시간대별 메뉴 판매량, 세그먼트별 객단가, 재방문 주기를 분석합니다.
        </p>
      </div>
      <AnalyticsDashboard
        data={data}
        isLoading={isLoading}
        days={days}
        onChangeDays={setDays}
        headerRight={
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className="h-9 rounded-lg border border-neutral-200 bg-white px-3 text-sm focus:outline-none"
          >
            <option value="">전체 가맹점 합산</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        }
      />
    </div>
  );
}
