'use client';

import { API_BASE } from '@/lib/api-config';
import { useState, useEffect, useCallback } from 'react';
import { Receipt, RefreshCw, X, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StoreSummary {
  storeId: string;
  storeName: string;
  balance: number;
  topup: number;
  earnAlimtalk: number;
  marketing: number;
  etc: number;
  used: number;
}

interface Totals {
  topup: number;
  earnAlimtalk: number;
  marketing: number;
  etc: number;
  used: number;
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
  const [period, setPeriod] = useState('30days');

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
      console.error('Failed to fetch wallet usage:', e);
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

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">충전금 이용내역</h1>
          <p className="text-sm text-slate-500 mt-1">가맹점별 충전·알림톡·마케팅 사용 내역을 확인합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="border border-slate-200 rounded-lg text-sm text-slate-700 px-3 py-2 bg-white"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            {PERIOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            onClick={fetchSummary}
            className="p-2 border border-slate-200 rounded-lg bg-white hover:bg-slate-50"
          >
            <RefreshCw className={cn('w-4 h-4 text-slate-500', isLoading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: '전체 잔액', value: totals?.balance ?? 0, color: 'text-slate-900' },
          { label: '기간 내 충전', value: totals?.topup ?? 0, color: 'text-emerald-600' },
          { label: '적립 알림톡 사용', value: totals?.earnAlimtalk ?? 0, color: 'text-blue-600' },
          { label: '마케팅 사용', value: totals?.marketing ?? 0, color: 'text-purple-600' },
          { label: '총 사용', value: totals?.used ?? 0, color: 'text-red-600' },
        ].map((c) => (
          <div key={c.label} className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
            <p className="text-xs text-slate-500 mb-1">{c.label}</p>
            <p className={cn('text-xl font-bold', c.color)}>{won(c.value)}</p>
          </div>
        ))}
      </div>

      {/* Per-store table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase">가맹점명</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase">충전</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase">적립 알림톡</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase">마케팅</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase">기타</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase">총 사용</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 uppercase">잔액</th>
                <th className="px-5 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={8} className="p-8 text-center text-slate-400">불러오는 중...</td></tr>
              ) : stores.length === 0 ? (
                <tr><td colSpan={8} className="p-8 text-center text-slate-400">가맹점이 없습니다.</td></tr>
              ) : (
                stores.map((s) => (
                  <tr
                    key={s.storeId}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => openDetail(s)}
                  >
                    <td className="px-5 py-3 text-sm font-medium text-slate-900">{s.storeName}</td>
                    <td className="px-5 py-3 text-sm text-right text-emerald-600">{s.topup > 0 ? won(s.topup) : '-'}</td>
                    <td className="px-5 py-3 text-sm text-right text-slate-700">{s.earnAlimtalk !== 0 ? won(s.earnAlimtalk) : '-'}</td>
                    <td className="px-5 py-3 text-sm text-right text-slate-700">{s.marketing !== 0 ? won(s.marketing) : '-'}</td>
                    <td className="px-5 py-3 text-sm text-right text-slate-500">{s.etc !== 0 ? won(s.etc) : '-'}</td>
                    <td className="px-5 py-3 text-sm text-right font-semibold text-slate-900">{s.used !== 0 ? won(s.used) : '-'}</td>
                    <td className="px-5 py-3 text-sm text-right text-slate-700">{won(s.balance)}</td>
                    <td className="px-5 py-3"><ChevronRight className="w-4 h-4 text-slate-300" /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Store Detail Modal */}
      {detailStore && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDetailStore(null)}>
          <div
            className="bg-white rounded-xl max-w-2xl w-full max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-franchise-600" />
                <h2 className="text-lg font-bold text-slate-900">{detailStore.storeName}</h2>
                <span className="text-sm text-slate-500">잔액 {won(detailStore.balance)}</span>
              </div>
              <button onClick={() => setDetailStore(null)} className="p-1 text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {isLoadingDetail ? (
                <p className="p-8 text-center text-slate-400">불러오는 중...</p>
              ) : detailTxs.length === 0 ? (
                <p className="p-8 text-center text-slate-400">해당 기간에 내역이 없습니다.</p>
              ) : (
                <table className="w-full">
                  <tbody className="divide-y divide-slate-100">
                    {detailTxs.map((tx) => (
                      <tr key={tx.id}>
                        <td className="px-6 py-3 text-sm text-slate-500 whitespace-nowrap">
                          {new Date(tx.createdAt).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                            {tx.categoryLabel}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-400">{tx.description || ''}</td>
                        <td className={cn('px-6 py-3 text-sm font-semibold text-right whitespace-nowrap', tx.amount > 0 ? 'text-emerald-600' : 'text-slate-900')}>
                          {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()}원
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <p className="px-6 py-3 text-xs text-slate-400 border-t border-slate-100">최근 200건까지 표시됩니다.</p>
          </div>
        </div>
      )}
    </div>
  );
}
