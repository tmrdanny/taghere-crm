'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatNumber, formatPhone, formatDate, maskNickname } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { Search, ChevronLeft, ChevronRight, ChevronDown, Check, Calendar, RefreshCw, X, TrendingUp } from 'lucide-react';

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
  type?: 'SMS' | 'ALIMTALK' | 'LOCAL_CUSTOMER';
  region?: string; // LOCAL_CUSTOMER 타입일 때 지역 정보
}

interface Summary {
  total: number;
  sent: number;
  failed: number;
  pending: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// SOLAPI 에러 코드 → 한글 변환 (기존 데이터 호환)
const getFailReasonKorean = (failReason: string | null): string | null => {
  if (!failReason) return null;

  // 이미 한글 메시지인 경우 그대로 반환
  if (!failReason.match(/Failed \(\d+\)/)) {
    return failReason;
  }

  // "Failed (XXXX)" 형식에서 코드 추출
  const match = failReason.match(/Failed \((\d+)\)/);
  if (!match) return failReason;

  const code = match[1];
  const errorMessages: Record<string, string> = {
    '3000': '전송경로 없음',
    '3001': '알 수 없는 오류',
    '3002': '전송 형식 오류',
    '3003': '전송 타입 오류',
    '3008': '중복 수신거부',
    '3014': '유효하지 않은 수신번호',
    '3022': '카카오톡 미사용자',
    '3024': '템플릿 형식 불일치',
    '3025': '템플릿 변수 불일치',
    '3026': '카카오톡 발송 실패',
    '3027': '카카오 블록된 사용자',
    '3058': '발신번호 사전등록 필요',
    '3059': '발신번호 미등록',
    '3103': '센더키 오류',
    '3104': '카카오톡 미사용자',
    '3105': '발송 제한',
    '3106': '전화번호 오류',
    '3107': '잔액 부족',
    '3110': '발신프로필 오류',
    '3111': '템플릿 오류',
    '3112': '변수 오류',
    '3113': '메시지 길이 초과',
    '3114': '전화번호 차단',
    '3115': '발송 차단',
    '3116': '스팸 감지',
    '3117': '발송 제한',
    '3118': '발송 차단 중',
    '3130': '080 수신거부',
    '3131': '수신거부 목록',
    '3132': '메시지 발송 거부',
    '3133': '일일 발송 제한 초과',
    '3501': '카카오 서버 오류',
    '3502': '카카오 전송 실패',
    '3503': '카카오 타임아웃',
  };

  return errorMessages[code] || `발송 실패 (코드: ${code})`;
};

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

  // Refs for dropdown containers
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const dateRangeDropdownRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // 상태 드롭다운 외부 클릭 감지
      if (statusDropdownOpen && statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setStatusDropdownOpen(false);
      }
      // 기간 드롭다운 외부 클릭 감지
      if (dateRangeDropdownOpen && dateRangeDropdownRef.current && !dateRangeDropdownRef.current.contains(event.target as Node)) {
        setDateRangeDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
            <div className="relative" ref={statusDropdownRef}>
              <Button
                variant={statusFilter === 'all' ? 'outline' : 'secondary'}
                size="sm"
                onClick={() => {
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
            <div className="relative" ref={dateRangeDropdownRef}>
              <Button
                variant={startDate || endDate ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => {
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
                <div className="absolute top-full right-0 mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg p-3 min-w-[240px] z-50">
                  <div className="space-y-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-neutral-500 w-12">시작일</span>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="flex-1 px-2 py-1.5 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-800"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-neutral-500 w-12">종료일</span>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="flex-1 px-2 py-1.5 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-800"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
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
                      onClick={() => {
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
                <th className="p-4 text-left text-sm font-medium text-neutral-600">타입</th>
                <th className="p-4 text-left text-sm font-medium text-neutral-600">상태</th>
                <th className="p-4 text-left text-sm font-medium text-neutral-600">수신번호</th>
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
                      {msg.type === 'LOCAL_CUSTOMER' ? (
                        <span className="inline-flex items-center gap-1 text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded font-medium">
                          동네손님
                        </span>
                      ) : msg.type === 'ALIMTALK' ? (
                        <span className="inline-flex items-center gap-1 text-xs text-yellow-600 bg-yellow-50 px-2 py-1 rounded font-medium">
                          알림톡
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded font-medium">
                          SMS
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      {getStatusBadge(msg.status)}
                      {msg.failReason && (
                        <div
                          className="text-xs text-red-500 mt-1 max-w-[200px]"
                          title={getFailReasonKorean(msg.failReason) || msg.failReason}
                        >
                          {getFailReasonKorean(msg.failReason)}
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-sm text-neutral-600">
                      {formatPhone(msg.phone)}
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
