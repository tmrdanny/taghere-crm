'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { CheckCircle2, MessageCircle, Users, Clock, Loader2 } from 'lucide-react';

interface WaitingCompleteProps {
  waitingNumber: number;
  position: number;
  estimatedMinutes: number;
  totalWaiting: number;
  typeName?: string;
  storeName?: string;
  onCancel?: () => Promise<void>;
  isCancelling?: boolean;
  showKakaoInfo?: boolean;
  className?: string;
}

export function WaitingComplete({
  waitingNumber,
  position,
  estimatedMinutes,
  totalWaiting,
  typeName,
  storeName,
  onCancel,
  isCancelling = false,
  showKakaoInfo = true,
  className,
}: WaitingCompleteProps) {
  return (
    <div className={cn('min-h-screen bg-neutral-50 flex items-center justify-center p-6', className)}>
      <div className="max-w-md w-full">
        {/* Success Icon */}
        <div className="text-center mb-6">
          <div className="w-20 h-20 bg-success-light rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-10 h-10 text-success" />
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 mb-1">
            웨이팅 등록 완료!
          </h1>
          {storeName && (
            <p className="text-neutral-500">{storeName}</p>
          )}
        </div>

        {/* Waiting Number Card */}
        <div className="bg-white rounded-2xl p-8 shadow-sm mb-6">
          <div className="text-center">
            {typeName && (
              <p className="text-sm text-brand-600 font-medium mb-2">{typeName}</p>
            )}
            <p className="text-neutral-500 text-sm mb-2">대기번호</p>
            <div className="text-6xl font-bold text-brand-800 mb-6">
              #{waitingNumber}
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-4 py-4 border-t border-neutral-100">
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-neutral-500 text-xs mb-1">
                  <Users className="w-3.5 h-3.5" />
                  <span>내 순서</span>
                </div>
                <p className="text-xl font-bold text-neutral-900">{position}번째</p>
              </div>
              <div className="text-center border-x border-neutral-100">
                <div className="flex items-center justify-center gap-1 text-neutral-500 text-xs mb-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>예상 대기</span>
                </div>
                <p className="text-xl font-bold text-neutral-900">약 {estimatedMinutes}분</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-neutral-500 text-xs mb-1">
                  <Users className="w-3.5 h-3.5" />
                  <span>현재 대기</span>
                </div>
                <p className="text-xl font-bold text-neutral-900">{totalWaiting}팀</p>
              </div>
            </div>
          </div>
        </div>

        {/* Kakao Info */}
        {showKakaoInfo && (
          <div className="bg-yellow-50 rounded-xl p-4 mb-6 flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-400 rounded-lg flex items-center justify-center flex-shrink-0">
              <MessageCircle className="w-5 h-5 text-neutral-900" />
            </div>
            <p className="text-sm text-neutral-700">
              카카오톡으로 순서 알림을 보내드려요.<br />
              <span className="text-neutral-500">알림 수신 후 매장으로 이동해주세요.</span>
            </p>
          </div>
        )}

        {/* Cancel Button */}
        {onCancel && (
          <Button
            onClick={onCancel}
            disabled={isCancelling}
            variant="secondary"
            size="lg"
            className="w-full"
          >
            {isCancelling ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                취소 중...
              </>
            ) : (
              '웨이팅 취소하기'
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
