'use client';

import { useState } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalFooter,
  ModalDescription,
} from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CancelReason, CANCEL_REASON_LABELS } from './types';
import { Loader2 } from 'lucide-react';

interface CancelReasonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: CancelReason) => Promise<void>;
  isLoading?: boolean;
  waitingNumber?: number;
}

const CANCEL_REASONS: CancelReason[] = [
  'CUSTOMER_REQUEST',
  'STORE_REASON',
  'OUT_OF_STOCK',
  'NO_SHOW',
];

export function CancelReasonModal({
  open,
  onOpenChange,
  onConfirm,
  isLoading = false,
  waitingNumber,
}: CancelReasonModalProps) {
  const [selectedReason, setSelectedReason] = useState<CancelReason>('CUSTOMER_REQUEST');

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedReason('CUSTOMER_REQUEST');
    }
    onOpenChange(isOpen);
  };

  const handleConfirm = async () => {
    await onConfirm(selectedReason);
  };

  return (
    <Modal open={open} onOpenChange={handleOpenChange}>
      <ModalContent className="max-w-sm">
        <ModalHeader>
          <ModalTitle>웨이팅 취소</ModalTitle>
          {waitingNumber && (
            <ModalDescription>
              #{waitingNumber} 웨이팅을 취소합니다.
            </ModalDescription>
          )}
        </ModalHeader>

        <div className="py-4">
          <p className="text-sm text-neutral-600 mb-4">
            취소 사유를 선택해주세요
          </p>

          <div className="space-y-2">
            {CANCEL_REASONS.map((reason) => (
              <label
                key={reason}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                  selectedReason === reason
                    ? 'border-brand-800 bg-brand-50'
                    : 'border-neutral-200 hover:bg-neutral-50'
                )}
              >
                <input
                  type="radio"
                  name="cancelReason"
                  value={reason}
                  checked={selectedReason === reason}
                  onChange={() => setSelectedReason(reason)}
                  className="w-4 h-4 text-brand-800 border-neutral-300 focus:ring-brand-800"
                />
                <span
                  className={cn(
                    'text-sm font-medium',
                    selectedReason === reason
                      ? 'text-brand-800'
                      : 'text-neutral-700'
                  )}
                >
                  {CANCEL_REASON_LABELS[reason]}
                </span>
              </label>
            ))}
          </div>

          <p className="text-xs text-neutral-500 mt-4">
            * 선택한 사유가 고객 알림톡에 포함됩니다
          </p>
        </div>

        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isLoading}
          >
            취소
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                처리 중...
              </>
            ) : (
              '확인'
            )}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
