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

// 스탬프 수동 적립/차감 모달.
export function EarnStampsModal({
  open,
  onOpenChange,
  customer,
  mode = 'earn',
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
  mode?: 'earn' | 'deduct';
  stampAmount: string;
  onAmountChange: (value: string) => void;
  stampReason: string;
  onReasonChange: (value: string) => void;
  submitting: boolean;
  onSubmit: () => void;
}) {
  const isDeduct = mode === 'deduct';
  const amount = parseInt(stampAmount) || 0;
  const currentStamps = customer?.totalStamps || 0;
  const balanceAfter = isDeduct ? currentStamps - amount : currentStamps + amount;
  const exceedsBalance = isDeduct && amount > currentStamps;

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="rounded-[20px] border-0 shadow-[0_24px_60px_-20px_rgba(19,22,81,0.4)] sm:max-w-lg">
        <ModalHeader>
          <ModalTitle className="text-[17px] font-semibold text-[color:var(--ad-ink)]">{isDeduct ? '스탬프 차감' : '스탬프 적립'}</ModalTitle>
        </ModalHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-[13px] font-medium text-[#383c40]">
              {isDeduct ? '차감 대상' : '적립 대상'}
            </label>
            <div className="flex items-center justify-between p-3 bg-[#f8f9fa] rounded-[10px]">
              <span className="text-[#91959a]">{isDeduct ? '차감 대상' : '적립 대상'}</span>
              <span className="font-medium text-[#1d2022]">{maskNickname(customer?.name)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[13px] font-medium text-[#383c40]">현재 보유 스탬프</label>
            <div className="flex items-center justify-between p-3 bg-[#f8f9fa] rounded-[10px]">
              <span className="text-[#91959a]">보유 스탬프</span>
              <span className="font-semibold text-[#1d2022]">
                {formatNumber(currentStamps)}개
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[13px] font-medium text-[#383c40]">
              {isDeduct ? '차감할 스탬프 수' : '적립할 스탬프 수'}
            </label>
            <div className="relative">
              <Input
                type="number"
                min="1"
                placeholder="1"
                value={stampAmount}
                onChange={(e) => onAmountChange(e.target.value)}
                className="pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#91959a]">개</span>
            </div>
            <div className="text-right text-[13px] text-[#55595e]">
              {isDeduct ? '차감 후 잔액' : '적립 후 잔액'}{' '}
              <span className={`font-medium ${exceedsBalance ? 'text-[#cc0832]' : 'text-[#1d2022]'}`}>
                {formatNumber(balanceAfter)}개
              </span>
            </div>
            {exceedsBalance && (
              <p className="text-right text-[12px] text-[#cc0832]">
                보유 스탬프보다 많이 차감할 수 없습니다.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-[13px] font-medium text-[#383c40]">
              {isDeduct ? '차감 사유 (선택)' : '적립 사유 (선택)'}
            </label>
            <Input
              placeholder={isDeduct ? '예: 실수 적립 취소' : '예: 수동 적립'}
              value={stampReason}
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
            disabled={!stampAmount || amount <= 0 || exceedsBalance || submitting}
            variant={isDeduct ? 'destructive' : 'default'}
            className={isDeduct ? 'flex-1 ad-press h-10 rounded-[12px] bg-[#cc0832] text-[13.5px] font-semibold text-white hover:bg-[#b0072b] disabled:opacity-50' : 'flex-1 ad-press h-10 rounded-[12px] bg-[color:var(--ad-ink)] text-[13.5px] font-semibold text-white hover:bg-[#383c40] disabled:opacity-40'}
          >
            {submitting ? '처리 중...' : isDeduct ? '차감하기' : '적립하기'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
