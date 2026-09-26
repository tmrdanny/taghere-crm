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
      <ModalContent className="rounded-[20px] border-0 shadow-[0_24px_60px_-20px_rgba(19,22,81,0.4)] sm:max-w-lg max-h-[85vh] flex flex-col">
        <ModalHeader className="flex-shrink-0">
          <ModalTitle className="text-[17px] font-semibold text-[color:var(--ad-ink)]">고객 등록</ModalTitle>
        </ModalHeader>

        <div className="space-y-4 py-4 overflow-y-auto flex-1 px-1">
          {/* Phone - Required */}
          <div className="space-y-2">
            <label className="text-[13px] font-medium text-[#383c40]">
              전화번호 <span className="text-[#cc0832]">*</span>
            </label>
            <Input
              type="tel"
              placeholder="010-0000-0000"
              value={phone}
              onChange={(e) => onPhoneChange(e.target.value)}
            />
            <p className="text-[12px] text-[#55595e]">
              하이픈(-) 없이 숫자만 입력해도 됩니다.
            </p>
          </div>

          {/* Nickname */}
          <div className="space-y-2">
            <label className="text-[13px] font-medium text-[#383c40]">닉네임</label>
            <Input
              type="text"
              placeholder="닉네임을 입력하세요"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
            />
            {name && (
              <p className="text-[12px] text-[#55595e]">표시: {maskNickname(name)}</p>
            )}
          </div>

          {/* Gender */}
          <div className="space-y-2">
            <label className="text-[13px] font-medium text-[#383c40]">성별</label>
            <div className="flex gap-2">
              <button
                type="button"
                className={`flex-1 py-2 px-4 rounded-[10px] border-2 transition-colors ${
                  gender === 'MALE'
                    ? 'border-[color:var(--ad-ink)] bg-white font-medium text-[color:var(--ad-ink)]'
                    : 'border-[#ebeced] text-[#383c40] hover:border-[#d1d3d6]'
                }`}
                onClick={() => onGenderChange('MALE')}
              >
                남성
              </button>
              <button
                type="button"
                className={`flex-1 py-2 px-4 rounded-[10px] border-2 transition-colors ${
                  gender === 'FEMALE'
                    ? 'border-[color:var(--ad-ink)] bg-white font-medium text-[color:var(--ad-ink)]'
                    : 'border-[#ebeced] text-[#383c40] hover:border-[#d1d3d6]'
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
              <label className="text-[13px] font-medium text-[#383c40]">생일 (MM-DD)</label>
              <Input
                type="text"
                placeholder="01-15"
                value={birthday}
                onChange={(e) => onBirthdayChange(e.target.value)}
                maxLength={5}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-[#383c40]">출생연도</label>
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
            <label className="text-[13px] font-medium text-[#383c40]">초기 포인트</label>
            <div className="relative">
              <Input
                type="number"
                placeholder="0"
                value={initialPoints}
                onChange={(e) => onInitialPointsChange(e.target.value)}
                className="pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#91959a]">p</span>
            </div>
            <p className="text-[12px] text-[#55595e]">
              등록 시 지급할 포인트를 입력하세요. (선택)
            </p>
          </div>

          {/* Memo */}
          <div className="space-y-2">
            <label className="text-[13px] font-medium text-[#383c40]">메모</label>
            <textarea
              className="w-full resize-none rounded-[10px] border border-[#d1d3d6] bg-white px-3 py-2.5 text-[13.5px] placeholder:text-[#91959a] focus:border-[#131651] focus:outline-none"
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
            className="flex-1 ad-press h-10 rounded-[12px] border-0 bg-white text-[13.5px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
          >
            취소
          </Button>
          <Button
            onClick={onSubmit}
            disabled={!phone || submitting}
            className="flex-1 ad-press h-10 rounded-[12px] bg-[color:var(--ad-ink)] text-[13.5px] font-semibold text-white hover:bg-[#383c40] disabled:opacity-40"
          >
            {submitting ? '등록 중...' : '등록하기'}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
