'use client';

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
  PENDING: 'bg-yellow-100 text-yellow-700',
  SUCCESS: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
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

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">결제내역</h1>
        <p className="text-sm text-neutral-500 mt-1">
          전체 매장의 충전금 결제 내역을 조회합니다.
        </p>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-[#EAEAEA] p-4">
            <div className="text-sm text-neutral-500 mb-1">최근 30일 충전</div>
            <div className="text-2xl font-bold text-emerald-600">
              +{formatCurrency(summary.topup.totalAmount)}원
            </div>
            <div className="text-xs text-neutral-400 mt-1">{summary.topup.count}건</div>
          </div>
          <div className="bg-white rounded-lg border border-[#EAEAEA] p-4">
            <div className="text-sm text-neutral-500 mb-1">최근 30일 차감</div>
            <div className="text-2xl font-bold text-red-600">
              -{formatCurrency(summary.deduct.totalAmount)}원
            </div>
            <div className="text-xs text-neutral-400 mt-1">{summary.deduct.count}건</div>
          </div>
          <div className="bg-white rounded-lg border border-[#EAEAEA] p-4">
            <div className="text-sm text-neutral-500 mb-1">최근 30일 순증감</div>
            <div className={`text-2xl font-bold ${summary.total.netAmount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {summary.total.netAmount >= 0 ? '+' : ''}{formatCurrency(summary.total.netAmount)}원
            </div>
            <div className="text-xs text-neutral-400 mt-1">{summary.total.count}건</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg border border-[#EAEAEA] p-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="매장명으로 검색"
              className="w-full pl-10 pr-4 py-2 border border-[#EAEAEA] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
            />
          </div>

          {/* Type Filter */}
          <div className="relative">
            <button
              onClick={() => setShowTypeDropdown(!showTypeDropdown)}
              className="flex items-center gap-2 px-4 py-2 border border-[#EAEAEA] rounded-lg text-sm text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              <Filter className="w-4 h-4 text-neutral-400" />
              {typeFilter === 'all' ? '전체 유형' : TYPE_LABELS[typeFilter]}
              <ChevronDown className="w-4 h-4 text-neutral-400" />
            </button>
            {showTypeDropdown && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowTypeDropdown(false)} />
                <div className="absolute z-20 mt-1 w-40 bg-white border border-[#EAEAEA] rounded-lg shadow-lg">
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
                      className={`w-full px-4 py-2 text-left text-sm hover:bg-neutral-50 transition-colors ${
                        typeFilter === option.value ? 'bg-neutral-100 font-medium' : ''
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
              className="flex items-center gap-2 px-4 py-2 border border-[#EAEAEA] rounded-lg text-sm text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              {statusFilter === 'all' ? '전체 상태' : STATUS_LABELS[statusFilter]}
              <ChevronDown className="w-4 h-4 text-neutral-400" />
            </button>
            {showStatusDropdown && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowStatusDropdown(false)} />
                <div className="absolute z-20 mt-1 w-32 bg-white border border-[#EAEAEA] rounded-lg shadow-lg">
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
                      className={`w-full px-4 py-2 text-left text-sm hover:bg-neutral-50 transition-colors ${
                        statusFilter === option.value ? 'bg-neutral-100 font-medium' : ''
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
              className="px-3 py-2 border border-[#EAEAEA] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
            />
            <span className="text-neutral-400">~</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-[#EAEAEA] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-[#EAEAEA]">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#EAEAEA]">
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  일시
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  매장명
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  점주
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  유형
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  금액
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  상태
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  설명
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAEAEA]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <div className="flex items-center justify-center">
                      <div className="w-6 h-6 border-2 border-neutral-900 border-t-transparent rounded-full animate-spin" />
                    </div>
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-neutral-500">
                    결제 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                transactions.map((transaction) => (
                  <tr key={transaction.id} className="hover:bg-neutral-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-neutral-600">
                      {formatDate(transaction.createdAt)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-neutral-900">{transaction.storeName}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-neutral-600">
                      {transaction.ownerName || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded ${
                        transaction.type === 'TOPUP' ? 'bg-emerald-100 text-emerald-700' :
                        transaction.type === 'DEDUCT' ? 'bg-red-100 text-red-700' :
                        'bg-neutral-100 text-neutral-700'
                      }`}>
                        {TYPE_LABELS[transaction.type] || transaction.type}
                      </span>
                    </td>
                    <td className={`px-6 py-4 text-sm font-medium text-right ${
                      transaction.amount >= 0 ? 'text-emerald-600' : 'text-red-600'
                    }`}>
                      {transaction.amount >= 0 ? '+' : ''}{formatCurrency(transaction.amount)}원
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded ${STATUS_COLORS[transaction.status]}`}>
                        {STATUS_LABELS[transaction.status]}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-neutral-500 max-w-[200px] truncate">
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
          <div className="flex items-center justify-between px-6 py-4 border-t border-[#EAEAEA]">
            <div className="text-sm text-neutral-500">
              총 {total.toLocaleString()}건 중 {((page - 1) * limit + 1).toLocaleString()}-{Math.min(page * limit, total).toLocaleString()}건
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
                className="p-2 border border-[#EAEAEA] rounded-lg hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 py-1 text-sm text-neutral-700">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page === totalPages}
                className="p-2 border border-[#EAEAEA] rounded-lg hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
