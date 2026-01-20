'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Delete, List, ArrowRight } from 'lucide-react';
import { TabletTypeSelector } from './TabletTypeSelector';
import { TabletPartySizeSelector } from './TabletPartySizeSelector';

interface WaitingType {
  id: string;
  name: string;
  description?: string | null;
  avgWaitTimePerTeam: number;
  waitingCount: number;
  estimatedMinutes: number;
}

type TabletStep = 'phone' | 'type' | 'partySize';

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
  }) => Promise<void>;
  onViewWaitingList?: () => void;
  isSubmitting?: boolean;
  className?: string;
}

export function TabletWaitingForm({
  storeName,
  storeLogo,
  totalWaiting,
  estimatedMinutes,
  waitingTypes,
  onSubmit,
  onViewWaitingList,
  isSubmitting = false,
  className,
}: TabletWaitingFormProps) {
  const [step, setStep] = useState<TabletStep>('phone');
  const [phone, setPhone] = useState('');
  const [selectedTypeId, setSelectedTypeId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const hiddenInputRef = useRef<HTMLInputElement>(null);

  // Auto focus hidden input for keyboard
  useEffect(() => {
    if (step === 'phone') {
      setTimeout(() => {
        hiddenInputRef.current?.focus();
      }, 100);
    }
  }, [step]);

  // Format phone for display
  const formatPhoneDisplay = (value: string) => {
    if (value.length === 0) return '010-____-____';
    if (value.length <= 4) {
      return `010-${value.padEnd(4, '_')}-____`;
    }
    return `010-${value.slice(0, 4)}-${value.slice(4).padEnd(4, '_')}`;
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

  // Proceed to next step
  const handleProceed = () => {
    if (phone.length !== 8) {
      setError('전화번호 8자리를 모두 입력해주세요.');
      return;
    }

    // If only one type, skip type selection
    if (waitingTypes.length === 1) {
      setSelectedTypeId(waitingTypes[0].id);
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
  const handleSubmit = async (partySize: number) => {
    try {
      await onSubmit({
        phone: `010${phone}`,
        waitingTypeId: selectedTypeId,
        partySize,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '등록 중 오류가 발생했습니다.');
    }
  };

  // Reset form
  const resetForm = () => {
    setStep('phone');
    setPhone('');
    setSelectedTypeId('');
    setError(null);
  };

  const selectedType = waitingTypes.find(t => t.id === selectedTypeId);

  // Get current type stats for left panel
  const currentTypeStats = selectedType || {
    waitingCount: totalWaiting,
    estimatedMinutes: estimatedMinutes,
  };

  return (
    <div className={cn('h-screen flex', className)}>
      {/* Hidden input for keyboard */}
      <input
        ref={hiddenInputRef}
        type="text"
        inputMode="numeric"
        value={phone}
        onChange={handleHiddenInputChange}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && phone.length === 8) {
            handleProceed();
          }
        }}
        className="absolute opacity-0 pointer-events-none"
        autoFocus
      />

      {/* Left Panel - 40% - Dark Background */}
      <div className="w-[40%] h-full bg-brand-800 text-white flex flex-col justify-center p-8 lg:p-12">
        <div className="text-center">
          {/* Intro Text */}
          <p className="text-brand-200 text-lg mb-2">휴대폰 번호를 입력하시면</p>
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="w-3 h-3 bg-green-400 rounded-full" />
            <span className="text-lg">카카오톡으로 실시간<br />웨이팅 현황을 알려드려요</span>
          </div>

          {/* Divider */}
          <div className="w-16 h-0.5 bg-white/30 mx-auto mb-8" />

          {/* Store Info */}
          {storeLogo ? (
            <img
              src={storeLogo}
              alt={storeName}
              className="w-20 h-20 rounded-full mx-auto mb-4 object-cover"
            />
          ) : (
            <div className="w-20 h-20 bg-white/20 rounded-full mx-auto mb-4 flex items-center justify-center">
              <span className="text-3xl font-bold">{storeName.charAt(0)}</span>
            </div>
          )}
          <h1 className="text-2xl lg:text-3xl font-bold mb-8">{storeName}</h1>

          {/* Divider */}
          <div className="w-16 h-0.5 bg-white/30 mx-auto mb-8" />

          {/* Stats */}
          <div className="flex justify-center gap-12">
            <div className="text-center">
              <p className="text-brand-200 text-sm mb-1">현재 웨이팅</p>
              <p className="text-4xl lg:text-5xl font-bold">
                {selectedType ? selectedType.waitingCount : totalWaiting}
                <span className="text-xl font-normal ml-1">팀</span>
              </p>
            </div>
            <div className="text-center">
              <p className="text-brand-200 text-sm mb-1">예상 시간</p>
              <p className="text-4xl lg:text-5xl font-bold">
                {selectedType ? selectedType.estimatedMinutes : estimatedMinutes}
                <span className="text-xl font-normal ml-1">분</span>
              </p>
            </div>
          </div>

          {/* Selected Type Info */}
          {selectedType && (
            <div className="mt-8 bg-white/10 rounded-lg px-4 py-2 inline-block">
              <span className="text-brand-100">{selectedType.name} 선택됨</span>
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - 60% - Light Background */}
      <div className="w-[60%] h-full bg-white flex flex-col p-6 lg:p-10">
        {/* Error Message */}
        {error && (
          <div className="bg-error-light text-error px-4 py-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        <div className="flex-1 flex flex-col justify-center">
          {/* Phone Input Step */}
          {step === 'phone' && (
            <>
              {/* Phone Display */}
              <div className="text-center mb-6">
                <div className="text-4xl lg:text-5xl font-bold tracking-wider">
                  {formatPhoneDisplay(phone).split('').map((char, i) => (
                    <span
                      key={i}
                      className={char === '_' ? 'text-neutral-300' : 'text-neutral-900'}
                    >
                      {char}
                    </span>
                  ))}
                </div>
                <p className="text-neutral-500 mt-3">
                  실시간 웨이팅 안내를 받을 수 있는<br />번호를 입력해주세요
                </p>
              </div>

              {/* Keypad */}
              <div className="max-w-[360px] mx-auto w-full">
                <div className="grid grid-cols-3 gap-3">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => handleKeyPress(num.toString())}
                      className="h-16 lg:h-20 rounded-xl border border-neutral-200 bg-white text-2xl lg:text-3xl font-medium text-neutral-800 hover:bg-neutral-50 active:bg-neutral-100 transition-colors shadow-sm"
                    >
                      {num}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={handleReset}
                    className="h-16 lg:h-20 rounded-xl bg-neutral-100 text-sm font-medium text-neutral-600 hover:bg-neutral-200 active:bg-neutral-300 transition-colors"
                  >
                    초기화
                  </button>
                  <button
                    type="button"
                    onClick={() => handleKeyPress('0')}
                    className="h-16 lg:h-20 rounded-xl border border-neutral-200 bg-white text-2xl lg:text-3xl font-medium text-neutral-800 hover:bg-neutral-50 active:bg-neutral-100 transition-colors shadow-sm"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="h-16 lg:h-20 rounded-xl border border-neutral-200 bg-white flex items-center justify-center text-neutral-600 hover:bg-neutral-50 active:bg-neutral-100 transition-colors shadow-sm"
                  >
                    <Delete className="w-7 h-7" />
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 mt-8 max-w-[360px] mx-auto w-full">
                {onViewWaitingList && (
                  <Button
                    variant="secondary"
                    size="lg"
                    onClick={onViewWaitingList}
                    className="flex-1 h-14"
                  >
                    <List className="w-5 h-5 mr-2" />
                    웨이팅 목록
                  </Button>
                )}
                <Button
                  onClick={handleProceed}
                  disabled={phone.length !== 8}
                  size="lg"
                  className="flex-1 h-14"
                >
                  웨이팅 시작
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </div>
            </>
          )}

          {/* Type Selection Step */}
          {step === 'type' && (
            <TabletTypeSelector
              waitingTypes={waitingTypes}
              onSelectType={handleSelectType}
            />
          )}

          {/* Party Size Step */}
          {step === 'partySize' && selectedType && (
            <TabletPartySizeSelector
              selectedType={selectedType}
              onBack={() => {
                if (waitingTypes.length === 1) {
                  resetForm();
                } else {
                  setStep('type');
                }
              }}
              onSubmit={handleSubmit}
              isSubmitting={isSubmitting}
            />
          )}
        </div>
      </div>
    </div>
  );
}
