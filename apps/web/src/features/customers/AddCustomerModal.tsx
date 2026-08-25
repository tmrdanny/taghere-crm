import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalFooter,
} from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { maskNickname } from '@/lib/utils';

// 고객 등록 모달. 폼 상태는 부모에서 관리하고 props로 전달한다.
export function AddCustomerModal({
  open,
  onOpenChange,
  phone,
  onPhoneChange,
  name,
  onNameChange,
  gender,
  onGenderChange,
  birthday,
  onBirthdayChange,
  birthYear,
  onBirthYearChange,
  initialPoints,
  onInitialPointsChange,
  memo,
  onMemoChange,
  submitting,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phone: string;
  onPhoneChange: (value: string) => void;
  name: string;
  onNameChange: (value: string) => void;
  gender: string;
  onGenderChange: (value: 'MALE' | 'FEMALE') => void;
  birthday: string;
  onBirthdayChange: (value: string) => void;
  birthYear: string;
  onBirthYearChange: (value: string) => void;
  initialPoints: string;
  onInitialPointsChange: (value: string) => void;
  memo: string;
  onMemoChange: (value: string) => void;
  submitting: boolean;
  onSubmit: () => void;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <ModalHeader className="flex-shrink-0">
          <ModalTitle>고객 등록</ModalTitle>
        </ModalHeader>

        <div className="space-y-4 py-4 overflow-y-auto flex-1 px-1">
          {/* Phone - Required */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-600">
              전화번호 <span className="text-red-500">*</span>
            </label>
            <Input
              type="tel"
              placeholder="010-0000-0000"
              value={phone}
              onChange={(e) => onPhoneChange(e.target.value)}
            />
            <p className="text-xs text-neutral-500">
              하이픈(-) 없이 숫자만 입력해도 됩니다.
            </p>
          </div>

          {/* Nickname */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-600">닉네임</label>
            <Input
              type="text"
              placeholder="닉네임을 입력하세요"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
            />
            {name && (
              <p className="text-xs text-neutral-500">표시: {maskNickname(name)}</p>
            )}
          </div>

          {/* Gender */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-600">성별</label>
            <div className="flex gap-2">
              <button
                type="button"
                className={`flex-1 py-2 px-4 rounded-lg border-2 transition-colors ${
                  gender === 'MALE'
                    ? 'border-brand-800 bg-brand-50 text-brand-800'
                    : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
                }`}
                onClick={() => onGenderChange('MALE')}
              >
                남성
              </button>
              <button
                type="button"
                className={`flex-1 py-2 px-4 rounded-lg border-2 transition-colors ${
                  gender === 'FEMALE'
                    ? 'border-brand-800 bg-brand-50 text-brand-800'
                    : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
                }`}
                onClick={() => onGenderChange('FEMALE')}
              >
                여성
              </button>
            </div>
          </div>

          {/* Birthday and Birth Year */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-600">생일 (MM-DD)</label>
              <Input
                type="text"
                placeholder="01-15"
                value={birthday}
                onChange={(e) => onBirthdayChange(e.target.value)}
                maxLength={5}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-600">출생연도</label>
              <Input
                type="number"
                placeholder="1990"
                value={birthYear}
                onChange={(e) => onBirthYearChange(e.target.value)}
                min={1900}
                max={new Date().getFullYear()}
              />
            </div>
          </div>

          {/* Initial Points */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-600">초기 포인트</label>
            <div className="relative">
              <Input
                type="number"
                placeholder="0"
                value={initialPoints}
                onChange={(e) => onInitialPointsChange(e.target.value)}
                className="pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">p</span>
            </div>
            <p className="text-xs text-neutral-500">
              등록 시 지급할 포인트를 입력하세요. (선택)
            </p>
          </div>

          {/* Memo */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-600">메모</label>
            <textarea
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-800 focus:border-transparent"
              rows={3}
              placeholder="고객에 대한 메모를 입력하세요"
              value={memo}
              onChange={(e) => onMemoChange(e.target.value)}
            />
          </div>
        </div>

        <ModalFooter className="flex-shrink-0">
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            className="flex-1"
          >
            취소
          </Button>
          <Button
            onClick={onSubmit}
            disabled={!phone || submitting}
            className="flex-1"
          >
            {submitting ? '등록 중...' : '등록하기'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
