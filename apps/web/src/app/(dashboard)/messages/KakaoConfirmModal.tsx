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

// 카카오톡 브랜드 메시지 발송 확인 모달. 대상 수·메시지 유형·비용은 부모에서 계산해 전달.
export function KakaoConfirmModal({
  open,
  onOpenChange,
  targetCount,
  messageTypeLabel,
  isSendableTime,
  totalCost,
  isKakaoSending,
  onSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetCount: number;
  messageTypeLabel: string;
  isSendableTime: boolean;
  totalCost: number;
  isKakaoSending: boolean;
  onSend: () => void;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="sm:max-w-md">
        <ModalHeader>
          <ModalTitle>카카오톡 발송 확인</ModalTitle>
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
            {!isSendableTime && (
              <div className="flex justify-between">
                <span className="text-neutral-600">발송 예정</span>
                <span className="font-semibold text-amber-600">다음 날 08:00 예약</span>
              </div>
            )}
            <div className="flex justify-between text-lg pt-2 border-t border-neutral-200">
              <span className="text-neutral-900 font-medium">총 비용</span>
              <span className="font-bold text-brand-700">{formatNumber(totalCost)}원</span>
            </div>
          </div>

          <div className="p-4 bg-brand-50 rounded-xl">
            <p className="text-sm text-brand-800">
              {isSendableTime
                ? '발송 후에는 취소할 수 없으며, 발송 성공 시에만 비용이 차감됩니다.'
                : '08:00에 자동 발송되며, 발송 성공 시에만 비용이 차감됩니다.'}
            </p>
          </div>

          <div className="p-3 bg-neutral-50 rounded-lg text-xs text-neutral-600">
            <p>카카오톡 미설치 또는 미가입 고객에게는 발송되지 않으며, SMS 대체 발송이 불가능합니다.</p>
          </div>
        </div>

        <ModalFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            onClick={onSend}
            disabled={isKakaoSending}
          >
            {isKakaoSending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                발송 중...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                {isSendableTime ? '발송하기' : '예약 발송'}
              </>
            )}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
