'use client';

import { API_BASE } from '@/lib/api-config';
import { useState, useEffect, useCallback } from 'react';
import { MessagesSquare, Megaphone, Send, Wallet, RefreshCw, X, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChannelStat {
  count: number;
  amount: number;
}

interface StoreSummary {
  storeId: string;
  storeName: string;
  balance: number;
  alimtalk: ChannelStat;
  brandMessage: ChannelStat;
  sms: ChannelStat;
  etc: ChannelStat;
  total: ChannelStat;
}

interface Totals {
  alimtalk: ChannelStat;
  brandMessage: ChannelStat;
  sms: ChannelStat;
  etc: ChannelStat;
  total: ChannelStat;
  balance: number;
}

interface StoreTransaction {
  id: string;
  createdAt: string;
  amount: number;
  category: string;
  categoryLabel: string;
  description: string;
}

const PERIOD_OPTIONS = [
  { value: '7days', label: '최근 7일' },
  { value: '30days', label: '최근 30일' },
  { value: '90days', label: '최근 90일' },
  { value: 'all', label: '전체 기간' },
];

export default function FranchiseWalletHistoryPage() {
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState('all');

  // 매장 상세 모달
  const [detailStore, setDetailStore] = useState<StoreSummary | null>(null);
  const [detailTxs, setDetailTxs] = useState<StoreTransaction[]>([]);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const getToken = () => localStorage.getItem('franchiseToken') || '';

  const fetchSummary = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/franchise/wallet-usage?period=${period}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStores(data.stores || []);
        setTotals(data.totals || null);
      }
    } catch (e) {
      console.error('Failed to fetch usage summary:', e);
    } finally {
      setIsLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const openDetail = async (store: StoreSummary) => {
    setDetailStore(store);
    setIsLoadingDetail(true);
    setDetailTxs([]);
    try {
      const res = await fetch(`${API_BASE}/api/franchise/wallet-usage?period=${period}&storeId=${store.storeId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDetailTxs(data.transactions || []);
      }
    } catch (e) {
      console.error('Failed to fetch store transactions:', e);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const won = (n: number) => `${n.toLocaleString()}원`;
  const cell = (c: ChannelStat) => (c.count > 0 ? `${won(c.amount)} · ${c.count}건` : '-');

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-5 px-4 pb-16 pt-6 sm:px-8 lg:pt-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-[color:var(--ad-ink)]">사용내역</h1>
          <p className="mt-1 text-[13px] text-[color:var(--ad-muted)]">가맹점별 알림톡·광고톡·문자메시지 등 누적 사용 내역을 확인합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="h-9 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13px] text-[color:var(--ad-ink-2)] focus:border-[color:var(--ad-ink)] focus:outline-none"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            {PERIOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            type="button"
            aria-label="새로고침"
            onClick={fetchSummary}
            className="adm-press inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-white text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Totals */}
      <div className="adm-card grid grid-cols-2 md:grid-cols-4">
        {[
          { label: '알림톡', stat: totals?.alimtalk, icon: MessagesSquare },
          { label: '광고톡', stat: totals?.brandMessage, icon: Megaphone },
          { label: '문자메시지', stat: totals?.sms, icon: Send },
          { label: '총 사용', stat: totals?.total, icon: Wallet },
        ].map((c, i) => {
          const Icon = c.icon;
          return (
            <div
              key={c.label}
              className={cn(
                'p-5',
                i % 2 === 1 && 'border-l border-[color:var(--ad-line)]',
                i >= 2 && 'border-t border-[color:var(--ad-line)] md:border-t-0',
                i === 2 && 'md:border-l'
              )}
            >
              <div className="mb-2 flex items-center gap-1.5">
                <Icon className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.7} />
                <span className="text-[12px] text-[color:var(--ad-muted)]">{c.label}</span>
              </div>
              <p className="adm-tnum text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">{won(c.stat?.amount ?? 0)}</p>
              <p className="adm-tnum mt-1 text-[12px] text-[color:var(--ad-faint)]">{(c.stat?.count ?? 0).toLocaleString()}건</p>
            </div>
          );
        })}
      </div>

      {/* Per-store table */}
      <div className="adm-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[color:var(--ad-line)] bg-[color:var(--ad-bg-alt)] text-left text-[11.5px] text-[color:var(--ad-muted)]">
                <th className="px-4 py-2.5 font-medium">가맹점명</th>
                <th className="px-4 py-2.5 text-right font-medium">알림톡</th>
                <th className="px-4 py-2.5 text-right font-medium">광고톡</th>
                <th className="px-4 py-2.5 text-right font-medium">문자메시지</th>
                <th className="px-4 py-2.5 text-right font-medium">총 사용</th>
                <th className="w-10 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--ad-line)] text-[13px]">
              {isLoading ? (
                <tr><td colSpan={6} className="p-8 text-center text-[13px] text-[color:var(--ad-faint)]">불러오는 중...</td></tr>
              ) : stores.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-[13px] text-[color:var(--ad-faint)]">가맹점이 없습니다.</td></tr>
              ) : (
                stores.map((s) => (
                  <tr
                    key={s.storeId}
                    className="cursor-pointer transition-colors hover:bg-[color:var(--ad-bg-alt)]"
                    onClick={() => openDetail(s)}
                  >
                    <td className="px-4 py-3 font-medium text-[color:var(--ad-ink)]">{s.storeName}</td>
                    <td className="adm-tnum px-4 py-3 text-right text-[color:var(--ad-ink-2)]">{cell(s.alimtalk)}</td>
                    <td className="adm-tnum px-4 py-3 text-right text-[color:var(--ad-ink-2)]">{cell(s.brandMessage)}</td>
                    <td className="adm-tnum px-4 py-3 text-right text-[color:var(--ad-ink-2)]">{cell(s.sms)}</td>
                    <td className="adm-tnum px-4 py-3 text-right font-medium text-[color:var(--ad-ink)]">{cell(s.total)}</td>
                    <td className="px-4 py-3"><ChevronRight className="h-4 w-4 text-[color:var(--ad-faint)]" /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Store Detail Modal */}
      {detailStore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.4)] p-4 backdrop-blur-sm" onClick={() => setDetailStore(null)}>
          <div
            className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[color:var(--ad-line)] px-5 py-4">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <MessagesSquare className="h-4 w-4 flex-shrink-0 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                <h2 className="text-[17px] font-semibold text-[color:var(--ad-ink)]">{detailStore.storeName}</h2>
                <span className="adm-tnum text-[13px] text-[color:var(--ad-muted)]">총 사용 {cell(detailStore.total)}</span>
              </div>
              <button onClick={() => setDetailStore(null)} className="adm-press rounded-[8px] p-1 text-[color:var(--ad-faint)] hover:bg-[color:var(--ad-bg-alt)] hover:text-[color:var(--ad-ink-2)]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {isLoadingDetail ? (
                <p className="p-8 text-center text-[13px] text-[color:var(--ad-faint)]">불러오는 중...</p>
              ) : detailTxs.length === 0 ? (
                <p className="p-8 text-center text-[13px] text-[color:var(--ad-faint)]">해당 기간에 내역이 없습니다.</p>
              ) : (
                <table className="w-full">
                  <tbody className="divide-y divide-[color:var(--ad-line)] text-[13px]">
                    {detailTxs.map((tx) => (
                      <tr key={tx.id}>
                        <td className="adm-tnum whitespace-nowrap px-5 py-3 text-[color:var(--ad-ink-2)]">
                          {new Date(tx.createdAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-flex rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">
                            {tx.categoryLabel}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-[12px] text-[color:var(--ad-faint)]">{tx.description || ''}</td>
                        <td className={cn('adm-tnum whitespace-nowrap px-5 py-3 text-right font-medium', tx.amount > 0 ? 'text-[color:var(--ad-pos)]' : 'text-[color:var(--ad-ink)]')}>
                          {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()}원
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <p className="border-t border-[color:var(--ad-line)] px-5 py-3 text-[12px] text-[color:var(--ad-faint)]">최근 200건까지 표시됩니다.</p>
          </div>
        </div>
      )}
    </div>
  );
}
