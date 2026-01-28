'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Delete, Clock, Users, ChevronRight, Minus, Plus, Check, ListOrdered } from 'lucide-react';
import Image from 'next/image';

// 화면 크기에 따른 스케일 계산 훅 (전체 화면 채움)
function useResponsiveScale(designWidth = 1024, designHeight = 768) {
  const [scale, setScale] = useState(1);

  const calculateScale = useCallback(() => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // 가로/세로 비율 중 작은 것 기준으로 스케일 계산 (확대 포함)
    const scaleX = viewportWidth / designWidth;
    const scaleY = viewportHeight / designHeight;
    const newScale = Math.min(scaleX, scaleY);

    setScale(newScale);
  }, [designWidth, designHeight]);

  useEffect(() => {
    calculateScale();
    window.addEventListener('resize', calculateScale);
    return () => window.removeEventListener('resize', calculateScale);
  }, [calculateScale]);

  return { scale };
}

interface WaitingType {
  id: string;
  name: string;
  description?: string | null;
  avgWaitTimePerTeam: number;
  maxPartySize?: number;
  waitingCount: number;
  estimatedMinutes: number;
}

interface RegistrationResult {
  waitingId: string;
  waitingNumber: number;
  position: number;
  estimatedMinutes: number;
  typeName: string;
  totalWaiting: number;
}

type TabletStep = 'phone' | 'type' | 'partySize' | 'complete';

interface TabletWaitingFormProps {
  storeName: string;
  storeLogo?: string | null;
  totalWaiting: number;
  estimatedMinutes: number;
  waitingTypes: WaitingType[];
  onSubmit: (data: {
    phone: string;
    waitingTypeId: string;
    partySize: number;
    marketingConsent?: boolean;
  }) => Promise<RegistrationResult>;
  onViewWaitingList?: () => void;
  onCancel?: () => Promise<void>;
  isSubmitting?: boolean;
  className?: string;
}

