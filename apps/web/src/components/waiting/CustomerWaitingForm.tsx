'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Users, Clock } from 'lucide-react';

interface WaitingType {
  id: string;
  name: string;
  description?: string | null;
  avgWaitTimePerTeam: number;
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
  const [memo, setMemo] = useState('');
  const [consentPrivacy, setConsentPrivacy] = useState(false);
  const [consentMarketing, setConsentMarketing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 유형 변경 시 인원 수 초과 방지
  const handleTypeSelect = (typeId: string) => {
    setSelectedTypeId(typeId);
    const type = waitingTypes.find(t => t.id === typeId);
    if (type?.maxPartySize && partySize > type.maxPartySize) {
      setPartySize(type.maxPartySize);
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
        memo: memo || undefined,
        consentPrivacy,
        consentMarketing,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '등록 중 오류가 발생했습니다.');
    }
  };

  const selectedType = waitingTypes.find(t => t.id === selectedTypeId);
  const maxPartySize = selectedType?.maxPartySize || 20;

  // 인원 선택 옵션 동적 생성 (최대 인원에 맞춰서)
  const getPartySizeOptions = () => {
    const options: (number | string)[] = [];
    const displayCount = Math.min(maxPartySize, 5);
    for (let i = 1; i <= displayCount; i++) {
      options.push(i);
    }
    if (maxPartySize > 5) {
      options.push(`${displayCount + 1}+`);
    }
    return options;
  };

  return (
    <div className={cn('min-h-screen bg-neutral-50', className)}>
      <div className="max-w-md mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          {storeLogo ? (
            <img
              src={storeLogo}
              alt={storeName}
              className="w-16 h-16 rounded-full mx-auto mb-3 object-cover"
            />
          ) : (
            <div className="w-16 h-16 bg-brand-100 rounded-full mx-auto mb-3 flex items-center justify-center">
              <span className="text-2xl font-bold text-brand-800">
                {storeName.charAt(0)}
              </span>
            </div>
          )}
          <h1 className="text-xl font-bold text-neutral-900">{storeName}</h1>
          <p className="text-neutral-500 text-sm mt-1">웨이팅</p>
        </div>

        {/* Current Status */}
        <div className="bg-white rounded-xl p-4 mb-6 shadow-sm">
          <div className="flex justify-center gap-8 text-center">
            <div>
              <div className="flex items-center justify-center gap-1 text-neutral-500 text-sm mb-1">
                <Users className="w-4 h-4" />
                <span>현재 대기</span>
              </div>
              <p className="text-xl font-bold text-neutral-900">{totalWaiting}팀</p>
            </div>
            <div className="w-px bg-neutral-200" />
            <div>
              <div className="flex items-center justify-center gap-1 text-neutral-500 text-sm mb-1">
                <Clock className="w-4 h-4" />
                <span>예상 시간</span>
              </div>
              <p className="text-xl font-bold text-neutral-900">약 {estimatedMinutes}분</p>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-error-light text-error px-4 py-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        {/* Form */}
        <div className="bg-white rounded-xl p-6 shadow-sm space-y-6">
          {/* Phone Number */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              전화번호
            </label>
            <Input
              type="tel"
              value={phone}
              onChange={handlePhoneChange}
              placeholder="010-0000-0000"
              className="text-lg"
            />
          </div>

          {/* Waiting Type Selection */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              웨이팅 유형
            </label>
            <div className="space-y-2">
              {waitingTypes.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => handleTypeSelect(type.id)}
                  className={cn(
                    'w-full p-4 rounded-lg border-2 text-left transition-colors',
                    selectedTypeId === type.id
                      ? 'border-brand-800 bg-brand-50'
                      : 'border-neutral-200 hover:border-neutral-300'
                  )}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium text-neutral-900">{type.name}</p>
                      {type.description && (
                        <p className="text-sm text-neutral-500 mt-0.5">{type.description}</p>
                      )}
                    </div>
                    <div className="text-right text-sm">
                      <p className="text-neutral-600">{type.waitingCount}팀 대기</p>
                      <p className="text-neutral-500">약 {type.estimatedMinutes}분</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Party Size */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              인원 수 {selectedType && <span className="text-neutral-400 font-normal">(최대 {maxPartySize}명)</span>}
            </label>
            <div className="grid grid-cols-6 gap-2">
              {getPartySizeOptions().map((size) => {
                const numSize = typeof size === 'string' ? Math.min(6, maxPartySize) : size;
                const isSelected = partySize === numSize;
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setPartySize(numSize)}
                    className={cn(
                      'h-12 rounded-lg font-medium transition-colors',
                      isSelected
                        ? 'bg-brand-800 text-white'
                        : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                    )}
                  >
                    {size}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Memo */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              요청사항 <span className="text-neutral-400 font-normal">(선택)</span>
            </label>
            <Input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="예: 창가석, 유아 동반"
              maxLength={100}
            />
          </div>

          {/* Consent */}
          <div className="space-y-3 pt-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consentPrivacy}
                onChange={(e) => setConsentPrivacy(e.target.checked)}
                className="w-5 h-5 mt-0.5 rounded border-neutral-300 text-brand-800 focus:ring-brand-800"
              />
              <span className="text-sm text-neutral-700">
                <span className="font-medium text-error">[필수]</span>{' '}
                개인정보 수집 및 이용에 동의합니다
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consentMarketing}
                onChange={(e) => setConsentMarketing(e.target.checked)}
                className="w-5 h-5 mt-0.5 rounded border-neutral-300 text-brand-800 focus:ring-brand-800"
              />
              <span className="text-sm text-neutral-700">
                <span className="font-medium text-neutral-500">[선택]</span>{' '}
                마케팅 정보 수신에 동의합니다
              </span>
            </label>
          </div>

          {/* Submit Button */}
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !consentPrivacy}
            size="lg"
            className="w-full h-14 text-lg"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                등록 중...
              </>
            ) : (
              '웨이팅 등록하기'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
