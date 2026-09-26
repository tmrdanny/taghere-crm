'use client';

import { API_BASE } from '@/lib/api-config';
import { useState, useEffect, useCallback } from 'react';
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
  alimtalk: 'bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)]',
  brand_message: 'bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)]',
  sms: 'bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)]',
  topup: 'bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)]',
  refund: 'bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)]',
  subscription: 'bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)]',
  booster: 'bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)]',
  deduct: 'bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)]',
  etc: 'bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)]',
};

export default function WalletHistoryPage() {
  const [data, setData] = useState<UsageHistory | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState('all');
  const [category, setCategory] = useState('all');
  const [page, setPage] = useState(1);

  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({ period, category, page: String(page), limit: '30' });
      const res = await fetch(`${API_BASE}/api/wallet/usage-history?${params.toString()}`, {
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
  }, [period, category, page]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const formatAmount = (n: number) =>
    `${n > 0 ? '+' : ''}${n.toLocaleString()}원`;

  const alimtalk = data?.summary.byCategory.alimtalk ?? { count: 0, amount: 0 };
  const brandMessage = data?.summary.byCategory.brand_message ?? { count: 0, amount: 0 };
  const sms = data?.summary.byCategory.sms ?? { count: 0, amount: 0 };

  const summaryItems = [
    { label: '알림톡', icon: MessagesSquare, stat: alimtalk },
    { label: '광고톡', icon: Megaphone, stat: brandMessage },
    { label: '문자메시지', icon: Send, stat: sms },
  ];

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-5 px-4 pb-16 pt-6 sm:px-8 lg:pt-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-[color:var(--ad-ink)]">사용내역</h1>
          <p className="mt-1 text-[13px] text-[color:var(--ad-muted)]">알림톡·광고톡·문자메시지 등 누적 사용 내역을 확인합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="h-9 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13px] text-[color:var(--ad-ink-2)] focus:border-[color:var(--ad-ink)] focus:outline-none"
            value={period}
            onChange={(e) => { setPeriod(e.target.value); setPage(1); }}
          >
            {PERIOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            type="button"
            aria-label="새로고침"
            onClick={fetchHistory}
            className="ad-press inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-white text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Usage Summary */}
      <div className="ad-card grid grid-cols-1 md:grid-cols-3">
        {summaryItems.map(({ label, icon: Icon, stat }, i) => (
          <div
            key={label}
            className={cn('p-5', i > 0 && 'border-t border-[color:var(--ad-line)] md:border-l md:border-t-0')}
          >
            <div className="mb-2 flex items-center gap-1.5">
              <Icon className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.7} />
              <span className="text-[12px] text-[color:var(--ad-muted)]">{label}</span>
            </div>
            <p className="ad-tnum text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">{stat.amount.toLocaleString()}원</p>
            <p className="ad-tnum mt-1 text-[12px] text-[color:var(--ad-faint)]">{stat.count.toLocaleString()}건</p>
          </div>
        ))}
      </div>

      {/* Category Filter */}
      <div className="inline-flex flex-wrap gap-0.5 rounded-[10px] bg-[rgba(29,32,34,0.045)] p-[3px]">
        {CATEGORY_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => { setCategory(f.value); setPage(1); }}
            className={cn(
              'h-8 rounded-[8px] px-3 text-[13px] font-medium transition-colors',
              category === f.value
                ? 'bg-white text-[color:var(--ad-ink)] shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                : 'text-[color:var(--ad-muted)] hover:text-[color:var(--ad-ink)]'
            )}
          >
            {f.label}
            {data?.summary.byCategory[f.value] && f.value !== 'all' && (
              <span className="ad-tnum ml-1 text-[11px] opacity-70">
                {data.summary.byCategory[f.value].count.toLocaleString()}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Transaction Table */}
      <div className="ad-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[color:var(--ad-line)] bg-[color:var(--ad-bg-alt)] text-left text-[11.5px] text-[color:var(--ad-muted)]">
                <th className="px-4 py-2.5 font-medium">일시</th>
                <th className="px-4 py-2.5 font-medium">구분</th>
                <th className="px-4 py-2.5 font-medium">내용</th>
                <th className="px-4 py-2.5 text-right font-medium">금액</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--ad-line)] text-[13px]">
              {isLoading ? (
                <tr><td colSpan={4} className="p-8 text-center text-[13px] text-[color:var(--ad-faint)]">불러오는 중...</td></tr>
              ) : !data || data.transactions.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center text-[13px] text-[color:var(--ad-faint)]">해당 기간에 내역이 없습니다.</td></tr>
              ) : (
                data.transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-[color:var(--ad-bg-alt)]">
                    <td className="ad-tnum whitespace-nowrap px-4 py-3 text-[color:var(--ad-ink-2)]">
                      {new Date(tx.createdAt).toLocaleString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium', CATEGORY_BADGE_STYLES[tx.category] || CATEGORY_BADGE_STYLES.etc)}>
                        {tx.categoryLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[color:var(--ad-muted)]">{tx.description || '-'}</td>
                    <td className={cn('ad-tnum whitespace-nowrap px-4 py-3 text-right font-medium', tx.amount > 0 ? 'text-[color:var(--ad-pos)]' : 'text-[color:var(--ad-ink)]')}>
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
          <div className="flex items-center justify-between border-t border-[color:var(--ad-line)] px-4 py-3">
            <span className="ad-tnum text-[12.5px] text-[color:var(--ad-muted)]">
              총 {data.pagination.total.toLocaleString()}건
            </span>
            <div className="flex items-center gap-2">
              <button type="button" className="ad-press h-8 rounded-[10px] bg-white px-3 text-[13px] text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                이전
              </button>
              <span className="ad-tnum text-[13px] text-[color:var(--ad-ink-2)]">{page} / {data.pagination.totalPages}</span>
              <button type="button" className="ad-press h-8 rounded-[10px] bg-white px-3 text-[13px] text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] disabled:opacity-40" disabled={page >= data.pagination.totalPages} onClick={() => setPage((p) => p + 1)}>
                다음
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
