'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, Bell, XCircle, Search } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

type WaitingStatus = 'WAITING' | 'CALLED' | 'SEATED' | 'CANCELLED' | 'NO_SHOW';

interface WaitingData {
  id: string;
  waitingNumber: number;
  waitingTypeName: string;
  partySize: number;
  status: WaitingStatus;
  position: number | null;
  estimatedWaitMinutes: number | null;
  calledAt: string | null;
  calledCount: number;
  callExpireAt: string | null;
  createdAt: string;
  seatedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
}

interface ApiResponse {
  found: boolean;
  storeName: string;
  waiting?: WaitingData;
}

const CANCEL_REASON_LABELS: Record<string, string> = {
  CUSTOMER_REQUEST: '고객 요청으로 취소',
  STORE_REASON: '매장 사정으로 취소',
  NO_SHOW: '미입장으로 취소',
  OUT_OF_STOCK: '재고 소진으로 취소',
  AUTO_CANCELLED: '시간 초과로 자동 취소',
};

export default function WaitingStatusPage() {
  const params = useParams();
  const router = useRouter();
  const storeSlug = params.storeSlug as string;
  const phone = params.phone as string;

  const [data, setData] = useState<ApiResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [callRemainingSeconds, setCallRemainingSeconds] = useState<number | null>(null);

  // Fetch waiting status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/public/waiting/${storeSlug}/status/${phone}`);

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('웨이팅 정보를 찾을 수 없습니다.');
        }
        throw new Error('상태 조회에 실패했습니다.');
      }

      const result: ApiResponse = await res.json();
      setData(result);

      // Vibrate on CALLED status
      if (result.waiting?.status === 'CALLED' && typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [storeSlug, phone]);

  // Initial fetch
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Auto-refresh every 5 seconds for active statuses
  useEffect(() => {
    if (!data?.waiting) return;

    const { status } = data.waiting;
    if (status === 'SEATED' || status === 'CANCELLED' || status === 'NO_SHOW') {
      return; // No need to refresh for terminal states
    }

    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [data?.waiting?.status, fetchStatus]);

  // Call countdown timer
  useEffect(() => {
    if (!data?.waiting || data.waiting.status !== 'CALLED' || !data.waiting.callExpireAt) {
      setCallRemainingSeconds(null);
      return;
    }

    const updateCountdown = () => {
      const expireAt = new Date(data.waiting!.callExpireAt!);
      const now = new Date();
      const remaining = Math.max(0, Math.floor((expireAt.getTime() - now.getTime()) / 1000));
      setCallRemainingSeconds(remaining);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [data?.waiting?.status, data?.waiting?.callExpireAt]);

  // Format countdown time
  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Format registration time
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  };

  // Navigate to cancel page
  const handleCancelClick = () => {
    router.push(`/w/${storeSlug}/cancel?phone=${phone}`);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="h-[100dvh] bg-white font-pretendard flex justify-center">
        <div className="w-full max-w-[430px] h-full flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-[#6BA3FF] animate-spin mx-auto mb-4" />
            <p className="text-[14px] text-[#91949a]">로딩 중...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="h-[100dvh] bg-white font-pretendard flex justify-center">
        <div className="w-full max-w-[430px] h-full flex items-center justify-center px-5">
          <div className="text-center">
            <div className="w-16 h-16 bg-[#FFF0F3] rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">!</span>
            </div>
            <h1 className="text-[18px] font-bold text-[#1d2022] mb-2">{error}</h1>
            <p className="text-[14px] text-[#91949a] mb-6">등록하신 전화번호를 다시 확인해주세요.</p>
            <a
              href={`/w/${storeSlug}`}
              className="inline-block px-6 py-3 bg-[#FFD541] text-[#1d2022] rounded-[10px] font-semibold hover:bg-[#f5c728] transition-colors"
            >
              웨이팅 등록하기
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Not found state
  if (!data?.found || !data.waiting) {
    return (
      <div className="h-[100dvh] bg-white font-pretendard flex justify-center">
        <div className="w-full max-w-[430px] h-full flex items-center justify-center px-5">
          <div className="text-center">
            <div className="w-16 h-16 bg-[#f8f9fa] rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-[#91949a]" />
            </div>
            <h1 className="text-[18px] font-bold text-[#1d2022] mb-2">웨이팅 정보를 찾을 수 없습니다</h1>
            <p className="text-[14px] text-[#91949a] mb-6">오늘 등록한 웨이팅이 없습니다.</p>
            <a
              href={`/w/${storeSlug}`}
              className="inline-block px-6 py-3 bg-[#FFD541] text-[#1d2022] rounded-[10px] font-semibold hover:bg-[#f5c728] transition-colors"
            >
              웨이팅 등록하기
            </a>
          </div>
        </div>
      </div>
    );
  }

  const { waiting, storeName } = data;
  const isActive = waiting.status === 'WAITING' || waiting.status === 'CALLED';

  return (
    <div className="h-[100dvh] bg-white font-pretendard flex justify-center overflow-hidden">
      <div className="w-full max-w-[430px] h-full flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#ebeced]">
          <h1 className="text-[16px] font-semibold text-[#1d2022] text-center">{storeName}</h1>
        </div>

        {/* Main Content */}
        <div className="flex-1 px-5 py-6 overflow-y-auto">
          {/* Status Card */}
          {waiting.status === 'WAITING' && (
            <div className="text-center py-8 px-6 bg-[#f8f9fa] rounded-[16px] mb-6">
              <p className="text-[14px] text-[#91949a] mb-2">현재 내 순서</p>
              <p className="text-[48px] font-bold text-[#1d2022]">
                <span className="text-[#6BA3FF]">{waiting.position ?? '-'}</span>
                <span className="text-[24px] font-normal ml-1">번째</span>
              </p>
              {waiting.estimatedWaitMinutes !== null && (
                <>
                  <p className="text-[14px] text-[#91949a] mt-4">예상 대기시간</p>
                  <p className="text-[24px] font-bold text-[#1d2022]">약 {waiting.estimatedWaitMinutes}분</p>
                </>
              )}
            </div>
          )}

          {waiting.status === 'CALLED' && (
            <div className="text-center py-8 px-6 bg-[#FFD541] rounded-[16px] mb-6">
              <p className="text-[14px] text-[#1d2022] font-medium mb-2">지금 입장해주세요!</p>
              <div className="w-16 h-16 mx-auto bg-[#1d2022] rounded-full flex items-center justify-center">
                <Bell className="w-8 h-8 text-white" />
              </div>
              {callRemainingSeconds !== null && (
                <>
                  <p className="text-[32px] font-bold text-[#1d2022] mt-2 font-mono">
                    {formatCountdown(callRemainingSeconds)}
                  </p>
                  <p className="text-[14px] text-[#1d2022] mt-1">남은 시간</p>
                </>
              )}
              {waiting.calledCount > 1 && (
                <p className="text-[12px] text-[#1d2022] mt-2 opacity-70">
                  호출 {waiting.calledCount}회
                </p>
              )}
            </div>
          )}

          {waiting.status === 'SEATED' && (
            <div className="text-center py-8 px-6 bg-[#E8F8E5] rounded-[16px] mb-6">
              <div className="w-16 h-16 mx-auto bg-[#61EB49] rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-[20px] font-bold text-[#1d2022]">착석 완료</p>
              <p className="text-[14px] text-[#55595e] mt-2">즐거운 식사 되세요!</p>
            </div>
          )}

          {(waiting.status === 'CANCELLED' || waiting.status === 'NO_SHOW') && (
            <div className="text-center py-8 px-6 bg-[#FFF0F3] rounded-[16px] mb-6">
              <div className="w-16 h-16 mx-auto bg-[#FF6B6B] rounded-full flex items-center justify-center mb-4">
                <XCircle className="w-8 h-8 text-white" />
              </div>
              <p className="text-[20px] font-bold text-[#1d2022]">웨이팅이 취소되었습니다</p>
              <p className="text-[14px] text-[#55595e] mt-2">
                {waiting.cancelReason ? CANCEL_REASON_LABELS[waiting.cancelReason] || '취소됨' : '취소됨'}
              </p>
            </div>
          )}

          {/* Waiting Info Card */}
          <div className="bg-[#f8f9fa] rounded-[16px] p-5 mb-6">
            <div className="flex justify-between items-center py-2 border-b border-[#ebeced]">
              <span className="text-[14px] text-[#91949a]">대기번호</span>
              <span className="text-[14px] font-semibold text-[#1d2022]">#{waiting.waitingNumber}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-[#ebeced]">
              <span className="text-[14px] text-[#91949a]">인원</span>
              <span className="text-[14px] font-semibold text-[#1d2022]">{waiting.partySize}명</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-[#ebeced]">
              <span className="text-[14px] text-[#91949a]">유형</span>
              <span className="text-[14px] font-semibold text-[#1d2022]">{waiting.waitingTypeName}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-[14px] text-[#91949a]">등록시간</span>
              <span className="text-[14px] font-semibold text-[#1d2022]">{formatTime(waiting.createdAt)}</span>
            </div>
          </div>

          {/* Notice for WAITING/CALLED status */}
          {isActive && (
            <div className="bg-[#FFF8E1] rounded-[10px] p-4 mb-6">
              <div className="flex items-start gap-2">
                <span className="text-[16px]">⚠️</span>
                <p className="text-[13px] text-[#55595e]">
                  호출 시 제한 시간 내에 입장해주세요. 미입장 시 자동으로 취소될 수 있습니다.
                </p>
              </div>
            </div>
          )}

          {/* Cancel Button - only for active statuses */}
          {isActive && (
            <button
              onClick={handleCancelClick}
              className="w-full py-4 border border-[#FF6B6B] text-[#FF6B6B] rounded-[10px] text-[15px] font-semibold hover:bg-[#FFF0F3] transition-colors"
            >
              웨이팅 취소하기
            </button>
          )}

          {/* Re-register button for terminal states */}
          {!isActive && (
            <a
              href={`/w/${storeSlug}`}
              className="block w-full py-4 bg-[#FFD541] text-[#1d2022] rounded-[10px] text-[15px] font-semibold text-center hover:bg-[#f5c728] transition-colors"
            >
              다시 웨이팅 등록하기
            </a>
          )}
        </div>

        {/* Auto-refresh indicator for active statuses */}
        {isActive && (
          <div className="px-5 py-3 border-t border-[#ebeced]">
            <div className="flex items-center justify-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#6BA3FF] animate-pulse" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#6BA3FF] animate-pulse" style={{ animationDelay: '0.2s' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-[#6BA3FF] animate-pulse" style={{ animationDelay: '0.4s' }} />
              <span className="text-[12px] text-[#91949a] ml-2">자동 새로고침</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
