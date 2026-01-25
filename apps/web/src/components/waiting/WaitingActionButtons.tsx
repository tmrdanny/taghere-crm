'use client';

import { Button } from '@/components/ui/button';
import { Phone, UserCheck, X, RotateCcw, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WaitingItem, WaitingStatus } from './types';

interface WaitingActionButtonsProps {
  item: WaitingItem;
  onCall: (id: string) => void;
  onRecall: (id: string) => void;
  onSeat: (id: string) => void;
  onCancel: (id: string) => void;
  onRestore: (id: string) => void;
  isCallLoading?: boolean;
  isSeatLoading?: boolean;
  isCancelLoading?: boolean;
  isRestoreLoading?: boolean;
  maxCallCount: number;
}

export function WaitingActionButtons({
  item,
  onCall,
  onRecall,
  onSeat,
  onCancel,
  onRestore,
  isCallLoading = false,
  isSeatLoading = false,
  isCancelLoading = false,
  isRestoreLoading = false,
  maxCallCount,
}: WaitingActionButtonsProps) {
  const isWaiting = item.status === 'WAITING';
  const isCalled = item.status === 'CALLED';
  const isSeated = item.status === 'SEATED';
  const isCancelled = item.status === 'CANCELLED' || item.status === 'NO_SHOW';

  // Check if restore is available (within 30 minutes)
  const canRestore = () => {
    if (!isSeated && !isCancelled) return false;

    const actionTime = item.seatedAt || item.cancelledAt;
    if (!actionTime) return false;

    const actionDate = new Date(actionTime);
    const now = new Date();
    const diffMinutes = (now.getTime() - actionDate.getTime()) / (1000 * 60);

    return diffMinutes <= 30;
  };

  const canRecall = isCalled && item.calledCount < maxCallCount;

  // Waiting state - show Call, Seat, Cancel buttons
  if (isWaiting) {
    return (
      <div className="flex items-center justify-center gap-2">
        <Button
          variant="default"
          size="sm"
          onClick={() => onCall(item.id)}
          disabled={isCallLoading}
        >
          {isCallLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Phone className="w-4 h-4 mr-1" />
              호출
            </>
          )}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onSeat(item.id)}
          disabled={isSeatLoading}
        >
          {isSeatLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <UserCheck className="w-4 h-4 mr-1" />
              착석
            </>
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onCancel(item.id)}
          disabled={isCancelLoading}
          className="text-neutral-600 hover:text-error hover:border-error"
        >
          {isCancelLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <X className="w-4 h-4 mr-1" />
              취소
            </>
          )}
        </Button>
      </div>
    );
  }

  // Called state - show Recall (if available), Seat, Cancel buttons
  if (isCalled) {
    return (
      <div className="flex items-center justify-center gap-2">
        {canRecall && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRecall(item.id)}
            disabled={isCallLoading}
            className="border-brand-300 text-brand-800 hover:bg-brand-50"
          >
            {isCallLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Phone className="w-4 h-4 mr-1" />
                재호출
              </>
            )}
          </Button>
        )}
        <Button
          variant="default"
          size="sm"
          onClick={() => onSeat(item.id)}
          disabled={isSeatLoading}
        >
          {isSeatLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <UserCheck className="w-4 h-4 mr-1" />
              착석
            </>
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onCancel(item.id)}
          disabled={isCancelLoading}
          className="text-neutral-600 hover:text-error hover:border-error"
        >
          {isCancelLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <X className="w-4 h-4 mr-1" />
              취소
            </>
          )}
        </Button>
      </div>
    );
  }

  // Seated or Cancelled state - show Restore button (if within 30 minutes)
  if (isSeated || isCancelled) {
    if (canRestore()) {
      return (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onRestore(item.id)}
          disabled={isRestoreLoading}
          className="text-neutral-600"
        >
          {isRestoreLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <RotateCcw className="w-4 h-4 mr-1" />
              되돌리기
            </>
          )}
        </Button>
      );
    }
    return <span className="text-sm text-neutral-400">-</span>;
  }

  return null;
}
