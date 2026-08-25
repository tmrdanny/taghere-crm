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

// 포인트 사용 입력 모달. '사용하기' 시 확인 모달로 넘어간다(onProceed).
export function UsePointsModal({
  open,
  onOpenChange,
  customer,
  useAmount,
  onAmountChange,
  useReason,
  onReasonChange,
  submitting,
  onProceed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  useAmount: string;
  onAmountChange: (value: string) => void;
  useReason: string;
  onReasonChange: (value: string) => void;
  submitting: boolean;
  onProceed: () => void;
}) {
  const remainingPoints = customer ? customer.totalPoints - (parseInt(useAmount) || 0) : 0;

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="sm:max-w-lg">
        <ModalHeader>
          <ModalTitle>포인트 사용</ModalTitle>
        </ModalHeader>

        <div className="space-y-4 py-4">
          {/* Target */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-600">
              사용 대상
            </label>
            <div className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg">
              <span className="text-neutral-400">사용 대상</span>
              <span className="font-medium text-neutral-900">
                {maskNickname(customer?.name)}
              </span>
            </div>
          </div>

          {/* Available Points */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-600">
              보유 포인트
            </label>
            <div className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg">
              <span className="text-neutral-400">보유 포인트</span>
              <span className="font-semibold text-neutral-900">
                {formatNumber(customer?.totalPoints || 0)} p
              </span>
            </div>
          </div>

          {/* Use Amount */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-600">
              사용할 포인트
            </label>
            <div className="relative">
              <Input
                type="number"
                placeholder="0"
                value={useAmount}
                onChange={(e) => onAmountChange(e.target.value)}
                className="pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">
                p
              </span>
            </div>
            <div className="text-right text-sm text-neutral-500">
              사용 후 잔액{' '}
              <span className="font-medium text-neutral-900">
                {formatNumber(Math.max(0, remainingPoints))} p
              </span>
            </div>
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-600">
              사용 사유 (선택)
            </label>
            <Input
              placeholder="예: 단골 서비스"
              value={useReason}
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
            onClick={onProceed}
            disabled={
              !useAmount ||
              parseInt(useAmount) <= 0 ||
              parseInt(useAmount) > (customer?.totalPoints || 0) ||
              submitting
            }
            className="flex-1"
          >
            사용하기
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
