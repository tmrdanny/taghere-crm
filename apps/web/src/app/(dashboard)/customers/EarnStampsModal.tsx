import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalFooter,
} from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatNumber, maskNickname } from '@/lib/utils';
import { Customer } from './types';

// 스탬프 수동 적립 모달.
export function EarnStampsModal({
  open,
  onOpenChange,
  customer,
  stampAmount,
  onAmountChange,
  stampReason,
  onReasonChange,
  submitting,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  stampAmount: string;
  onAmountChange: (value: string) => void;
  stampReason: string;
  onReasonChange: (value: string) => void;
  submitting: boolean;
  onSubmit: () => void;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="sm:max-w-lg">
        <ModalHeader>
          <ModalTitle>스탬프 적립</ModalTitle>
        </ModalHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-600">적립 대상</label>
            <div className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg">
              <span className="text-neutral-400">적립 대상</span>
              <span className="font-medium text-neutral-900">{maskNickname(customer?.name)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-600">현재 보유 스탬프</label>
            <div className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg">
              <span className="text-neutral-400">보유 스탬프</span>
              <span className="font-semibold text-neutral-900">
                {formatNumber(customer?.totalStamps || 0)}개
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-600">적립할 스탬프 수</label>
            <div className="relative">
              <Input
                type="number"
                min="1"
                placeholder="1"
                value={stampAmount}
                onChange={(e) => onAmountChange(e.target.value)}
                className="pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">개</span>
            </div>
            <div className="text-right text-sm text-neutral-500">
              적립 후 잔액{' '}
              <span className="font-medium text-neutral-900">
                {formatNumber((customer?.totalStamps || 0) + (parseInt(stampAmount) || 0))}개
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-600">적립 사유 (선택)</label>
            <Input
              placeholder="예: 수동 적립"
              value={stampReason}
              onChange={(e) => onReasonChange(e.target.value)}
            />
          </div>
        </div>

        <ModalFooter>
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            className="flex-1"
          >
            취소
          </Button>
          <Button
            onClick={onSubmit}
            disabled={!stampAmount || parseInt(stampAmount) <= 0 || submitting}
            className="flex-1"
          >
            {submitting ? '처리 중...' : '적립하기'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
