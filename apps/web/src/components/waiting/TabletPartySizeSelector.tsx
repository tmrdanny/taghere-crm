'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Loader2 } from 'lucide-react';

interface WaitingType {
  id: string;
  name: string;
  description?: string | null;
  avgWaitTimePerTeam: number;
  waitingCount: number;
  estimatedMinutes: number;
}

interface TabletPartySizeSelectorProps {
  selectedType: WaitingType;
  onBack: () => void;
  onSubmit: (partySize: number) => Promise<void>;
  isSubmitting?: boolean;
  className?: string;
}

export function TabletPartySizeSelector({
  selectedType,
  onBack,
  onSubmit,
  isSubmitting = false,
  className,
}: TabletPartySizeSelectorProps) {
  const [partySize, setPartySize] = useState<number>(2);
  const [consentChecked, setConsentChecked] = useState<boolean>(false);

  const partySizeOptions = [1, 2, 3, 4, 5, 6];

  const handleSubmit = async () => {
    await onSubmit(partySize);
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Back Button & Selected Type */}
      <div className="flex items-center gap-4 mb-6">
        <button
          type="button"
          onClick={onBack}
          className="p-2 rounded-lg hover:bg-neutral-100 transition-colors"
        >
          <ChevronLeft className="w-6 h-6 text-neutral-600" />
        </button>
        <div className="bg-brand-100 px-4 py-2 rounded-lg">
          <span className="text-brand-800 font-medium">{selectedType.name}</span>
          <span className="text-neutral-500 text-sm ml-2">선택됨</span>
        </div>
      </div>

      {/* Party Size Selection */}
      <div>
        <h2 className="text-2xl font-bold text-neutral-900 text-center mb-6">
          인원을 선택해주세요
        </h2>

        <div className="grid grid-cols-6 gap-3 max-w-lg mx-auto">
          {partySizeOptions.map((size) => {
            const isSelected = partySize === size;
            const displaySize = size === 6 ? '6+' : size;
            return (
              <button
                key={size}
                type="button"
                onClick={() => setPartySize(size)}
                className={cn(
                  'aspect-square rounded-xl text-2xl font-bold transition-all',
                  'min-h-[72px] min-w-[72px]',
                  isSelected
                    ? 'bg-brand-800 text-white shadow-lg scale-105'
                    : 'bg-white text-neutral-700 border-2 border-neutral-200 hover:border-brand-300'
                )}
              >
                {displaySize}
              </button>
            );
          })}
        </div>
      </div>

      {/* Consent Checkbox */}
      <div className="max-w-lg mx-auto pt-4">
        <label className="flex items-center justify-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={consentChecked}
            onChange={(e) => setConsentChecked(e.target.checked)}
            className="w-5 h-5 rounded border-2 border-neutral-300 text-brand-800 focus:ring-brand-800 focus:ring-offset-0 cursor-pointer"
          />
          <span className="text-[15px] text-neutral-700">
            개인정보 수집 및 알림 발송에 전체 동의합니다
          </span>
        </label>
      </div>

      {/* Submit Button */}
      <div className="pt-6">
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting || !consentChecked}
          size="xl"
          className="w-full max-w-lg mx-auto block h-16 text-xl"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-6 h-6 mr-2 animate-spin" />
              등록 중...
            </>
          ) : (
            '웨이팅 등록하기'
          )}
        </Button>
      </div>

      {/* Consent Notice */}
      <p className="text-center text-sm text-neutral-500 mt-4">
        등록 시 개인정보 수집 및 알림 발송에
        <br />
        동의하는 것으로 간주합니다
      </p>
    </div>
  );
}
