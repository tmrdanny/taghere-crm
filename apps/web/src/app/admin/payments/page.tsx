'use client';

import { API_BASE } from '@/lib/api-config';
import { useEffect, useState, useCallback } from 'react';
import { Search, Filter, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

interface PaymentTransaction {
  id: string;
  storeId: string;
  storeName: string;
  ownerName: string | null;
  amount: number;
  type: 'TOPUP' | 'DEDUCT' | 'SUBSCRIPTION' | 'REFUND' | 'ALIMTALK_SEND';
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  meta: any;
  createdAt: string;
}

interface PaymentSummary {
  period: string;
  topup: { totalAmount: number; count: number };
  deduct: { totalAmount: number; count: number };
  total: { netAmount: number; count: number };
}

const TYPE_LABELS: Record<string, string> = {
  TOPUP: '충전',
  DEDUCT: '차감',
  SUBSCRIPTION: '구독료',
  REFUND: '환불',
  ALIMTALK_SEND: '알림톡',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: '대기',
  SUCCESS: '성공',
  FAILED: '실패',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-[#ffdace] text-[#993d1f]',
  SUCCESS: 'bg-[#d9fad3] text-[color:var(--ad-pos)]',
  FAILED: 'bg-[#ffc4d0] text-[color:var(--ad-neg)]',
};

export default function PaymentsPage() {
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<PaymentSummary | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;

  // Filters
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Dropdown states
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);

  const API_URL = API_BASE;

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('adminToken');
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });

      if (typeFilter !== 'all') params.append('type', typeFilter);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (searchQuery) params.append('search', searchQuery);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);

      const res = await fetch(`${API_URL}/api/admin/payments?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) throw new Error('Failed to fetch transactions');

      const data = await res.json();
      setTransactions(data.transactions);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
    } finally {
      setLoading(false);
    }
  }, [API_URL, page, typeFilter, statusFilter, searchQuery, startDate, endDate]);

  const fetchSummary = useCallback(async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(`${API_URL}/api/admin/payments/summary?period=30days`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch (error) {
      console.error('Failed to fetch summary:', error);
    }
  }, [API_URL]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString('ko-KR');
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getDescription = (transaction: PaymentTransaction) => {
    if (transaction.meta?.description) {
      return transaction.meta.description;
    }
    if (transaction.meta?.paymentMethod === 'ADMIN') {
      return '관리자 처리';
    }
    if (transaction.meta?.source === 'tosspayments') {
      return '토스페이먼츠 결제';
    }
    if (transaction.meta?.source === 'franchise_transfer') {
      return '프랜차이즈 이체';
    }
    return '-';
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-5">
        <p className="text-[13px] text-[color:var(--ad-muted)]">
          전체 매장의 충전금 결제 내역을 조회합니다.
        </p>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="ad-card mb-4 grid grid-cols-1 md:grid-cols-3">
          <div className="p-5">
            <div className="text-[12px] text-[color:var(--ad-muted)] mb-1">최근 30일 충전</div>
            <div className="text-[22px] font-semibold tracking-[-0.03em] ad-tnum text-[color:var(--ad-pos)]">
              +{formatCurrency(summary.topup.totalAmount)}원
            </div>
            <div className="text-[12px] text-[color:var(--ad-faint)] mt-1">{summary.topup.count}건</div>
          </div>
          <div className="p-5 border-t md:border-t-0 md:border-l border-[color:var(--ad-line)]">
            <div className="text-[12px] text-[color:var(--ad-muted)] mb-1">최근 30일 차감</div>
            <div className="text-[22px] font-semibold tracking-[-0.03em] ad-tnum text-[color:var(--ad-neg)]">
              -{formatCurrency(summary.deduct.totalAmount)}원
            </div>
            <div className="text-[12px] text-[color:var(--ad-faint)] mt-1">{summary.deduct.count}건</div>
          </div>
          <div className="p-5 border-t md:border-t-0 md:border-l border-[color:var(--ad-line)]">
            <div className="text-[12px] text-[color:var(--ad-muted)] mb-1">최근 30일 순증감</div>
            <div className={`text-[22px] font-semibold tracking-[-0.03em] ad-tnum ${summary.total.netAmount >= 0 ? 'text-[color:var(--ad-pos)]' : 'text-[color:var(--ad-neg)]'}`}>
              {summary.total.netAmount >= 0 ? '+' : ''}{formatCurrency(summary.total.netAmount)}원
            </div>
            <div className="text-[12px] text-[color:var(--ad-faint)] mt-1">{summary.total.count}건</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="ad-card p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--ad-faint)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="매장명으로 검색"
              className="w-full pl-10 pr-3 h-10 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none"
            />
          </div>

          {/* Type Filter */}
          <div className="relative">
            <button
              onClick={() => setShowTypeDropdown(!showTypeDropdown)}
              className="ad-press flex items-center gap-2 h-10 px-3.5 rounded-[10px] bg-white text-[13px] text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
            >
              <Filter className="w-4 h-4 text-[color:var(--ad-faint)]" />
              {typeFilter === 'all' ? '전체 유형' : TYPE_LABELS[typeFilter]}
              <ChevronDown className="w-4 h-4 text-[color:var(--ad-faint)]" />
            </button>
            {showTypeDropdown && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowTypeDropdown(false)} />
                <div className="absolute z-20 mt-1 w-40 overflow-hidden bg-white border border-[color:var(--ad-line)] rounded-[12px] shadow-[0_12px_32px_-12px_rgba(19,22,81,0.25)]">
                  {[
                    { value: 'all', label: '전체 유형' },
                    { value: 'TOPUP', label: '충전' },
                    { value: 'DEDUCT', label: '차감' },
                    { value: 'SUBSCRIPTION', label: '구독료' },
                    { value: 'REFUND', label: '환불' },
                    { value: 'ALIMTALK_SEND', label: '알림톡' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setTypeFilter(option.value);
                        setShowTypeDropdown(false);
                        setPage(1);
                      }}
                      className={`w-full px-4 py-2 text-left text-[13px] text-[color:var(--ad-ink-2)] hover:bg-[color:var(--ad-bg-alt)] transition-colors ${
                        typeFilter === option.value ? 'bg-[color:var(--ad-bg)] font-medium text-[color:var(--ad-ink)]' : ''
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Status Filter */}
          <div className="relative">
            <button
              onClick={() => setShowStatusDropdown(!showStatusDropdown)}
              className="ad-press flex items-center gap-2 h-10 px-3.5 rounded-[10px] bg-white text-[13px] text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
            >
              {statusFilter === 'all' ? '전체 상태' : STATUS_LABELS[statusFilter]}
              <ChevronDown className="w-4 h-4 text-[color:var(--ad-faint)]" />
            </button>
            {showStatusDropdown && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowStatusDropdown(false)} />
                <div className="absolute z-20 mt-1 w-32 overflow-hidden bg-white border border-[color:var(--ad-line)] rounded-[12px] shadow-[0_12px_32px_-12px_rgba(19,22,81,0.25)]">
                  {[
                    { value: 'all', label: '전체 상태' },
                    { value: 'SUCCESS', label: '성공' },
                    { value: 'PENDING', label: '대기' },
                    { value: 'FAILED', label: '실패' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setStatusFilter(option.value);
                        setShowStatusDropdown(false);
                        setPage(1);
                      }}
                      className={`w-full px-4 py-2 text-left text-[13px] text-[color:var(--ad-ink-2)] hover:bg-[color:var(--ad-bg-alt)] transition-colors ${
                        statusFilter === option.value ? 'bg-[color:var(--ad-bg)] font-medium text-[color:var(--ad-ink)]' : ''
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Date Range */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="px-3 h-10 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none"
            />
            <span className="text-[color:var(--ad-faint)]">~</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="px-3 h-10 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="ad-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[color:var(--ad-line)] bg-[color:var(--ad-bg-alt)] text-left text-[11.5px] text-[color:var(--ad-muted)]">
                <th className="px-4 py-2.5 text-left font-medium">
                  일시
                </th>
                <th className="px-4 py-2.5 text-left font-medium">
                  매장명
                </th>
                <th className="px-4 py-2.5 text-left font-medium">
                  점주
                </th>
                <th className="px-4 py-2.5 text-left font-medium">
                  유형
                </th>
                <th className="px-4 py-2.5 text-right font-medium">
                  금액
                </th>
                <th className="px-4 py-2.5 text-left font-medium">
                  상태
                </th>
                <th className="px-4 py-2.5 text-left font-medium">
                  설명
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--ad-line)] text-[13px]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <div className="flex items-center justify-center">
                      <div className="w-6 h-6 border-2 border-[#131651] border-t-transparent rounded-full animate-spin" />
                    </div>
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-[13px] text-[color:var(--ad-faint)]">
                    결제 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                transactions.map((transaction) => (
                  <tr key={transaction.id} className="hover:bg-[rgba(110,173,255,0.05)] transition-colors">
                    <td className="px-4 py-3 ad-tnum text-[color:var(--ad-muted)]">
                      {formatDate(transaction.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-[color:var(--ad-ink)]">{transaction.storeName}</div>
                    </td>
                    <td className="px-4 py-3 text-[color:var(--ad-ink-2)]">
                      {transaction.ownerName || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        transaction.type === 'TOPUP' ? 'bg-[#d9fad3] text-[color:var(--ad-pos)]' :
                        transaction.type === 'DEDUCT' ? 'bg-[#ffc4d0] text-[color:var(--ad-neg)]' :
                        'bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)]'
                      }`}>
                        {TYPE_LABELS[transaction.type] || transaction.type}
                      </span>
                    </td>
                    <td className={`px-4 py-3 font-medium text-right ad-tnum ${
                      transaction.amount >= 0 ? 'text-[color:var(--ad-pos)]' : 'text-[color:var(--ad-neg)]'
                    }`}>
                      {transaction.amount >= 0 ? '+' : ''}{formatCurrency(transaction.amount)}원
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_COLORS[transaction.status]}`}>
                        {STATUS_LABELS[transaction.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[color:var(--ad-muted)] max-w-[200px] truncate">
                      {getDescription(transaction)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[color:var(--ad-line)]">
            <div className="text-[12.5px] text-[color:var(--ad-muted)] ad-tnum">
              총 {total.toLocaleString()}건 중 {((page - 1) * limit + 1).toLocaleString()}-{Math.min(page * limit, total).toLocaleString()}건
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
                className="ad-press p-2 rounded-[10px] bg-white text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 py-1 text-[13px] ad-tnum text-[color:var(--ad-ink-2)]">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page === totalPages}
                className="ad-press p-2 rounded-[10px] bg-white text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
