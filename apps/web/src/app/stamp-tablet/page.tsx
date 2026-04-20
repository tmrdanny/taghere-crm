'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Delete, Loader2, CheckCircle2, Stamp } from 'lucide-react';

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

export default function StampTabletPage() {
  const [step, setStep] = useState<'phone' | 'info' | 'complete'>('phone');

  const [phone, setPhone] = useState('');

  const [marketingConsent, setMarketingConsent] = useState(false);
  const [gender, setGender] = useState<string | null>(null);
  const [ageGroup, setAgeGroup] = useState<string | null>(null);

  const [storeName, setStoreName] = useState('');

  const [earnedStamps, setEarnedStamps] = useState(0);
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
      if (!token) return;

      const res = await fetch(`${API_BASE}/api/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setStoreName(data.store?.name || '매장');
      }
    } catch (err) {
      console.error('Failed to fetch store info:', err);
    }
  }, []);

  useEffect(() => {
    fetchStoreInfo();
  }, [fetchStoreInfo]);

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

  const handleKeypadPress = (key: string) => {
    if (phone.length < 8) {
      setPhone(phone + key);
    }
  };

  const handleKeypadDelete = () => setPhone(phone.slice(0, -1));

  const handleKeypadClear = () => {
    setPhone('');
    setError(null);
  };

  const handleEarnClick = () => {
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

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || '적립 중 오류가 발생했습니다.');
      }

      const data = await res.json();

      setEarnedStamps(data.earnedStamps);
      setNewBalance(data.newBalance);
      setStep('complete');

      setTimeout(() => {
        resetAll();
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '적립 실패');
    } finally {
      setIsLoading(false);
    }
  };

  const resetAll = () => {
    setStep('phone');
    setPhone('');
    setMarketingConsent(false);
    setGender(null);
    setAgeGroup(null);
    setEarnedStamps(0);
    setNewBalance(0);
    setError(null);
    setTimeout(() => {
      hiddenInputRef.current?.focus();
    }, 100);
  };

  const formatNumber = (num: number) => num.toLocaleString();

  const handleHiddenInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    if (value.length <= 8) {
      setPhone(value);
    }
  };

  const handleHiddenInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && phone.length === 8) {
      handleEarnClick();
    }
  };

  return (
    <div className="w-screen h-screen flex items-center justify-center overflow-hidden bg-neutral-100">
      <input
        ref={hiddenInputRef}
        type="text"
        inputMode="numeric"
        value={phone}
        onChange={handleHiddenInputChange}
        onKeyDown={handleHiddenInputKeyDown}
        className="absolute opacity-0 pointer-events-none"
        autoFocus
      />

      <div
        className="w-full h-full flex items-center justify-center p-2 sm:p-4"
        style={{ maxWidth: 'min(100vw, calc(100vh * 1.6))', maxHeight: 'min(100vh, calc(100vw / 1.6))' }}
      >
        {/* Step 1: 전화번호 입력 */}
        {step === 'phone' && (
          <div className="w-full h-full bg-white rounded-2xl sm:rounded-3xl shadow-lg overflow-hidden flex">
            {/* 좌측 - 매장 정보 (35%) */}
            <div className="w-[35%] h-full p-4 sm:p-6 md:p-8 lg:p-10 text-white flex flex-col justify-center bg-gradient-to-br from-amber-500 to-amber-600">
              <div className="text-center">
                <h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold mb-2 sm:mb-3 md:mb-4 line-clamp-2">
                  {storeName || '매장'}
                </h1>
                <div className="w-10 sm:w-12 md:w-16 h-0.5 sm:h-1 bg-white/50 mx-auto mb-3 sm:mb-4 md:mb-6" />
                <div className="flex flex-col items-center justify-center mb-1 sm:mb-2">
                  <Stamp className="w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 lg:w-20 lg:h-20 mb-2 sm:mb-3 md:mb-4" />
                  <div className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold">+1 스탬프</div>
                </div>
                <p className="text-sm sm:text-base md:text-lg text-white/90 mt-1 sm:mt-2">적립</p>
                <div className="mt-4 sm:mt-6 md:mt-8 pt-4 sm:pt-6 md:pt-8 border-t border-white/20">
                  <p className="text-[10px] sm:text-xs md:text-sm text-white/80 leading-relaxed">
                    전화번호 뒷 8자리를 입력하면<br />
                    스탬프 1개가 적립됩니다
                  </p>
                </div>
              </div>
            </div>

            {/* 우측 - 전화번호 입력 (65%) */}
            <div className="w-[65%] h-full p-3 sm:p-4 md:p-6 lg:p-8 flex flex-col justify-center overflow-hidden">
              {error && (
                <div className="bg-red-50 text-red-600 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl mb-2 sm:mb-3 text-[10px] sm:text-xs md:text-sm">
                  {error}
                </div>
              )}

              <div className="flex flex-col h-full justify-center">
                {/* 전화번호 표시 */}
                <div
                  className="text-center mb-2 sm:mb-3 md:mb-4 cursor-text"
                  onClick={() => hiddenInputRef.current?.focus()}
                >
                  <div className="h-[14px] sm:h-[16px] md:h-[20px] mb-1 sm:mb-2"></div>
                  <div className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-wide">
                    {formatPhoneDisplay(phone).split('').map((char, i) => (
                      <span
                        key={i}
                        className={char === '_' ? 'text-neutral-300' : 'text-neutral-900'}
                      >
                        {char}
                      </span>
                    ))}
                  </div>
                </div>

                <p className="text-center text-[10px] sm:text-xs md:text-sm text-neutral-500 mb-2 sm:mb-3 md:mb-4">
                  전화번호 입력 후 <span className="font-bold text-amber-600">스탬프 1개</span>가 적립됩니다!
                </p>

                {/* 키패드 */}
                <div className="bg-neutral-50 rounded-xl sm:rounded-2xl p-3 sm:p-4 md:p-5 w-full max-w-[400px] mx-auto">
                  <div className="grid grid-cols-3 gap-1.5 sm:gap-2 md:gap-3">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                      <button
                        key={num}
                        onClick={() => handleKeypadPress(num.toString())}
                        className="aspect-square flex items-center justify-center text-xl sm:text-2xl md:text-3xl font-semibold rounded-lg sm:rounded-xl transition-colors shadow-sm text-neutral-900 bg-white hover:bg-neutral-100 active:bg-neutral-200"
                      >
                        {num}
                      </button>
                    ))}
                    <button
                      onClick={handleKeypadClear}
                      className="aspect-square flex items-center justify-center text-[10px] sm:text-xs md:text-sm font-semibold rounded-lg sm:rounded-xl transition-colors text-neutral-600 bg-red-50 hover:bg-red-100 active:bg-red-200"
                    >
                      초기화
                    </button>
                    <button
                      onClick={() => handleKeypadPress('0')}
                      className="aspect-square flex items-center justify-center text-xl sm:text-2xl md:text-3xl font-semibold rounded-lg sm:rounded-xl transition-colors shadow-sm text-neutral-900 bg-white hover:bg-neutral-100 active:bg-neutral-200"
                    >
                      0
                    </button>
                    <button
                      onClick={handleKeypadDelete}
                      className="aspect-square flex items-center justify-center rounded-lg sm:rounded-xl transition-colors text-neutral-600 bg-neutral-200 hover:bg-neutral-300 active:bg-neutral-400"
                    >
                      <Delete className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7" />
                    </button>
                  </div>

                  <button
                    onClick={handleEarnClick}
                    disabled={phone.length !== 8}
                    className={`w-full mt-3 sm:mt-4 md:mt-5 py-3 sm:py-4 md:py-5 rounded-lg sm:rounded-xl text-base sm:text-lg md:text-xl font-bold transition-colors ${
                      phone.length === 8
                        ? 'bg-amber-500 text-white hover:bg-amber-600'
                        : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                    }`}
                  >
                    적립
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: 추가 정보 입력 */}
        {step === 'info' && (
          <div className="w-full max-w-[90%] sm:max-w-md bg-white rounded-2xl sm:rounded-3xl shadow-lg p-4 sm:p-6 md:p-8">
            <h2 className="text-base sm:text-lg md:text-xl font-bold text-neutral-900 text-center mb-1 sm:mb-2">
              추가 정보 입력
            </h2>
            <p className="text-[10px] sm:text-xs md:text-sm text-neutral-500 text-center mb-3 sm:mb-4 md:mb-6">
              선택사항이지만 더 나은 서비스를 위해<br />
              입력해 주시면 감사하겠습니다
            </p>

            {error && (
              <div className="bg-red-50 text-red-600 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl mb-2 sm:mb-3 text-[10px] sm:text-xs md:text-sm">
                {error}
              </div>
            )}

            <div className="mb-3 sm:mb-4 md:mb-6">
              <label className="flex items-start gap-2 sm:gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={marketingConsent}
                  onChange={(e) => setMarketingConsent(e.target.checked)}
                  className="w-4 h-4 sm:w-5 sm:h-5 mt-0.5 rounded border-neutral-300 text-amber-500 focus:ring-amber-500"
                />
                <span className="text-xs sm:text-sm text-neutral-700">
                  <span className="font-semibold text-red-500">[필수]</span> 마케팅 정보 수신에 동의합니다
                  <br />
                  <span className="text-[10px] sm:text-xs text-neutral-500">
                    스탬프 적립, 할인 혜택 등의 정보를 받아보실 수 있습니다.
                  </span>
                </span>
              </label>
            </div>

            <div className="mb-3 sm:mb-4 md:mb-6">
              <p className="text-xs sm:text-sm font-medium text-neutral-700 mb-1.5 sm:mb-2 md:mb-3">
                성별 <span className="text-neutral-400">(선택)</span>
              </p>
              <div className="flex gap-1.5 sm:gap-2">
                {GENDER_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setGender(gender === option.value ? null : option.value)}
                    className={`flex-1 py-2 sm:py-2.5 md:py-3 rounded-lg sm:rounded-xl text-[10px] sm:text-xs md:text-sm font-medium transition-colors ${
                      gender === option.value
                        ? 'bg-amber-500 text-white'
                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
                <button
                  onClick={() => setGender(null)}
                  className={`flex-1 py-2 sm:py-2.5 md:py-3 rounded-lg sm:rounded-xl text-[10px] sm:text-xs md:text-sm font-medium transition-colors ${
                    gender === null
                      ? 'bg-neutral-200 text-neutral-900'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  선택 안함
                </button>
              </div>
            </div>

            <div className="mb-4 sm:mb-6 md:mb-8">
              <p className="text-xs sm:text-sm font-medium text-neutral-700 mb-1.5 sm:mb-2 md:mb-3">
                연령대 <span className="text-neutral-400">(선택)</span>
              </p>
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                {AGE_GROUP_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setAgeGroup(ageGroup === option.value ? null : option.value)}
                    className={`py-2 sm:py-2.5 md:py-3 rounded-lg sm:rounded-xl text-[10px] sm:text-xs md:text-sm font-medium transition-colors ${
                      ageGroup === option.value
                        ? 'bg-amber-500 text-white'
                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
                <button
                  onClick={() => setAgeGroup(null)}
                  className={`py-2 sm:py-2.5 md:py-3 rounded-lg sm:rounded-xl text-[10px] sm:text-xs md:text-sm font-medium transition-colors ${
                    ageGroup === null
                      ? 'bg-neutral-200 text-neutral-900'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  선택 안함
                </button>
              </div>
            </div>

            <div className="flex gap-2 sm:gap-3">
              <button
                onClick={() => {
                  setStep('phone');
                  setError(null);
                }}
                className="flex-1 py-2.5 sm:py-3 md:py-4 rounded-lg sm:rounded-xl text-neutral-600 bg-neutral-100 hover:bg-neutral-200 font-medium transition-colors text-xs sm:text-sm md:text-base"
              >
                이전
              </button>
              <button
                onClick={handleSubmitEarn}
                disabled={!marketingConsent || isLoading}
                className={`flex-1 py-2.5 sm:py-3 md:py-4 rounded-lg sm:rounded-xl font-bold transition-colors flex items-center justify-center gap-1.5 sm:gap-2 text-xs sm:text-sm md:text-base ${
                  marketingConsent && !isLoading
                    ? 'bg-amber-500 text-white hover:bg-amber-600'
                    : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                }`}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 md:w-5 md:h-5 animate-spin" />
                    처리 중...
                  </>
                ) : (
                  '스탬프 적립하기'
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: 완료 화면 */}
        {step === 'complete' && (
          <div className="w-full max-w-[90%] sm:max-w-md bg-white rounded-2xl sm:rounded-3xl shadow-lg p-4 sm:p-6 md:p-8 text-center">
            <div className="flex justify-center mb-3 sm:mb-4 md:mb-6">
              <div className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 text-green-600" />
              </div>
            </div>

            <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-neutral-900 mb-1 sm:mb-2">
              적립 완료!
            </h2>

            <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-amber-500 my-2 sm:my-3 md:my-4 flex items-center justify-center gap-2">
              <Stamp className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8" />
              +{earnedStamps} 스탬프
            </div>

            <p className="text-xs sm:text-sm md:text-base text-neutral-600 mb-3 sm:mb-4 md:mb-6">
              적립되었습니다
            </p>

            <div className="bg-neutral-50 rounded-lg sm:rounded-xl py-2 sm:py-3 md:py-4 px-3 sm:px-4 md:px-6 inline-block">
              <span className="text-[10px] sm:text-xs md:text-sm text-neutral-500">현재 보유 스탬프</span>
              <p className="text-lg sm:text-xl md:text-2xl font-bold text-neutral-900">
                {formatNumber(newBalance)}개
              </p>
            </div>

            <p className="text-[9px] sm:text-[10px] md:text-xs text-neutral-400 mt-3 sm:mt-4 md:mt-6">
              3초 후 자동으로 처음 화면으로 돌아갑니다
            </p>

            <button
              onClick={resetAll}
              className="mt-2 sm:mt-3 md:mt-4 px-4 sm:px-6 md:px-8 py-2 sm:py-2.5 md:py-3 rounded-lg sm:rounded-xl bg-neutral-100 text-neutral-700 font-medium hover:bg-neutral-200 transition-colors text-xs sm:text-sm md:text-base"
            >
              처음으로
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
