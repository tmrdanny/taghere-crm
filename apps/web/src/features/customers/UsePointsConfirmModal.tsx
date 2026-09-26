import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalFooter,
} from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { formatNumber, maskNickname } from '@/lib/utils';
import { Customer } from './types';

// 포인트 사용 확인 모달.
// 닫기/돌아가기 시 포인트 사용 입력 모달(usePointsModal)을 다시 연다(onBack).
export function UsePointsConfirmModal({
  open,
  customer,
  useAmount,
  submitting,
  onBack,
  onConfirm,
}: {
  open: boolean;
  customer: Customer | null;
  useAmount: string;
  submitting: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal open={open} onOpenChange={(o) => { if (!o) onBack(); }}>
      <ModalContent className="rounded-[20px] border-0 shadow-[0_24px_60px_-20px_rgba(19,22,81,0.4)] sm:max-w-sm">
        <ModalHeader>
          <ModalTitle className="text-[17px] font-semibold text-[color:var(--ad-ink)]">포인트 사용 확인</ModalTitle>
        </ModalHeader>
        <div className="py-4 text-center space-y-2">
          <p className="text-[#383c40]">
            <span className="font-semibold text-[#1d2022]">{maskNickname(customer?.name)}</span> 님의 포인트를
          </p>
          <p className="text-[20px] font-semibold ad-tnum text-[#cc0832]">
            {formatNumber(parseInt(useAmount) || 0)} p 사용
          </p>
          <p className="text-[13px] text-[#55595e]">
            사용 후 잔액: {formatNumber(Math.max(0, (customer?.totalPoints || 0) - (parseInt(useAmount) || 0)))} p
          </p>
        </div>
        <ModalFooter>
          <Button
            variant="secondary"
            onClick={onBack}
            className="flex-1 ad-press h-10 rounded-[12px] border-0 bg-white text-[13.5px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
          >
            돌아가기
          </Button>
          <Button
            onClick={onConfirm}
            disabled={submitting}
            className="flex-1 ad-press h-10 rounded-[12px] bg-[#cc0832] text-[13.5px] font-semibold text-white hover:bg-[#b0072b] disabled:opacity-50"
          >
            {submitting ? '처리 중...' : '확인'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
