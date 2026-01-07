'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatNumber, formatPhone, formatDate, maskNickname } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { Search, ChevronLeft, ChevronRight, ChevronDown, Check, Calendar, RefreshCw, X } from 'lucide-react';

interface MessageHistoryItem {
  id: string;
  phone: string;
  content: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  cost: number;
  failReason: string | null;
  sentAt: string | null;
  createdAt: string;
  customer: {
    id: string;
    name: string | null;
    phone: string | null;
  } | null;
  campaign: {
    id: string;
    title: string;
  } | null;
}

interface Summary {
  total: number;
  sent: number;
  failed: number;
  pending: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function MessageHistoryPage() {
  const { showToast, ToastComponent } = useToast();
  const [messages, setMessages] = useState<MessageHistoryItem[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, sent: 0, failed: 0, pending: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'SENT' | 'FAILED' | 'PENDING'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Dropdown states
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [dateRangeDropdownOpen, setDateRangeDropdownOpen] = useState(false);

  const getAuthToken = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('token') || 'dev-token';
    }
    return 'dev-token';
  };

  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', pageSize.toString());
      if (searchQuery) params.set('search', searchQuery);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const res = await fetch(`${API_BASE}/api/sms/history?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      });

      if (!res.ok) {
        throw new Error('발송 내역 조회 중 오류가 발생했습니다.');
      }

      const data = await res.json();
      setMessages(data.messages || []);
      setSummary(data.summary || { total: 0, sent: 0, failed: 0, pending: 0 });
      setTotalPages(data.pagination?.totalPages || 1);
      setTotal(data.pagination?.total || 0);
    } catch (err: any) {
      showToast(err.message || '오류가 발생했습니다.', 'error');
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, searchQuery, statusFilter, startDate, endDate]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const closeAllDropdowns = () => {
    setStatusDropdownOpen(false);
    setDateRangeDropdownOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = () => closeAllDropdowns();
    if (statusDropdownOpen || dateRangeDropdownOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [statusDropdownOpen, dateRangeDropdownOpen]);

  const statusOptions = [
    { value: 'all', label: '전체' },
    { value: 'SENT', label: '성공' },
    { value: 'FAILED', label: '실패' },
    { value: 'PENDING', label: '대기' },
  ];

  const resetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SENT':
        return (
          <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded font-medium">
            <Check className="w-3 h-3" />
            성공
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 text-xs text-red-500 bg-red-50 px-2 py-1 rounded font-medium">
            <X className="w-3 h-3" />
            실패
          </span>
        );
      default:
        return (
          <span className="text-xs text-neutral-400 bg-neutral-100 px-2 py-1 rounded font-medium">
            대기
          </span>
        );
    }
  };

  return (
    <div className="p-6 lg:p-8">
      {ToastComponent}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">발송 내역</h1>
          <p className="text-sm text-neutral-500 mt-1">
            SMS, 카카오 알림톡, 네이버 리뷰 요청 등 모든 발송 내역
          </p>
        </div>
        <Button variant="outline" onClick={fetchHistory} disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          새로고침
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <p className="text-sm text-neutral-500">전체 발송</p>
          <p className="text-2xl font-semibold text-neutral-900">{formatNumber(summary.total)}건</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-green-600">성공</p>
          <p className="text-2xl font-semibold text-green-600">{formatNumber(summary.sent)}건</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-red-500">실패</p>
          <p className="text-2xl font-semibold text-red-500">{formatNumber(summary.failed)}건</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-neutral-400">대기</p>
          <p className="text-2xl font-semibold text-neutral-400">{formatNumber(summary.pending)}건</p>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4 mb-6">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <Input
              placeholder="전화번호, 내용 검색"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="pl-10"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={resetFilters}>
              전체 보기
            </Button>

            {/* Status Filter Dropdown */}
            <div className="relative">
              <Button
                variant={statusFilter === 'all' ? 'outline' : 'secondary'}
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setStatusDropdownOpen(!statusDropdownOpen);
                  setDateRangeDropdownOpen(false);
                }}
                className="flex items-center gap-1"
              >
                상태 {statusOptions.find((o) => o.value === statusFilter)?.label}
                <ChevronDown className="w-3.5 h-3.5" />
              </Button>
              {statusDropdownOpen && (
                <div
                  className="absolute top-full left-0 mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg py-1 min-w-[120px] z-50"
                  onClick={(e) => e.stopPropagation()}
                >
                  {statusOptions.map((option) => (
                    <button
                      key={option.value}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-50 flex items-center justify-between"
                      onClick={() => {
                        setStatusFilter(option.value as any);
                        setStatusDropdownOpen(false);
                        setPage(1);
                      }}
                    >
                      {option.label}
                      {statusFilter === option.value && (
                        <Check className="w-4 h-4 text-brand-800" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Date Range Filter Dropdown */}
            <div className="relative">
              <Button
                variant={startDate || endDate ? 'secondary' : 'outline'}
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setDateRangeDropdownOpen(!dateRangeDropdownOpen);
                  setStatusDropdownOpen(false);
                }}
                className="flex items-center gap-1"
              >
                <Calendar className="w-3.5 h-3.5" />
                {startDate || endDate ? (
                  <span className="text-xs">
                    {startDate && endDate
                      ? `${startDate.slice(5)} ~ ${endDate.slice(5)}`
                      : startDate
                      ? `${startDate.slice(5)} ~`
                      : `~ ${endDate.slice(5)}`}
                  </span>
                ) : (
                  '기간'
                )}
                <ChevronDown className="w-3.5 h-3.5" />
              </Button>
              {dateRangeDropdownOpen && (
                <div
                  className="absolute top-full right-0 mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg p-3 min-w-[240px] z-50"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="space-y-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-neutral-500 w-12">시작일</span>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 px-2 py-1.5 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-800"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-neutral-500 w-12">종료일</span>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 px-2 py-1.5 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-800"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setStartDate('');
                        setEndDate('');
                        setPage(1);
                      }}
                      className="flex-1 text-sm"
                    >
                      초기화
                    </Button>
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDateRangeDropdownOpen(false);
                        setPage(1);
                      }}
                      className="flex-1 text-sm"
                    >
                      적용
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50">
                <th className="p-4 text-left text-sm font-medium text-neutral-600">발송일시</th>
                <th className="p-4 text-left text-sm font-medium text-neutral-600">상태</th>
                <th className="p-4 text-left text-sm font-medium text-neutral-600">수신번호</th>
                <th className="p-4 text-left text-sm font-medium text-neutral-600">고객명</th>
                <th className="p-4 text-left text-sm font-medium text-neutral-600">내용</th>
                <th className="p-4 text-left text-sm font-medium text-neutral-600">캠페인</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-neutral-500">
                    불러오는 중...
                  </td>
                </tr>
              )}
              {!isLoading && messages.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-neutral-500">
                    발송 내역이 없습니다.
                  </td>
                </tr>
              )}
              {!isLoading &&
                messages.map((msg) => (
                  <tr key={msg.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                    <td className="p-4 text-sm text-neutral-600 whitespace-nowrap">
                      <div>{formatDate(msg.createdAt)}</div>
                      <div className="text-xs text-neutral-400">
                        {new Date(msg.createdAt).toLocaleTimeString('ko-KR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </td>
                    <td className="p-4">
                      {getStatusBadge(msg.status)}
                      {msg.failReason && (
                        <div
                          className="text-xs text-red-500 mt-1 max-w-[200px]"
                          title={msg.failReason}
                        >
                          {msg.failReason}
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-sm text-neutral-600">
                      {formatPhone(msg.phone)}
                    </td>
                    <td className="p-4 text-sm text-neutral-900">
                      {msg.customer ? maskNickname(msg.customer.name) : '-'}
                    </td>
                    <td className="p-4 text-sm text-neutral-700">
                      <div className="max-w-[300px] truncate" title={msg.content}>
                        {msg.content}
                      </div>
                    </td>
                    <td className="p-4 text-sm text-neutral-500">
                      {msg.campaign?.title || '-'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between p-4 border-t border-neutral-200">
          <span className="text-sm text-neutral-500">
            {formatNumber((page - 1) * pageSize + (messages.length ? 1 : 0))}-
            {formatNumber((page - 1) * pageSize + messages.length)} of {formatNumber(total)}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm text-neutral-600">
              {page} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="icon"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
