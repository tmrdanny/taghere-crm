import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalFooter,
} from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/lib/utils';
import { Loader2, Send } from 'lucide-react';

// 문자/MMS 발송 확인 모달. 대상 수·비용·메시지 유형은 부모에서 계산해 전달.
export function SendConfirmModal({
  open,
  onOpenChange,
  targetCount,
  messageTypeLabel,
  totalCost,
  isSending,
  onSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetCount: number;
  messageTypeLabel: string;
  totalCost: number;
  isSending: boolean;
  onSend: () => void;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="sm:max-w-md">
        <ModalHeader>
          <ModalTitle>메시지 발송 확인</ModalTitle>
        </ModalHeader>

        <div className="space-y-4 py-4">
          <div className="p-4 bg-neutral-50 rounded-xl space-y-3">
            <div className="flex justify-between">
              <span className="text-neutral-600">발송 대상</span>
              <span className="font-semibold">{formatNumber(targetCount)}명</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-600">메시지 유형</span>
              <span className="font-semibold">{messageTypeLabel}</span>
            </div>
            <div className="flex justify-between text-lg">
              <span className="text-neutral-900 font-medium">총 비용</span>
              <span className="font-bold text-brand-700">{formatNumber(totalCost)}원</span>
            </div>
          </div>

          <div className="p-4 bg-brand-50 rounded-xl">
            <p className="text-sm text-brand-800">
              발송 후에는 취소할 수 없으며, 비용이 충전금에서 차감됩니다.
            </p>
          </div>
        </div>

        <ModalFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={onSend} disabled={isSending}>
            {isSending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                발송 중...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                발송하기
              </>
            )}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
