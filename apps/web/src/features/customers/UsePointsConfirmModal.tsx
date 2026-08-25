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
      <ModalContent className="sm:max-w-sm">
        <ModalHeader>
          <ModalTitle>포인트 사용 확인</ModalTitle>
        </ModalHeader>
        <div className="py-4 text-center space-y-2">
          <p className="text-neutral-600">
            <span className="font-semibold text-neutral-900">{maskNickname(customer?.name)}</span> 님의 포인트를
          </p>
          <p className="text-2xl font-bold text-red-500">
            {formatNumber(parseInt(useAmount) || 0)} p 사용
          </p>
          <p className="text-sm text-neutral-500">
            사용 후 잔액: {formatNumber(Math.max(0, (customer?.totalPoints || 0) - (parseInt(useAmount) || 0)))} p
          </p>
        </div>
        <ModalFooter>
          <Button
            variant="secondary"
            onClick={onBack}
            className="flex-1"
          >
            돌아가기
          </Button>
          <Button
            onClick={onConfirm}
            disabled={submitting}
            className="flex-1 bg-red-500 hover:bg-red-600"
          >
            {submitting ? '처리 중...' : '확인'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
