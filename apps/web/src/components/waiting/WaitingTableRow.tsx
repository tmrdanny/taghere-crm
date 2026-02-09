'use client';

import { useState, useEffect, memo, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn, formatPhoneFull } from '@/lib/utils';
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

// React.memo로 불필요한 리렌더 방지 (5초마다 폴링하므로 중요)
export const WaitingTableRow = memo(function WaitingTableRow({
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
    const interval = setInterval(updateElapsedTime, 60000);

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

  // Memoized status checks
  const isWaiting = item.status === 'WAITING';
  const isCalled = item.status === 'CALLED';
  const isSeated = item.status === 'SEATED';
  const isCancelled = item.status === 'CANCELLED' || item.status === 'NO_SHOW';

  // Determine if waiting time is over threshold (30 minutes)
  const isOverTime = elapsedMinutes >= 30;
  const overTimeMinutes = Math.max(0, elapsedMinutes - 30);

  // Memoize formatted time to avoid recalculation
  const formattedCreatedTime = useMemo(() => {
    const date = new Date(item.createdAt);
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  }, [item.createdAt]);

  // Format call remaining time
  const formatCallRemaining = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Get call count display text
  const callCountText = useMemo(() => {
    if (item.calledCount === 0) return null;
    if (item.calledCount === 1) return '최초 호출';
    return `${item.calledCount}회 호출`;
  }, [item.calledCount]);

  return (
    <tr
      className={cn(
        'border-b border-neutral-100 transition-colors',
        // content-visibility로 오프스크린 렌더링 지연 (긴 리스트 성능 최적화)
        '[content-visibility:auto] [contain-intrinsic-size:0_72px]',
        // 상태별 배경색
        isCalled && 'bg-amber-50/60 hover:bg-amber-50/80',
        isWaiting && 'hover:bg-neutral-50',
        isSeated && 'bg-green-50/30 hover:bg-green-50/50',
        isCancelled && 'bg-neutral-50/50 hover:bg-neutral-100/50 opacity-70'
      )}
    >
      {/* 순서 */}
      <td className="py-3 px-3 text-center align-middle">
        <div className={cn(
          'inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold',
          isCalled ? 'bg-amber-100 text-amber-800' : 'bg-neutral-100 text-neutral-700'
        )}>
          {index + 1}
        </div>
      </td>

      {/* 호출번호 */}
      <td className="py-3 px-3 text-center align-middle">
        <div className="flex flex-col items-center">
          <span className={cn(
            'text-xl font-bold tabular-nums',
            isCalled ? 'text-amber-700' : 'text-neutral-900'
          )}>
            {item.waitingNumber}
          </span>
          <Badge
            variant={item.source === 'QR' ? 'info' : item.source === 'TABLET' ? 'default' : 'secondary'}
            className="text-[10px] px-1.5 py-0 mt-0.5"
          >
            {SOURCE_LABELS[item.source]}
          </Badge>
        </div>
      </td>

      {/* 웨이팅 정보 (인원 + 유형) */}
      <td className="py-3 px-3 align-middle">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            {item.adultCount != null && item.childCount != null ? (
              <span className="text-sm font-semibold text-neutral-900">
                성인 {item.adultCount} / 유아 {item.childCount}
              </span>
            ) : (
              <span className="text-base font-semibold text-neutral-900">
                {item.partySize}명
              </span>
            )}
          </div>
          {item.waitingType && (
            <span className="text-xs text-neutral-500 truncate max-w-[100px]">
              {item.waitingType.name}
            </span>
          )}
        </div>
      </td>

      {/* 웨이팅 상태 */}
      <td className="py-3 px-3 align-middle">
        <div className="flex flex-col gap-1">
          {/* 상태 뱃지 */}
          {isCalled && (
            <div className="flex items-center gap-1.5">
              <Badge variant="warning" className="text-xs px-2 py-0.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse mr-1" />
                호출 중
              </Badge>
              {callRemainingSeconds !== null && (
                <span className="text-sm font-bold tabular-nums text-amber-700">
                  {formatCallRemaining(callRemainingSeconds)}
                </span>
              )}
            </div>
          )}

          {isWaiting && (
            <div className="flex items-center gap-2">
              <span className={cn(
                'text-sm font-medium tabular-nums',
                isOverTime ? 'text-red-600' : 'text-neutral-700'
              )}>
                {elapsedMinutes}분 대기
              </span>
              {isOverTime && (
                <Badge variant="error" className="text-[10px] px-1.5 py-0">
                  +{overTimeMinutes}분
                </Badge>
              )}
            </div>
          )}

          {isSeated && (
            <Badge variant="success" className="text-xs px-2 py-0.5 w-fit">
              착석 완료
            </Badge>
          )}

          {isCancelled && (
            <Badge variant="error" className="text-xs px-2 py-0.5 w-fit">
              {item.cancelReason ? CANCEL_REASON_LABELS[item.cancelReason] : '취소됨'}
            </Badge>
          )}

          {/* 등록 시간 */}
          <span className="text-[11px] text-neutral-400">
            {formattedCreatedTime} 등록
          </span>
        </div>
      </td>

      {/* 고객 정보 */}
      <td className="py-3 px-3 align-middle">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-neutral-900">
            {item.phone ? formatPhoneFull(item.phone) : (item.name || '-')}
          </span>
          {callCountText && (
            <span className={cn(
              'text-[11px]',
              isCalled ? 'text-amber-600 font-medium' : 'text-neutral-500'
            )}>
              {callCountText}
            </span>
          )}
          {item.memo && (
            <span className="text-[11px] text-neutral-400 truncate max-w-[120px]" title={item.memo}>
              {item.memo}
            </span>
          )}
        </div>
      </td>

      {/* 액션 버튼 */}
      <td className="py-3 px-3 text-center align-middle">
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
});
