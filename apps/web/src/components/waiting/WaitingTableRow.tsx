'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn, formatPhone } from '@/lib/utils';
import { WaitingItem, SOURCE_LABELS, CANCEL_REASON_LABELS } from './types';
import { WaitingActionButtons } from './WaitingActionButtons';

interface WaitingTableRowProps {
  item: WaitingItem;
  index: number;
  onCall: (id: string) => void;
  onRecall: (id: string) => void;
  onSeat: (id: string) => void;
  onCancel: (id: string) => void;
  onRestore: (id: string) => void;
  loadingStates: {
    call: string | null;
    seat: string | null;
    cancel: string | null;
    restore: string | null;
  };
  maxCallCount: number;
  callTimeoutMinutes: number;
}

export function WaitingTableRow({
  item,
  index,
  onCall,
  onRecall,
  onSeat,
  onCancel,
  onRestore,
  loadingStates,
  maxCallCount,
  callTimeoutMinutes,
}: WaitingTableRowProps) {
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [callRemainingSeconds, setCallRemainingSeconds] = useState<number | null>(null);

  // Calculate elapsed time
  useEffect(() => {
    const updateElapsedTime = () => {
      const createdAt = new Date(item.createdAt);
      const now = new Date();
      const diffMinutes = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60));
      setElapsedMinutes(diffMinutes);
    };

    updateElapsedTime();
    const interval = setInterval(updateElapsedTime, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [item.createdAt]);

  // Calculate call countdown timer
  useEffect(() => {
    if (item.status !== 'CALLED' || !item.callExpireAt) {
      setCallRemainingSeconds(null);
      return;
    }

    const updateCountdown = () => {
      const expireAt = new Date(item.callExpireAt!);
      const now = new Date();
      const remainingSeconds = Math.max(0, Math.floor((expireAt.getTime() - now.getTime()) / 1000));
      setCallRemainingSeconds(remainingSeconds);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [item.status, item.callExpireAt]);

  // Determine if waiting time is over threshold (e.g., 30 minutes)
  const isOverTime = elapsedMinutes >= 30;
  const overTimeMinutes = Math.max(0, elapsedMinutes - 30);

  // Format time display
  const formatCreatedTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // Format call remaining time
  const formatCallRemaining = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Get call count display text
  const getCallCountText = () => {
    if (item.calledCount === 0) return null;
    if (item.calledCount === 1) return '(최초)';
    return `(${item.calledCount}회)`;
  };

  const isWaiting = item.status === 'WAITING';
  const isCalled = item.status === 'CALLED';
  const isSeated = item.status === 'SEATED';
  const isCancelled = item.status === 'CANCELLED' || item.status === 'NO_SHOW';

  return (
    <tr className={cn(
      'border-b border-neutral-100 hover:bg-neutral-50/50 transition-colors',
      isCalled && 'bg-brand-50/30'
    )}>
      {/* Order */}
      <td className="py-4 px-4 text-center">
        <span className="font-semibold text-neutral-900">{index + 1}</span>
      </td>

      {/* Waiting Number */}
      <td className="py-4 px-4">
        <div className="flex flex-col items-center gap-1">
          <span className="text-lg font-bold text-neutral-900">
            {item.waitingNumber}
          </span>
          <span className="text-xs text-neutral-500">
            {SOURCE_LABELS[item.source]}
          </span>
        </div>
      </td>

      {/* Waiting Info */}
      <td className="py-4 px-4">
        <div className="flex flex-col gap-1">
          <span className="font-medium text-neutral-900">
            {item.partySize}인
          </span>
          {item.waitingType && (
            <span className="text-xs text-neutral-500 truncate max-w-[100px]">
              {item.waitingType.name}
            </span>
          )}
        </div>
      </td>

      {/* Status */}
      <td className="py-4 px-4">
        <div className="flex flex-col gap-1">
          {/* Time over badge */}
          {isWaiting && isOverTime && (
            <Badge variant="error" className="text-xs w-fit">
              {overTimeMinutes}분 초과
            </Badge>
          )}

          {/* Elapsed time / Call countdown */}
          {(isWaiting || isCalled) && (
            <span className={cn(
              'text-sm font-medium',
              isCalled ? 'text-brand-800' : 'text-neutral-900'
            )}>
              {isCalled && callRemainingSeconds !== null ? (
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-brand-800 animate-pulse" />
                  {formatCallRemaining(callRemainingSeconds)}
                </span>
              ) : (
                `${elapsedMinutes}분`
              )}
            </span>
          )}

          {/* Called status badge */}
          {isCalled && (
            <Badge variant="info" className="text-xs w-fit">
              호출 중
            </Badge>
          )}

          {/* Seated status */}
          {isSeated && (
            <Badge variant="success" className="text-xs w-fit">
              착석 완료
            </Badge>
          )}

          {/* Cancelled status */}
          {isCancelled && (
            <Badge variant="error" className="text-xs w-fit">
              {item.cancelReason ? CANCEL_REASON_LABELS[item.cancelReason] : '취소'}
            </Badge>
          )}

          {/* Created time */}
          <span className="text-xs text-neutral-400">
            {formatCreatedTime(item.createdAt)}
          </span>
        </div>
      </td>

      {/* Customer Info */}
      <td className="py-4 px-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-neutral-900">
            {item.phone ? formatPhone(item.phone) : (item.name || '번호 없음')}
          </span>
          {item.calledCount > 0 && (
            <span className="text-xs text-brand-700">
              {getCallCountText()}
            </span>
          )}
        </div>
      </td>

      {/* Actions */}
      <td className="py-4 px-4 text-center">
        <WaitingActionButtons
          item={item}
          onCall={onCall}
          onRecall={onRecall}
          onSeat={onSeat}
          onCancel={onCancel}
          onRestore={onRestore}
          isCallLoading={loadingStates.call === item.id}
          isSeatLoading={loadingStates.seat === item.id}
          isCancelLoading={loadingStates.cancel === item.id}
          isRestoreLoading={loadingStates.restore === item.id}
          maxCallCount={maxCallCount}
        />
      </td>
    </tr>
  );
}
