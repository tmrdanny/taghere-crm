'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Delete, Loader2, CheckCircle2, Stamp } from 'lucide-react';
import { cn } from '@/lib/utils';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const AGE_GROUP_OPTIONS = [
  { value: 'TWENTIES', label: '20대' },
  { value: 'THIRTIES', label: '30대' },
  { value: 'FORTIES', label: '40대' },
  { value: 'FIFTIES', label: '50대' },
  { value: 'SIXTY_PLUS', label: '60대 이상' },
];

const GENDER_OPTIONS = [
  { value: 'MALE', label: '남성' },
  { value: 'FEMALE', label: '여성' },
];

interface VisitSourceOption {
  id: string;
  label: string;
}

type Step = 'phone' | 'info' | 'visit-source' | 'complete';

export default function StampTabletPage() {
  const router = useRouter();
  const [isAuthChecked, setIsAuthChecked] = useState(false);
  const [step, setStep] = useState<Step>('phone');

  const [phone, setPhone] = useState('');

  const [marketingConsent, setMarketingConsent] = useState(false);
  const [gender, setGender] = useState<string | null>(null);
  const [ageGroup, setAgeGroup] = useState<string | null>(null);

  const [storeName, setStoreName] = useState('');
  const [storeSlug, setStoreSlug] = useState('');

  const [visitSourceEnabled, setVisitSourceEnabled] = useState(false);
  const [visitSourceOptions, setVisitSourceOptions] = useState<VisitSourceOption[]>([]);
  const [selectedVisitSource, setSelectedVisitSource] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState<string | null>(null);
  const [newBalance, setNewBalance] = useState(0);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hiddenInputRef = useRef<HTMLInputElement>(null);

  const getAuthToken = () => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('token') || '';
  };

  const fetchStoreInfo = useCallback(async () => {
    try {
      const token = getAuthToken();
      if (!token) {
        router.replace('/login');
        return;
      }

      const res = await fetch(`${API_BASE}/api/settings/store`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('token');
        router.replace('/login');
        return;
      }

      if (res.ok) {
        const data = await res.json();
        setStoreName(data.name || '매장');
        if (data.slug) setStoreSlug(data.slug);
        setIsAuthChecked(true);
      }
    } catch (err) {
      console.error('Failed to fetch store info:', err);
    }
  }, [router]);

  const fetchVisitSourceOptions = useCallback(async (slug: string) => {
    if (!slug) return;
    try {
      const res = await fetch(`${API_BASE}/api/taghere/visit-source-options/${slug}`);
      if (res.ok) {
        const data = await res.json();
        setVisitSourceEnabled(!!data.enabled);
        setVisitSourceOptions(data.options || []);
      }
    } catch (err) {
      console.error('Failed to fetch visit source options:', err);
    }
  }, []);

  useEffect(() => {
    fetchStoreInfo();
  }, [fetchStoreInfo]);

  useEffect(() => {
    if (storeSlug) fetchVisitSourceOptions(storeSlug);
  }, [storeSlug, fetchVisitSourceOptions]);

  useEffect(() => {
    if (step === 'phone') {
      setTimeout(() => {
        hiddenInputRef.current?.focus();
      }, 100);
    }
  }, [step]);

  const formatPhoneDisplay = (value: string) => {
    if (value.length <= 4) {
      return `010-${value.padEnd(4, '_')}-____`;
    }
    return `010-${value.slice(0, 4)}-${value.slice(4).padEnd(4, '_')}`;
  };

  const handleKeyPress = (key: string) => {
    if (phone.length < 8) setPhone(phone + key);
  };

  const handleDelete = () => setPhone(phone.slice(0, -1));

  const handleReset = () => {
    setPhone('');
    setError(null);
  };

  const handlePhoneProceed = () => {
    if (phone.length !== 8) {
      setError('전화번호 8자리를 모두 입력해주세요.');
      return;
    }
    setError(null);
    setStep('info');
  };

  const handleSubmitEarn = async () => {
    if (!marketingConsent) {
      setError('마케팅 정보 수신 동의가 필요합니다.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const token = getAuthToken();
      if (!token) {
        setError('로그인이 필요합니다.');
        return;
      }

      const res = await fetch(`${API_BASE}/api/stamps/tablet-earn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          phone: `010${phone}`,
          marketingConsent: true,
          gender: gender || undefined,
          ageGroup: ageGroup || undefined,
        }),
      });

      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('token');
        router.replace('/login');
        return;
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || '적립 중 오류가 발생했습니다.');
      }

      const data = await res.json();
      setCustomerId(data.customer?.id ?? null);
      setNewBalance(data.newBalance);

      if (visitSourceEnabled && visitSourceOptions.length > 0) {
        setStep('visit-source');
      } else {
        setStep('complete');
        setTimeout(() => resetAll(), 3000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '적립 실패');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVisitSourceSelect = async (optionId: string) => {
    setSelectedVisitSource(optionId);
    if (!customerId) {
      setStep('complete');
      setTimeout(() => resetAll(), 3000);
      return;
    }
    try {
      await fetch(`${API_BASE}/api/customers/visit-source`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, visitSource: optionId }),
      });
    } catch (err) {
      console.error('Visit source save error:', err);
    } finally {
      setStep('complete');
      setTimeout(() => resetAll(), 3000);
    }
  };

  const handleVisitSourceSkip = () => {
    setStep('complete');
    setTimeout(() => resetAll(), 3000);
  };

  const resetAll = () => {
    setStep('phone');
    setPhone('');
    setMarketingConsent(false);
    setGender(null);
    setAgeGroup(null);
    setSelectedVisitSource(null);
    setCustomerId(null);
    setNewBalance(0);
    setError(null);
    setTimeout(() => hiddenInputRef.current?.focus(), 100);
  };

  const formatNumber = (num: number) => num.toLocaleString();

  const handleHiddenInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    if (value.length <= 8) setPhone(value);
  };

  if (!isAuthChecked) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-neutral-50">
        <Loader2 className="w-8 h-8 animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden">
      <div className="h-full w-full flex">
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

        {/* Left Panel - 40% - Dark Background */}
        <div className="w-[40%] h-full bg-[#1A1A1A] text-white flex flex-col">
          <div className="flex-1 flex flex-col items-center justify-center px-6">
            <p className="text-white font-bold text-2xl md:text-3xl mb-2">
              {storeName || '매장'}
            </p>
            <p className="text-neutral-400 text-sm md:text-base mb-6">스탬프 적립</p>
            <Stamp className="w-16 h-16 md:w-20 md:h-20 text-[#FCD535] mb-4" />
            <div className="flex items-baseline">
              <span className="text-[#FCD535] text-4xl md:text-5xl font-bold mr-1">+</span>
              <span className="text-[120px] font-bold text-[#FCD535] leading-none">
                1
              </span>
            </div>
            <p className="text-xl md:text-2xl text-[#FCD535] mt-3 font-medium">스탬프</p>
            <p className="text-sm text-neutral-400 mt-8 text-center leading-relaxed">
              전화번호 뒷 8자리를 입력하면<br />
              스탬프가 적립됩니다
            </p>
          </div>
        </div>

        {/* Right Panel - 60% - White Background */}
        <div className="w-[60%] h-full bg-white flex flex-col">
          {/* Step 1: Phone Input */}
          {step === 'phone' && (
            <>
              {error && (
                <div className="mx-8 mt-4 bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div className="flex-1 flex flex-col justify-center px-8 lg:px-16">
                <div className="w-full">
                  {/* Phone Display */}
                  <div className="flex flex-col items-center mb-8">
                    <div className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-neutral-900 whitespace-nowrap">
                      {formatPhoneDisplay(phone)}
                    </div>
                    <p className="text-neutral-500 mt-4 text-lg text-center">
                      전화번호 8자리를 입력해주세요
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

                  {/* Action Button */}
                  <div className="max-w-md mx-auto mt-8">
                    <button
                      type="button"
                      onClick={handlePhoneProceed}
                      disabled={phone.length !== 8}
                      className={cn(
                        'w-full h-16 rounded-xl font-semibold text-lg transition-colors',
                        phone.length === 8
                          ? 'bg-[#FCD535] text-neutral-900 hover:bg-[#e5c130]'
                          : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                      )}
                    >
                      적립
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Step 2: Info */}
          {step === 'info' && (
            <div className="flex-1 flex flex-col justify-center px-8 lg:px-16 py-8 overflow-y-auto">
              <div className="w-full max-w-md mx-auto">
                <h2 className="text-2xl font-bold text-neutral-900 text-center mb-2">
                  추가 정보 입력
                </h2>
                <p className="text-sm text-neutral-500 text-center mb-6">
                  더 나은 서비스를 위해 입력해 주세요
                </p>

                {error && (
                  <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg mb-4 text-sm">
                    {error}
                  </div>
                )}

                {/* 마케팅 동의 */}
                <div className="mb-5 p-4 bg-neutral-50 rounded-xl border border-neutral-200">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={marketingConsent}
                      onChange={(e) => setMarketingConsent(e.target.checked)}
                      className="w-5 h-5 mt-0.5 rounded border-neutral-300 text-brand-800 focus:ring-brand-800"
                    />
                    <span className="text-sm text-neutral-700">
                      <span className="font-semibold text-red-500">[필수]</span> 마케팅 정보 수신 동의
                      <br />
                      <span className="text-xs text-neutral-500">
                        스탬프 적립, 할인 혜택 등 정보를 받아보실 수 있습니다.
                      </span>
                    </span>
                  </label>
                </div>

                {/* 성별 */}
                <div className="mb-5">
                  <p className="text-sm font-medium text-neutral-700 mb-2">
                    성별 <span className="text-neutral-400">(선택)</span>
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {GENDER_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setGender(gender === option.value ? null : option.value)}
                        className={cn(
                          'h-14 rounded-xl text-base font-medium transition-colors',
                          gender === option.value
                            ? 'bg-brand-800 text-white'
                            : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                    <button
                      onClick={() => setGender(null)}
                      className={cn(
                        'h-14 rounded-xl text-base font-medium transition-colors',
                        gender === null
                          ? 'bg-neutral-200 text-neutral-700'
                          : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                      )}
                    >
                      선택 안함
                    </button>
                  </div>
                </div>

                {/* 연령대 */}
                <div className="mb-6">
                  <p className="text-sm font-medium text-neutral-700 mb-2">
                    연령대 <span className="text-neutral-400">(선택)</span>
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {AGE_GROUP_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setAgeGroup(ageGroup === option.value ? null : option.value)}
                        className={cn(
                          'h-14 rounded-xl text-base font-medium transition-colors',
                          ageGroup === option.value
                            ? 'bg-brand-800 text-white'
                            : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                    <button
                      onClick={() => setAgeGroup(null)}
                      className={cn(
                        'h-14 rounded-xl text-base font-medium transition-colors',
                        ageGroup === null
                          ? 'bg-neutral-200 text-neutral-700'
                          : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                      )}
                    >
                      선택 안함
                    </button>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setStep('phone');
                      setError(null);
                    }}
                    className="flex-1 h-16 rounded-xl text-neutral-700 bg-neutral-100 hover:bg-neutral-200 font-medium transition-colors text-lg"
                  >
                    이전
                  </button>
                  <button
                    onClick={handleSubmitEarn}
                    disabled={!marketingConsent || isLoading}
                    className={cn(
                      'flex-1 h-16 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 text-lg',
                      marketingConsent && !isLoading
                        ? 'bg-[#FCD535] text-neutral-900 hover:bg-[#e5c130]'
                        : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                    )}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        처리 중...
                      </>
                    ) : (
                      '적립하기'
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: 방문 경로 */}
          {step === 'visit-source' && (
            <div className="flex-1 flex flex-col justify-center px-8 lg:px-16 py-8">
              <div className="w-full max-w-md mx-auto">
                <h2 className="text-2xl font-bold text-neutral-900 text-center mb-2">
                  어떻게 방문하셨나요?
                </h2>
                <p className="text-sm text-neutral-500 text-center mb-6">
                  매장 운영에 큰 도움이 됩니다
                </p>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  {visitSourceOptions.map((option) => {
                    const isSelected = selectedVisitSource === option.id;
                    return (
                      <button
                        key={option.id}
                        onClick={() => handleVisitSourceSelect(option.id)}
                        className={cn(
                          'h-16 rounded-xl text-base font-medium transition-colors border-2',
                          isSelected
                            ? 'bg-brand-800 text-white border-brand-800'
                            : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300'
                        )}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={handleVisitSourceSkip}
                  className="w-full py-3 text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
                >
                  건너뛰기
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Complete */}
          {step === 'complete' && (
            <div className="flex-1 flex flex-col justify-center items-center px-8 py-8">
              <div className="w-full max-w-md text-center">
                <div className="flex justify-center mb-6">
                  <div className="w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-14 h-14 text-emerald-600" />
                  </div>
                </div>

                <h2 className="text-2xl font-bold text-neutral-900 mb-2">
                  적립 완료!
                </h2>

                <div className="flex items-center justify-center gap-2 text-4xl font-bold text-brand-800 my-4">
                  <Stamp className="w-8 h-8" />
                  <span>+1 스탬프</span>
                </div>

                <p className="text-base text-neutral-600 mb-6">
                  적립되었습니다
                </p>

                <div className="bg-neutral-50 rounded-xl py-4 px-6 inline-block mb-4">
                  <span className="text-sm text-neutral-500">현재 보유 스탬프</span>
                  <p className="text-2xl font-bold text-neutral-900">
                    {formatNumber(newBalance)}개
                  </p>
                </div>

                <p className="text-xs text-neutral-400 mb-3">
                  3초 후 자동으로 처음 화면으로 돌아갑니다
                </p>

                <button
                  onClick={resetAll}
                  className="px-8 py-3 rounded-xl bg-neutral-100 text-neutral-700 font-medium hover:bg-neutral-200 transition-colors text-base"
                >
                  처음으로
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
