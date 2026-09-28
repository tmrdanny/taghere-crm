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

// 포인트 수동 적립 모달.
export function EarnPointsModal({
  open,
  onOpenChange,
  customer,
  earnAmount,
  onAmountChange,
  earnReason,
  onReasonChange,
  submitting,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  earnAmount: string;
  onAmountChange: (value: string) => void;
  earnReason: string;
  onReasonChange: (value: string) => void;
  submitting: boolean;
  onSubmit: () => void;
}) {
  const earnedPoints = customer ? customer.totalPoints + (parseInt(earnAmount) || 0) : 0;

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="rounded-[20px] border-0 shadow-[0_24px_60px_-20px_rgba(19,22,81,0.4)] sm:max-w-lg">
        <ModalHeader>
          <ModalTitle className="text-[17px] font-semibold text-[color:var(--ad-ink)]">포인트 적립</ModalTitle>
        </ModalHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-[13px] font-medium text-[#383c40]">적립 대상</label>
            <div className="flex items-center justify-between p-3 bg-[#f8f9fa] rounded-[10px]">
              <span className="text-[#91959a]">적립 대상</span>
              <span className="font-medium text-[#1d2022]">{maskNickname(customer?.name)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[13px] font-medium text-[#383c40]">현재 보유 포인트</label>
            <div className="flex items-center justify-between p-3 bg-[#f8f9fa] rounded-[10px]">
              <span className="text-[#91959a]">보유 포인트</span>
              <span className="font-semibold text-[#1d2022]">
                {formatNumber(customer?.totalPoints || 0)} p
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[13px] font-medium text-[#383c40]">적립할 포인트</label>
            <div className="relative">
              <Input
                type="number"
                placeholder="0"
                value={earnAmount}
                onChange={(e) => onAmountChange(e.target.value)}
                className="pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#91959a]">p</span>
            </div>
            <div className="text-right text-[13px] text-[#55595e]">
              적립 후 잔액{' '}
              <span className="font-medium text-[#1d2022]">{formatNumber(earnedPoints)} p</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[13px] font-medium text-[#383c40]">적립 사유 (선택)</label>
            <Input
              placeholder="예: 방문 적립"
              value={earnReason}
              onChange={(e) => onReasonChange(e.target.value)}
            />
          </div>
        </div>

        <ModalFooter>
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            className="flex-1 ad-press h-10 rounded-[12px] border-0 bg-white text-[13.5px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
          >
            취소
          </Button>
          <Button
            onClick={onSubmit}
            disabled={!earnAmount || parseInt(earnAmount) <= 0 || submitting}
            className="flex-1 ad-press h-10 rounded-[12px] bg-[color:var(--ad-ink)] text-[13.5px] font-semibold text-white hover:bg-[#383c40] disabled:opacity-40"
          >
            {submitting ? '처리 중...' : '적립하기'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
