import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalFooter,
} from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Loader2, Send } from 'lucide-react';

// 카카오톡 테스트 발송 모달. 메시지 유형·버튼 수·발송 가능 여부는 부모에서 계산해 전달.
export function KakaoTestModal({
  open,
  onOpenChange,
  testPhone,
  onPhoneChange,
  messageTypeLabel,
  buttonCount,
  isKakaoTestSending,
  sendDisabled,
  onSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  testPhone: string;
  onPhoneChange: (value: string) => void;
  messageTypeLabel: string;
  buttonCount: number;
  isKakaoTestSending: boolean;
  sendDisabled: boolean;
  onSend: () => void;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="sm:max-w-md">
        <ModalHeader>
          <ModalTitle>카카오톡 테스트 발송</ModalTitle>
        </ModalHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-[#64748b]">
            테스트용 전화번호를 입력해주세요.
          </p>
          <p className="text-sm text-[#3b82f6]">
            테스트 발송은 금액이 차감되지 않아요.
          </p>
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-700">
              카카오톡이 설치되어 있고 해당 번호로 가입된 계정이어야 수신 가능합니다.
            </p>
          </div>

          <input
            type="tel"
            value={testPhone}
            onChange={(e) => onPhoneChange(e.target.value)}
            placeholder="01012345678"
            className="w-full px-4 py-3 border border-[#e5e7eb] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#3b82f6] focus:border-transparent"
          />

          <div className="p-4 bg-[#f8fafc] rounded-xl border border-[#e5e7eb]">
            <p className="text-sm text-[#64748b]">
              메시지 유형: <span className="font-medium text-[#1e293b]">{messageTypeLabel}</span>
            </p>
            {buttonCount > 0 && (
              <p className="text-sm text-[#64748b] mt-1">
                버튼: <span className="font-medium text-[#1e293b]">{buttonCount}개</span>
              </p>
            )}
          </div>
        </div>

        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isKakaoTestSending}
          >
            취소
          </Button>
          <Button
            onClick={onSend}
            disabled={sendDisabled}
          >
            {isKakaoTestSending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                발송 중...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                테스트 발송
              </>
            )}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
