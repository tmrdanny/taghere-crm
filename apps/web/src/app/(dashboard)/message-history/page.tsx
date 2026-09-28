'use client';

import { API_BASE } from '@/lib/api-config';
import { useState, useEffect, useCallback, useRef } from 'react';
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
          <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">
            <Check className="w-3 h-3" />
            성공
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-neg)]">
            <X className="w-3 h-3" />
            실패
          </span>
        );
      default:
        return (
          <span className="inline-flex rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">
            대기
          </span>
        );
    }
  };

  const btnSecondary =
    'ad-press inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] bg-white px-3.5 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]';
  const btnFilterActive =
    'ad-press inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] bg-[color:var(--ad-ink)] px-3.5 text-[13px] font-medium text-white hover:bg-[#383c40]';
  const dateInputCls =
    'flex-1 h-9 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-2.5 text-[13px] focus:border-[color:var(--ad-navy)] focus:outline-none';

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 sm:px-8 lg:pt-8">
      {ToastComponent}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-[color:var(--ad-ink)]">발송 내역</h1>
          <p className="mt-1 text-[13px] text-[color:var(--ad-muted)]">
            SMS, 카카오 알림톡, 네이버 리뷰 요청 등 모든 발송 내역
          </p>
        </div>
        <Button variant="outline" onClick={fetchHistory} disabled={isLoading} className={btnSecondary}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
          새로고침
        </Button>
      </div>

      <div className="space-y-4">
      {/* Summary Cards */}
      <div className="ad-card grid grid-cols-2 md:grid-cols-4">
        <div className="p-5">
          <p className="text-[12px] text-[color:var(--ad-muted)]">전체 발송</p>
          <p className="mt-1 text-[20px] font-medium tracking-[-0.03em] ad-tnum text-[color:var(--ad-ink)]">{formatNumber(summary.total)}건</p>
        </div>
        <div className="p-5 border-l border-[color:var(--ad-line)]">
          <p className="text-[12px] text-[color:var(--ad-muted)]">성공</p>
          <p className="mt-1 text-[20px] font-medium tracking-[-0.03em] ad-tnum text-[color:var(--ad-ink)]">{formatNumber(summary.sent)}건</p>
        </div>
        <div className="p-5 border-t md:border-t-0 md:border-l border-[color:var(--ad-line)]">
          <p className="text-[12px] text-[color:var(--ad-muted)]">실패</p>
          <p className="mt-1 text-[20px] font-medium tracking-[-0.03em] ad-tnum text-[color:var(--ad-neg)]">{formatNumber(summary.failed)}건</p>
        </div>
        <div className="p-5 border-t border-l md:border-t-0 border-[color:var(--ad-line)]">
          <p className="text-[12px] text-[color:var(--ad-muted)]">대기</p>
          <p className="mt-1 text-[20px] font-medium tracking-[-0.03em] ad-tnum text-[color:var(--ad-faint)]">{formatNumber(summary.pending)}건</p>
        </div>
      </div>

      {/* Filters */}
      <div className="ad-card p-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--ad-faint)]" />
            <Input
              placeholder="전화번호, 내용 검색"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="pl-10 h-10 rounded-[10px] border-[color:var(--ad-line-strong)] text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)]"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={resetFilters} className={btnSecondary}>
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
                className={`flex items-center gap-1 ${statusFilter === 'all' ? btnSecondary : btnFilterActive}`}
              >
                상태 {statusOptions.find((o) => o.value === statusFilter)?.label}
                <ChevronDown className="w-3.5 h-3.5" />
              </Button>
              {statusDropdownOpen && (
                <div
                  className="absolute top-full left-0 mt-1 bg-white border border-[color:var(--ad-line)] rounded-[12px] shadow-[0_12px_32px_-12px_rgba(19,22,81,0.25)] py-1 min-w-[120px] z-50"
                >
                  {statusOptions.map((option) => (
                    <button
                      key={option.value}
                      className="w-full px-3 py-2 text-left text-[13px] text-[color:var(--ad-ink-2)] hover:bg-[color:var(--ad-bg-alt)] flex items-center justify-between"
                      onClick={() => {
                        setStatusFilter(option.value as any);
                        setStatusDropdownOpen(false);
                        setPage(1);
                      }}
                    >
                      {option.label}
                      {statusFilter === option.value && (
                        <Check className="w-4 h-4 text-[color:var(--ad-ink)]" />
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
                className={`flex items-center gap-1 ${startDate || endDate ? btnFilterActive : btnSecondary}`}
              >
                <Calendar className="w-3.5 h-3.5" />
                {startDate || endDate ? (
                  <span className="text-[12px]">
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
                <div className="absolute top-full right-0 mt-1 bg-white border border-[color:var(--ad-line)] rounded-[12px] shadow-[0_12px_32px_-12px_rgba(19,22,81,0.25)] p-3 min-w-[260px] z-50">
                  <div className="space-y-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] text-[color:var(--ad-muted)] w-12">시작일</span>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className={dateInputCls}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] text-[color:var(--ad-muted)] w-12">종료일</span>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className={dateInputCls}
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
                      className={`flex-1 ${btnSecondary}`}
                    >
                      초기화
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        setDateRangeDropdownOpen(false);
                        setPage(1);
                      }}
                      className="flex-1 ad-press inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] bg-[color:var(--ad-ink)] px-4 text-[13px] font-semibold text-white hover:bg-[#383c40] disabled:opacity-40"
                    >
                      적용
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="ad-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[color:var(--ad-line)] bg-[color:var(--ad-bg-alt)] text-left text-[11.5px] text-[color:var(--ad-muted)]">
                <th className="px-4 py-2.5 font-medium">발송일시</th>
                <th className="px-4 py-2.5 font-medium">타입</th>
                <th className="px-4 py-2.5 font-medium">상태</th>
                <th className="px-4 py-2.5 font-medium">수신번호</th>
                <th className="px-4 py-2.5 font-medium">내용</th>
                <th className="px-4 py-2.5 font-medium">캠페인</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--ad-line)] text-[13px]">
              {isLoading && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-[13px] text-[color:var(--ad-faint)]">
                    불러오는 중...
                  </td>
                </tr>
              )}
              {!isLoading && messages.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-[13px] text-[color:var(--ad-faint)]">
                    발송 내역이 없습니다.
                  </td>
                </tr>
              )}
              {!isLoading &&
                messages.map((msg) => (
                  <tr key={msg.id} className="hover:bg-[color:var(--ad-bg-alt)]">
                    <td className="px-4 py-3 text-[color:var(--ad-ink-2)] whitespace-nowrap ad-tnum">
                      <div>{formatDate(msg.createdAt)}</div>
                      <div className="text-[11.5px] text-[color:var(--ad-faint)]">
                        {new Date(msg.createdAt).toLocaleTimeString('ko-KR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {msg.type === 'LOCAL_CUSTOMER' ? (
                        <span className="inline-flex rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">
                          동네손님
                        </span>
                      ) : msg.type === 'ALIMTALK' ? (
                        <span className="inline-flex rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">
                          알림톡
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">
                          SMS
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {getStatusBadge(msg.status)}
                      {/* 성공한 건에는 실패 사유를 표시하지 않는다.
                          (발송 중 남은 내부 상태 문구가 성공 뒤에도 남아 오류로 오해되던 문제 방어) */}
                      {msg.failReason && msg.status !== 'SENT' && (
                        <div
                          className="text-[11.5px] text-[color:var(--ad-neg)] mt-1 max-w-[200px]"
                          title={getFailReasonKorean(msg.failReason) || msg.failReason}
                        >
                          {getFailReasonKorean(msg.failReason)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[color:var(--ad-ink-2)] ad-tnum whitespace-nowrap">
                      {formatPhone(msg.phone)}
                    </td>
                    <td className="px-4 py-3 text-[color:var(--ad-ink)]">
                      <div className="max-w-[300px] truncate" title={msg.content}>
                        {msg.content}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[color:var(--ad-muted)]">
                      {msg.campaign?.title || '-'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-[color:var(--ad-line)]">
          <span className="text-[12.5px] text-[color:var(--ad-muted)] ad-tnum">
            {formatNumber((page - 1) * pageSize + (messages.length ? 1 : 0))}-
            {formatNumber((page - 1) * pageSize + messages.length)} of {formatNumber(total)}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-8 w-8 rounded-[8px] text-[color:var(--ad-ink-2)] hover:bg-[color:var(--ad-bg-alt)] disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-[12.5px] text-[color:var(--ad-ink-2)] ad-tnum">
              {page} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="icon"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="h-8 w-8 rounded-[8px] text-[color:var(--ad-ink-2)] hover:bg-[color:var(--ad-bg-alt)] disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
