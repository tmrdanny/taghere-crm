'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Loader2, Users, Clock } from 'lucide-react';

interface WaitingType {
  id: string;
  name: string;
  description?: string | null;
  avgWaitTimePerTeam: number;
  minPartySize?: number;
  maxPartySize?: number;
  waitingCount: number;
  estimatedMinutes: number;
}

interface CustomerWaitingFormProps {
  storeName: string;
  storeLogo?: string | null;
  totalWaiting: number;
  estimatedMinutes: number;
  waitingTypes: WaitingType[];
  onSubmit: (data: {
    phone: string;
    waitingTypeId: string;
    partySize: number;
    memo?: string;
    consentPrivacy: boolean;
    consentMarketing: boolean;
  }) => Promise<void>;
  isSubmitting?: boolean;
  className?: string;
}

export function CustomerWaitingForm({
  storeName,
  storeLogo,
  totalWaiting,
  estimatedMinutes,
  waitingTypes,
  onSubmit,
  isSubmitting = false,
  className,
}: CustomerWaitingFormProps) {
  const [phone, setPhone] = useState('');
  const [selectedTypeId, setSelectedTypeId] = useState<string>('');
  const [partySize, setPartySize] = useState<number>(2);
  const [consentPrivacy, setConsentPrivacy] = useState(false);
  const [consentMarketing, setConsentMarketing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 유형 변경 시 인원 수 범위 보정
  const handleTypeSelect = (typeId: string) => {
    setSelectedTypeId(typeId);
    const type = waitingTypes.find(t => t.id === typeId);
    if (type) {
      const min = type.minPartySize || 1;
      if (partySize < min) setPartySize(min);
      if (type.maxPartySize && partySize > type.maxPartySize) setPartySize(type.maxPartySize);
    }
  };

  // Auto format phone number
  const formatPhoneNumber = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    if (formatted.replace(/-/g, '').length <= 11) {
      setPhone(formatted);
    }
  };

  const handleSubmit = async () => {
    setError(null);

    // Validation
    const phoneNumbers = phone.replace(/-/g, '');
    if (phoneNumbers.length !== 11) {
      setError('전화번호를 정확히 입력해주세요.');
      return;
    }

    if (!selectedTypeId) {
      setError('웨이팅 유형을 선택해주세요.');
      return;
    }

    if (!consentPrivacy) {
      setError('개인정보 수집 및 이용에 동의해주세요.');
      return;
    }

    try {
      await onSubmit({
        phone: phoneNumbers,
        waitingTypeId: selectedTypeId,
        partySize: partySize,
        consentPrivacy,
        consentMarketing,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '등록 중 오류가 발생했습니다.');
    }
  };

  const selectedType = waitingTypes.find(t => t.id === selectedTypeId);
  const maxPartySize = selectedType?.maxPartySize || 20;
  const minPartySize = selectedType?.minPartySize || 1;

  // 인원 선택 옵션 동적 생성 (최소~최대 인원에 맞춰서)
  const getPartySizeOptions = () => {
    const options: (number | string)[] = [];
    const start = Math.max(1, minPartySize);
    const displayCount = Math.min(maxPartySize, start + 4);
    for (let i = start; i <= displayCount; i++) {
      options.push(i);
    }
    if (maxPartySize > displayCount) {
      options.push(`${displayCount + 1}+`);
    }
    return options;
  };

  return (
    <div className={cn('min-h-screen bg-white font-pretendard', className)}>
      <div className="max-w-[430px] mx-auto px-5 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          {storeLogo ? (
            <img
              src={storeLogo}
              alt={storeName}
              className="w-16 h-16 rounded-full mx-auto mb-3 object-cover"
            />
          ) : (
            <div className="w-16 h-16 bg-[#f8f9fa] rounded-full mx-auto mb-3 flex items-center justify-center">
              <span className="text-2xl font-bold text-[#1d2022]">
                {storeName.charAt(0)}
              </span>
            </div>
          )}
          <h1 className="text-xl font-bold text-[#1d2022]">{storeName}</h1>
          <p className="text-[#91949a] text-sm mt-1">웨이팅</p>
        </div>

        {/* Current Status */}
        <div className="bg-[#f8f9fa] rounded-xl p-4 mb-6">
          <div className="flex justify-center gap-8 text-center">
            <div>
              <div className="flex items-center justify-center gap-1 text-[#91949a] text-sm mb-1">
                <Users className="w-4 h-4" />
                <span>현재 대기</span>
              </div>
              <p className="text-xl font-bold text-[#1d2022]">{totalWaiting}팀</p>
            </div>
            <div className="w-px bg-[#ebeced]" />
            <div>
              <div className="flex items-center justify-center gap-1 text-[#91949a] text-sm mb-1">
                <Clock className="w-4 h-4" />
                <span>예상 시간</span>
              </div>
              <p className="text-xl font-bold text-[#1d2022]">약 {estimatedMinutes}분</p>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-[#fff0f3] border border-[#ffb3c1] text-[#ff6b6b] px-4 py-3 rounded-xl mb-4 text-sm">
            {error}
          </div>
        )}

        {/* Form */}
        <div className="bg-[#f8f9fa] rounded-xl p-6 space-y-6">
          {/* Phone Number */}
          <div>
            <label className="block text-sm font-medium text-[#1d2022] mb-2">
              전화번호
            </label>
            <input
              type="tel"
              value={phone}
              onChange={handlePhoneChange}
              placeholder="010-0000-0000"
              className="w-full px-4 py-3 bg-white border border-[#ebeced] rounded-xl text-[16px] text-[#1d2022] placeholder:text-[#b1b5b8] focus:outline-none focus:ring-2 focus:ring-[#FFD541] focus:border-transparent"
            />
          </div>

          {/* Waiting Type Selection */}
          <div>
            <label className="block text-sm font-medium text-[#1d2022] mb-2">
              웨이팅 유형
            </label>
            <div className="space-y-2">
              {waitingTypes.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => handleTypeSelect(type.id)}
                  className={cn(
                    'w-full p-4 rounded-xl border-2 text-left transition-colors',
                    selectedTypeId === type.id
                      ? 'border-[#FFD541] bg-[#FFFBEB]'
                      : 'border-[#ebeced] bg-white hover:border-[#d1d5db]'
                  )}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium text-[#1d2022]">{type.name}</p>
                      {type.description && (
                        <p className="text-sm text-[#91949a] mt-0.5">{type.description}</p>
                      )}
                    </div>
                    <div className="text-right text-sm">
                      <p className="text-[#55595e]">{type.waitingCount}팀 대기</p>
                      <p className="text-[#91949a]">약 {type.estimatedMinutes}분</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Party Size */}
          <div>
            <label className="block text-sm font-medium text-[#1d2022] mb-2">
              인원 수 {selectedType && <span className="text-[#b1b5b8] font-normal">({minPartySize > 1 ? `${minPartySize}~${maxPartySize}명` : `최대 ${maxPartySize}명`})</span>}
            </label>
            <div className="grid grid-cols-6 gap-2">
              {getPartySizeOptions().map((size) => {
                const numSize = typeof size === 'string' ? Math.min(Math.max(1, minPartySize) + 5, maxPartySize) : size;
                const isSelected = partySize === numSize;
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setPartySize(numSize)}
                    className={cn(
                      'h-12 rounded-xl font-medium transition-colors',
                      isSelected
                        ? 'bg-[#FFD541] text-[#1d2022]'
                        : 'bg-white border border-[#ebeced] text-[#55595e] hover:border-[#d1d5db]'
                    )}
                  >
                    {size}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Consent */}
          <div className="space-y-3 pt-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <div
                className={cn(
                  'w-5 h-5 mt-0.5 rounded flex items-center justify-center flex-shrink-0 border-2 transition-colors',
                  consentPrivacy
                    ? 'bg-[#FFD541] border-[#FFD541]'
                    : 'border-[#d1d5db] bg-white'
                )}
                onClick={() => setConsentPrivacy(!consentPrivacy)}
              >
                {consentPrivacy && (
                  <svg className="w-3 h-3 text-[#1d2022]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span className="text-sm text-[#55595e]" onClick={() => setConsentPrivacy(!consentPrivacy)}>
                <span className="font-medium text-[#ff6b6b]">[필수]</span>{' '}
                개인정보 수집 및 이용에 동의합니다
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <div
                className={cn(
                  'w-5 h-5 mt-0.5 rounded flex items-center justify-center flex-shrink-0 border-2 transition-colors',
                  consentMarketing
                    ? 'bg-[#FFD541] border-[#FFD541]'
                    : 'border-[#d1d5db] bg-white'
                )}
                onClick={() => setConsentMarketing(!consentMarketing)}
              >
                {consentMarketing && (
                  <svg className="w-3 h-3 text-[#1d2022]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span className="text-sm text-[#55595e]" onClick={() => setConsentMarketing(!consentMarketing)}>
                <span className="font-medium text-[#91949a]">[선택]</span>{' '}
                마케팅 정보 수신에 동의합니다
              </span>
            </label>
          </div>

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !consentPrivacy}
            className="w-full py-4 font-semibold text-base rounded-xl transition-colors bg-[#FFD541] hover:bg-[#FFCA00] disabled:bg-[#FFE88A] text-[#1d2022]"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                등록 중...
              </span>
            ) : (
              '웨이팅 등록하기'
            )}
          </button>
        </div>
      </div>

      <style jsx global>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-jp.min.css');
        .font-pretendard {
          font-family: 'Pretendard JP Variable', 'Pretendard JP', -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif;
        }
      `}</style>
    </div>
  );
}