export function TabletWaitingForm({
  storeName,
  totalWaiting,
  estimatedMinutes,
  waitingTypes,
  onSubmit,
  onViewWaitingList,
  onCancel,
  isSubmitting = false,
  className,
}: TabletWaitingFormProps) {
  // 웨이팅 유형이 1개면 유형 선택 스킵
  const skipTypeSelection = waitingTypes.length === 1;
  const [step, setStep] = useState<TabletStep>('phone');
  const [phone, setPhone] = useState('');
  const [selectedTypeId, setSelectedTypeId] = useState<string>(skipTypeSelection ? waitingTypes[0]?.id || '' : '');
  const [partySize, setPartySize] = useState(1);
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registrationResult, setRegistrationResult] = useState<RegistrationResult | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const hiddenInputRef = useRef<HTMLInputElement>(null);

  // Auto focus hidden input for keyboard
  useEffect(() => {
    if (step === 'phone') {
      setTimeout(() => {
        hiddenInputRef.current?.focus();
      }, 100);
    }
  }, [step]);

  // Auto return to first screen after 3 seconds on complete
  useEffect(() => {
    if (step === 'complete') {
      const timer = setTimeout(() => {
        resetForm();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [step]);

  // Format phone for display
  const formatPhoneDisplay = (value: string) => {
    if (value.length === 0) return '010';
    if (value.length <= 4) {
      return `010 - ${value}`;
    }
    return `010 - ${value.slice(0, 4)} - ${value.slice(4)}`;
  };

  // Keypad handlers
  const handleKeyPress = (key: string) => {
    if (phone.length < 8) {
      setPhone(phone + key);
      setError(null);
    }
  };

  const handleDelete = () => {
    setPhone(phone.slice(0, -1));
    setError(null);
  };

  const handleReset = () => {
    setPhone('');
    setError(null);
  };

  // Handle keyboard input
  const handleHiddenInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    if (value.length <= 8) {
      setPhone(value);
      setError(null);
    }
  };

  // Proceed from phone to next step
  const handlePhoneProceed = () => {
    if (phone.length !== 8) {
      setError('전화번호 8자리를 모두 입력해주세요.');
      return;
    }
    if (skipTypeSelection) {
      setStep('partySize');
    } else {
      setStep('type');
    }
  };

  // Handle type selection
  const handleSelectType = (typeId: string) => {
    setSelectedTypeId(typeId);
    setStep('partySize');
  };

  // Handle final submission
  const handleSubmit = async () => {
    if (!privacyConsent) {
      setError('개인정보 수집 및 이용에 동의해주세요.');
      return;
    }
    try {
      const result = await onSubmit({
        phone: `010${phone}`,
        waitingTypeId: selectedTypeId,
        partySize,
      });
      setRegistrationResult(result);
      setStep('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : '등록 중 오류가 발생했습니다.');
    }
  };

  // Handle cancel
  const handleCancel = async () => {
    if (!onCancel) return;
    setIsCancelling(true);
    try {
      await onCancel();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : '취소 중 오류가 발생했습니다.');
    } finally {
      setIsCancelling(false);
    }
  };

  // Reset form
  const resetForm = () => {
    setStep('phone');
    setPhone('');
    setSelectedTypeId(skipTypeSelection ? waitingTypes[0]?.id || '' : '');
    setPartySize(1);
    setPrivacyConsent(false);
    setError(null);
    setRegistrationResult(null);
  };

  const selectedType = waitingTypes.find(t => t.id === selectedTypeId);

  // Get display stats based on selected type or total
  const displayWaiting = selectedType ? selectedType.waitingCount : totalWaiting;
  const displayMinutes = selectedType ? selectedType.estimatedMinutes : estimatedMinutes;

  // 화면 크기에 따른 자동 스케일
  const { scale } = useResponsiveScale(1024, 768);

  return (
    <div className={cn('h-screen w-screen overflow-hidden', className)}>
      {/* Hidden input for keyboard */}
      <input
        ref={hiddenInputRef}
        type="text"
        inputMode="numeric"
        value={phone}
        onChange={handleHiddenInputChange}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && phone.length === 8) {
            handlePhoneProceed();
          }
        }}
        className="absolute opacity-0 pointer-events-none"
        autoFocus
      />

      {/* Scaled Container - 화면 전체를 채움 */}
      <div
        style={{
          width: '1024px',
          height: '768px',
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
        className="flex"
      >
        {/* Left Panel - 40% - Dark Background */}
        <div className="w-[40%] h-full bg-[#1A1A1A] text-white flex flex-col">
        {/* Store Name - Top Center */}
        <div className="pt-8 px-8">
          <h1 className="text-xl font-semibold text-white text-center">{storeName}</h1>
        </div>

        {/* Center Content */}
        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <p className="text-white font-bold text-2xl md:text-3xl mb-4">현재 대기중</p>

          {/* Waiting Count - Large Yellow Number */}
          <div className="flex items-baseline">
            <span className="text-[120px] font-bold text-[#FCD535] leading-none">
              {displayWaiting}
            </span>
            <span className="text-3xl font-medium text-[#FCD535] ml-2">팀</span>
          </div>

          {/* Estimated Wait Time */}
          <div className="flex items-center gap-2 mt-6 text-neutral-300">
            <Clock className="w-5 h-5" />
            <span>예상 대기시간</span>
            <span className="font-bold text-white ml-1">{displayMinutes}분</span>
          </div>
        </div>

        {/* TAG HERE Logo - Bottom */}
        <div className="pb-8 px-8 flex justify-center">
          <Image
            src="/images/taghere_logo_w.png"
            alt="TAG HERE"
            width={120}
            height={32}
            className="opacity-80"
          />
        </div>
      </div>

      {/* Right Panel - 60% - White Background */}
      <div className="w-[60%] h-full bg-white flex flex-col">
        {/* Error Message */}
        {error && (
          <div className="mx-8 mt-4 bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="flex-1 flex flex-col justify-center px-8 lg:px-16">
          {/* Phone Input Step */}
          {step === 'phone' && (
            <div className="w-full">
              {/* Phone Display */}
              <div className="flex flex-col items-center mb-8">
                <div className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-neutral-900 whitespace-nowrap">
                  {formatPhoneDisplay(phone)}
                </div>
                <p className="text-neutral-500 mt-4 text-lg text-center">
                  실시간 웨이팅 안내를 받을 수 있는<br />번호를 입력해주세요
                </p>
              </div>

              {/* Keypad */}
              <div className="max-w-md mx-auto grid grid-cols-3 gap-3">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handleKeyPress(num.toString())}
                    className="h-20 rounded-xl border border-neutral-200 bg-white text-3xl font-medium text-neutral-800 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleReset}
                  className="h-20 rounded-xl bg-neutral-100 text-base font-medium text-neutral-600 hover:bg-neutral-200 active:bg-neutral-300 transition-colors"
                >
                  초기화
                </button>
                <button
                  type="button"
                  onClick={() => handleKeyPress('0')}
                  className="h-20 rounded-xl border border-neutral-200 bg-white text-3xl font-medium text-neutral-800 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="h-20 rounded-xl border border-neutral-200 bg-white flex items-center justify-center text-neutral-600 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
                >
                  <Delete className="w-7 h-7" />
                </button>
              </div>

              {/* Action Buttons */}
              <div className="max-w-md mx-auto flex gap-3 mt-8">
                <button
                  type="button"
                  onClick={onViewWaitingList}
                  className="flex-1 h-16 rounded-xl border border-neutral-300 bg-white text-neutral-700 font-medium text-lg hover:bg-neutral-50 transition-colors"
                >
                  웨이팅 목록
                </button>
                <button
                  type="button"
                  onClick={handlePhoneProceed}
                  disabled={phone.length !== 8}
                  className={cn(
                    'flex-1 h-16 rounded-xl font-semibold text-lg transition-colors',
                    phone.length === 8
                      ? 'bg-[#FCD535] text-neutral-900 hover:bg-[#e5c130]'
                      : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                  )}
                >
                  웨이팅 시작
                </button>
              </div>
            </div>
          )}

          {/* Type Selection Step */}
          {step === 'type' && (
            <div className="max-w-lg mx-auto w-full">
              <h2 className="text-3xl font-bold text-neutral-900 text-center mb-8">
                웨이팅 유형을 선택해주세요
              </h2>

              <div className="space-y-4">
                {waitingTypes.map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => handleSelectType(type.id)}
                    className="w-full flex items-center justify-between px-6 py-5 border border-neutral-200 rounded-xl hover:border-neutral-300 hover:bg-neutral-50 transition-colors"
                  >
                    <span className="text-xl font-medium text-neutral-900">{type.name}</span>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1 text-neutral-500">
                        <Clock className="w-4 h-4" />
                        <span>{type.estimatedMinutes}분</span>
                      </div>
                      <div className="flex items-center gap-1 text-neutral-500">
                        <Users className="w-4 h-4" />
                        <span>{type.waitingCount}팀</span>
                      </div>
                      <ChevronRight className="w-5 h-5 text-neutral-400" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Party Size Step */}
          {step === 'partySize' && (
            <div className="max-w-md mx-auto w-full text-center">
              {/* Selected Type Badge */}
              {selectedType && !skipTypeSelection && (
                <div className="inline-block mb-4">
                  <span className="px-4 py-1.5 bg-neutral-100 text-neutral-600 text-sm font-medium rounded-full">
                    {selectedType.name} 선택됨
                  </span>
                </div>
              )}

              <h2 className="text-3xl font-bold text-neutral-900 mb-10">
                인원을 선택해주세요
              </h2>

              {/* Party Size Selector */}
              <div className="flex items-center justify-center gap-6 mb-8">
                <button
                  type="button"
                  onClick={() => setPartySize(Math.max(1, partySize - 1))}
                  disabled={partySize <= 1}
                  className="w-16 h-16 rounded-xl border border-neutral-200 flex items-center justify-center text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Minus className="w-6 h-6" />
                </button>
                <div className="w-32 text-center">
                  <span className="text-5xl font-bold text-neutral-900">{partySize}</span>
                  <span className="text-2xl font-medium text-neutral-600 ml-1">명</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPartySize(Math.min(selectedType?.maxPartySize || 20, partySize + 1))}
                  disabled={partySize >= (selectedType?.maxPartySize || 20)}
                  className="w-16 h-16 rounded-xl border border-neutral-200 flex items-center justify-center text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus className="w-6 h-6" />
                </button>
              </div>

              {/* Max Party Size Info */}
              <p className="text-sm text-neutral-500 mb-4">
                최대 {selectedType?.maxPartySize || 20}명까지 선택 가능합니다
              </p>

              {/* Privacy Consent */}
              <label className="flex items-center justify-center gap-3 mb-8 cursor-pointer">
                <div
                  className={cn(
                    'w-6 h-6 rounded border-2 flex items-center justify-center transition-colors',
                    privacyConsent
                      ? 'bg-[#FCD535] border-[#FCD535]'
                      : 'border-neutral-300 bg-white'
                  )}
                  onClick={() => setPrivacyConsent(!privacyConsent)}
                >
                  {privacyConsent && <Check className="w-4 h-4 text-neutral-900" />}
                </div>
                <span className="text-neutral-600" onClick={() => setPrivacyConsent(!privacyConsent)}>
                  (필수) 개인정보 수집 및 이용 동의
                </span>
              </label>

              {/* Submit Button */}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || !privacyConsent}
                className={cn(
                  'w-full h-16 rounded-xl font-semibold text-xl transition-colors',
                  isSubmitting || !privacyConsent
                    ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                    : 'bg-[#FCD535] text-neutral-900 hover:bg-[#e5c130]'
                )}
              >
                {isSubmitting ? '등록 중...' : '웨이팅 등록하기'}
              </button>
            </div>
          )}

          {/* Complete Step */}
          {step === 'complete' && registrationResult && (
            <div className="max-w-md mx-auto w-full text-center">
              {/* Success Icon */}
              <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Check className="w-10 h-10 text-white" strokeWidth={3} />
              </div>

              <h2 className="text-2xl font-bold text-neutral-900 mb-2">
                웨이팅이 등록되었어요!
              </h2>
              <p className="text-neutral-600 mb-8">
                카카오톡을 확인해 주세요
              </p>

              {/* Waiting Number Card */}
              <div className="bg-neutral-50 rounded-2xl p-6 mb-6">
                {/* Type Badge */}
                {registrationResult.typeName && (
                  <div className="inline-block mb-2">
                    <span className="px-3 py-1 bg-white border border-neutral-200 text-neutral-700 text-sm font-medium rounded-lg">
                      {registrationResult.typeName}
                    </span>
                  </div>
                )}

                <p className="text-neutral-500 text-sm mb-1">대기번호</p>
                <p className="text-6xl font-bold text-[#FCD535]">
                  {registrationResult.waitingNumber}
                </p>

                {/* Stats Row */}
                <div className="flex justify-center gap-8 mt-6 pt-6 border-t border-neutral-200">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-neutral-500 text-sm mb-1">
                      <ListOrdered className="w-4 h-4" />
                      <span>내 순서</span>
                    </div>
                    <p className="text-lg font-semibold text-neutral-900">
                      {registrationResult.position}번째
                    </p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-neutral-500 text-sm mb-1">
                      <Clock className="w-4 h-4" />
                      <span>예상 대기</span>
                    </div>
                    <p className="text-lg font-semibold text-neutral-900">
                      약 {registrationResult.estimatedMinutes}분
                    </p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-neutral-500 text-sm mb-1">
                      <Users className="w-4 h-4" />
                      <span>현재 대기</span>
                    </div>
                    <p className="text-lg font-semibold text-neutral-900">
                      {registrationResult.totalWaiting || displayWaiting}팀
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
