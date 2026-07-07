'use client';

import { API_BASE } from '@/lib/api-config';
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessagesSquare, Megaphone, Send, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UsageTransaction {
  id: string;
  createdAt: string;
  amount: number;
  category: string;
  categoryLabel: string;
  description: string;
}

interface UsageHistory {
  balance: number;
  summary: {
    topupTotal: number;
    usedTotal: number;
    refundTotal: number;
    byCategory: Record<string, { count: number; amount: number }>;
  };
  transactions: UsageTransaction[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const PERIOD_OPTIONS = [
  { value: '7days', label: '최근 7일' },
  { value: '30days', label: '최근 30일' },
  { value: '90days', label: '최근 90일' },
  { value: 'all', label: '전체 기간' },
];

const CATEGORY_FILTERS = [
  { value: 'all', label: '전체' },
  { value: 'alimtalk', label: '알림톡' },
  { value: 'brand_message', label: '광고톡' },
  { value: 'sms', label: '문자메시지' },
  { value: 'topup', label: '충전' },
  { value: 'refund', label: '환불' },
];

const CATEGORY_BADGE_STYLES: Record<string, string> = {
  alimtalk: 'bg-blue-50 text-blue-700',
  brand_message: 'bg-pink-50 text-pink-700',
  sms: 'bg-orange-50 text-orange-700',
  topup: 'bg-emerald-50 text-emerald-700',
  refund: 'bg-amber-50 text-amber-700',
  subscription: 'bg-neutral-100 text-neutral-600',
  booster: 'bg-purple-50 text-purple-700',
  deduct: 'bg-red-50 text-red-700',
  etc: 'bg-neutral-100 text-neutral-600',
};

export default function WalletHistoryPage() {
  const apiUrl = API_BASE;
  const [data, setData] = useState<UsageHistory | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState('30days');
  const [category, setCategory] = useState('all');
  const [page, setPage] = useState(1);

  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({ period, category, page: String(page), limit: '30' });
      const res = await fetch(`${apiUrl}/api/wallet/usage-history?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setData(await res.json());
      }
    } catch (e) {
      console.error('Failed to fetch usage history:', e);
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl, period, category, page]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const formatAmount = (n: number) =>
    `${n > 0 ? '+' : ''}${n.toLocaleString()}원`;

  const alimtalk = data?.summary.byCategory.alimtalk ?? { count: 0, amount: 0 };
  const brandMessage = data?.summary.byCategory.brand_message ?? { count: 0, amount: 0 };
  const sms = data?.summary.byCategory.sms ?? { count: 0, amount: 0 };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">사용내역</h1>
          <p className="text-sm text-neutral-500 mt-1">알림톡·광고톡·문자메시지 등 누적 사용 내역을 확인합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="border border-neutral-200 rounded-lg text-sm text-neutral-700 px-3 py-2 bg-white"
            value={period}
            onChange={(e) => { setPeriod(e.target.value); setPage(1); }}
          >
            {PERIOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <Button variant="secondary" size="sm" onClick={fetchHistory}>
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Usage Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-blue-50 rounded-lg"><MessagesSquare className="w-5 h-5 text-blue-600" /></div>
              <span className="text-sm text-neutral-500">알림톡</span>
            </div>
            <p className="text-2xl font-bold text-neutral-900">{alimtalk.amount.toLocaleString()}원</p>
            <p className="text-xs text-neutral-400 mt-1">{alimtalk.count.toLocaleString()}건</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-pink-50 rounded-lg"><Megaphone className="w-5 h-5 text-pink-600" /></div>
              <span className="text-sm text-neutral-500">광고톡</span>
            </div>
            <p className="text-2xl font-bold text-neutral-900">{brandMessage.amount.toLocaleString()}원</p>
            <p className="text-xs text-neutral-400 mt-1">{brandMessage.count.toLocaleString()}건</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 bg-orange-50 rounded-lg"><Send className="w-5 h-5 text-orange-600" /></div>
              <span className="text-sm text-neutral-500">문자메시지</span>
            </div>
            <p className="text-2xl font-bold text-neutral-900">{sms.amount.toLocaleString()}원</p>
            <p className="text-xs text-neutral-400 mt-1">{sms.count.toLocaleString()}건</p>
          </CardContent>
        </Card>
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        {CATEGORY_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => { setCategory(f.value); setPage(1); }}
            className={cn(
              'px-3 py-1.5 rounded-full text-sm font-medium transition-colors border',
              category === f.value
                ? 'bg-brand-800 text-white border-brand-800'
                : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'
            )}
          >
            {f.label}
            {data?.summary.byCategory[f.value] && f.value !== 'all' && (
              <span className="ml-1 text-xs opacity-70">
                {data.summary.byCategory[f.value].count.toLocaleString()}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Transaction Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50">
                <th className="p-4 text-left text-xs font-medium text-neutral-500 uppercase">일시</th>
                <th className="p-4 text-left text-xs font-medium text-neutral-500 uppercase">구분</th>
                <th className="p-4 text-left text-xs font-medium text-neutral-500 uppercase">내용</th>
                <th className="p-4 text-right text-xs font-medium text-neutral-500 uppercase">금액</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {isLoading ? (
                <tr><td colSpan={4} className="p-8 text-center text-neutral-400">불러오는 중...</td></tr>
              ) : !data || data.transactions.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center text-neutral-400">해당 기간에 내역이 없습니다.</td></tr>
              ) : (
                data.transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-neutral-50">
                    <td className="p-4 text-sm text-neutral-600 whitespace-nowrap">
                      {new Date(tx.createdAt).toLocaleString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="p-4">
                      <span className={cn('inline-block px-2 py-0.5 rounded-full text-xs font-medium', CATEGORY_BADGE_STYLES[tx.category] || CATEGORY_BADGE_STYLES.etc)}>
                        {tx.categoryLabel}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-neutral-500">{tx.description || '-'}</td>
                    <td className={cn('p-4 text-sm font-semibold text-right whitespace-nowrap', tx.amount > 0 ? 'text-emerald-600' : 'text-neutral-900')}>
                      {formatAmount(tx.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-neutral-200">
            <span className="text-sm text-neutral-500">
              총 {data.pagination.total.toLocaleString()}건
            </span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                이전
              </Button>
              <span className="text-sm text-neutral-600">{page} / {data.pagination.totalPages}</span>
              <Button variant="secondary" size="sm" disabled={page >= data.pagination.totalPages} onClick={() => setPage((p) => p + 1)}>
                다음
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
