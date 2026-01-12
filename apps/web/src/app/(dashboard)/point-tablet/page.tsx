'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Delete, Loader2, CheckCircle2, Clock } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Types
interface PointSession {
  id: string;
  paymentAmount: number;
  earnPoints: number;
  remainingSeconds: number;
}

// 연령대 옵션
const AGE_GROUP_OPTIONS = [
  { value: 'TWENTIES', label: '20대' },
  { value: 'THIRTIES', label: '30대' },
  { value: 'FORTIES', label: '40대' },
  { value: 'FIFTIES', label: '50대' },
  { value: 'SIXTY_PLUS', label: '60대 이상' },
];

// 성별 옵션
const GENDER_OPTIONS = [
  { value: 'MALE', label: '남성' },
  { value: 'FEMALE', label: '여성' },
];

export default function PointTabletPage() {
  // 화면 단계
  const [step, setStep] = useState<'phone' | 'info' | 'complete'>('phone');

  // 전화번호 입력
  const [phone, setPhone] = useState('');

  // 추가 정보
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [gender, setGender] = useState<string | null>(null);
  const [ageGroup, setAgeGroup] = useState<string | null>(null);

  // 매장 정보
  const [storeName, setStoreName] = useState('');

  // 세션 정보
  const [session, setSession] = useState<PointSession | null>(null);
  const [isPolling, setIsPolling] = useState(true);

  // 결과
  const [earnedPoints, setEarnedPoints] = useState(0);
  const [newBalance, setNewBalance] = useState(0);

  // 로딩
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hiddenInputRef = useRef<HTMLInputElement>(null);

  // Get auth token from localStorage
  const getAuthToken = () => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('token') || '';
  };

  // 매장 정보 조회
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

  // 세션 조회 (polling)
  const fetchSession = useCallback(async () => {
    try {
      const token = getAuthToken();
      if (!token) return;

      const res = await fetch(`${API_BASE}/api/points/session/current`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setSession(data.session);
      }
    } catch (err) {
      console.error('Failed to fetch session:', err);
    }
  }, []);

  // 초기 로드
  useEffect(() => {
    fetchStoreInfo();
    fetchSession();
  }, [fetchStoreInfo, fetchSession]);

  // Polling (3초 간격)
  useEffect(() => {
    if (!isPolling || step !== 'phone') return;

    const interval = setInterval(fetchSession, 3000);
    return () => clearInterval(interval);
  }, [isPolling, step, fetchSession]);

  // 키패드 포커스
  useEffect(() => {
    if (step === 'phone' && session) {
      setTimeout(() => {
        hiddenInputRef.current?.focus();
      }, 100);
    }
  }, [step, session]);

  // 전화번호 포맷
  const formatPhoneDisplay = (value: string) => {
    if (value.length <= 4) {
      return `010-${value.padEnd(4, '_')}-____`;
    }
    return `010-${value.slice(0, 4)}-${value.slice(4).padEnd(4, '_')}`;
  };

  // 키패드 입력
  const handleKeypadPress = (key: string) => {
    if (phone.length < 8) {
      setPhone(phone + key);
    }
  };

  const handleKeypadDelete = () => {
    setPhone(phone.slice(0, -1));
  };

  const handleKeypadClear = () => {
    setPhone('');
    setError(null);
  };

  // 적립 버튼 클릭
  const handleEarnClick = () => {
    if (phone.length !== 8) {
      setError('전화번호 8자리를 모두 입력해주세요.');
      return;
    }
    if (!session) {
      setError('세션이 없습니다. 사장님에게 문의해주세요.');
      return;
    }
    setError(null);
    setIsPolling(false); // 모달 진입 시 polling 중지
    setStep('info');
  };

  // 포인트 적립 API 호출 (세션 기반)
  const handleSubmitEarn = async () => {
    if (!marketingConsent) {
      setError('마케팅 정보 수신 동의가 필요합니다.');
      return;
    }

    if (!session) {
      setError('세션이 만료되었습니다. 사장님에게 다시 요청해주세요.');
      setStep('phone');
      setIsPolling(true);
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

      const res = await fetch(`${API_BASE}/api/points/session/${session.id}/complete`, {
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

      setEarnedPoints(data.earnedPoints);
      setNewBalance(data.newBalance);
      setStep('complete');

      // 3초 후 자동으로 처음 화면으로
      setTimeout(() => {
        resetAll();
      }, 3000);

    } catch (err) {
      setError(err instanceof Error ? err.message : '적립 실패');
    } finally {
      setIsLoading(false);
    }
  };

  // 모든 상태 초기화
  const resetAll = () => {
    setStep('phone');
    setPhone('');
    setMarketingConsent(false);
    setGender(null);
    setAgeGroup(null);
    setEarnedPoints(0);
    setNewBalance(0);
    setError(null);
    setSession(null);
    setIsPolling(true);
    fetchSession(); // 새 세션 확인
    setTimeout(() => {
      hiddenInputRef.current?.focus();
    }, 100);
  };

  // 숫자 포맷
  const formatNumber = (num: number) => {
    return num.toLocaleString();
  };

  // 키보드 입력 처리
  const handleHiddenInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    if (value.length <= 8) {
      setPhone(value);
    }
  };

  const handleHiddenInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && phone.length === 8 && session) {
      handleEarnClick();
    }
  };

  // 세션 없을 때 표시할 포인트
  const displayPoints = session ? session.earnPoints : 0;

  return (
    <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-4">
      {/* Hidden input for keyboard */}
      {session && (
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
      )}

      {/* Step 1: 전화번호 입력 */}
      {step === 'phone' && (
        <div className="w-full max-w-4xl bg-white rounded-3xl shadow-lg overflow-hidden">
          <div className="flex flex-col lg:flex-row">
            {/* 좌측 - 매장 정보 */}
            <div className={`lg:w-2/5 p-8 lg:p-10 text-white flex flex-col justify-center ${
              session ? 'bg-gradient-to-br from-amber-400 to-amber-500' : 'bg-gradient-to-br from-neutral-400 to-neutral-500'
            }`}>
              <div className="text-center lg:text-left">
                <h1 className="text-2xl lg:text-3xl font-bold mb-4">
                  {storeName || '매장'}
                </h1>
                <div className="w-16 h-1 bg-white/50 mx-auto lg:mx-0 mb-6" />
                <div className="text-5xl lg:text-6xl font-bold mb-2">
                  {formatNumber(displayPoints)}P
                </div>
                <p className="text-lg text-white/90">
                  {session ? '적립' : '(대기 중)'}
                </p>
                <div className="mt-8 pt-8 border-t border-white/20">
                  {session ? (
                    <p className="text-sm text-white/80">
                      결제금액 {formatNumber(session.paymentAmount)}원<br />
                      포인트 알림톡이 발송됩니다
                    </p>
                  ) : (
                    <p className="text-sm text-white/80">
                      사장님이 결제금액을 입력하면<br />
                      포인트 적립이 가능합니다
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* 우측 - 전화번호 입력 */}
            <div className="lg:w-3/5 p-6 lg:p-10">
              {/* 에러 메시지 */}
              {error && (
                <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl mb-4 text-sm">
                  {error}
                </div>
              )}

              {session ? (
                // 세션 있을 때: 전화번호 입력 가능
                <>
                  {/* 전화번호 표시 */}
                  <div
                    className="text-center mb-6 cursor-text"
                    onClick={() => hiddenInputRef.current?.focus()}
                  >
                    <p className="text-sm text-neutral-500 mb-2">휴대전화 번호</p>
                    <div className="text-4xl lg:text-5xl font-bold tracking-wide">
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

                  {/* 안내 문구 */}
                  <p className="text-center text-sm text-neutral-500 mb-6">
                    결제금액 {formatNumber(session.paymentAmount)}원에 대해<br />
                    <span className="font-bold text-amber-600">{formatNumber(session.earnPoints)}P</span>가 적립됩니다!
                  </p>

                  {/* 키패드 */}
                  <div className="bg-neutral-50 rounded-2xl p-4 max-w-sm mx-auto">
                    <div className="grid grid-cols-3 gap-2">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                        <button
                          key={num}
                          onClick={() => handleKeypadPress(num.toString())}
                          className="aspect-square flex items-center justify-center text-2xl font-semibold text-neutral-900 bg-white rounded-xl hover:bg-neutral-100 active:bg-neutral-200 transition-colors shadow-sm"
                        >
                          {num}
                        </button>
                      ))}
                      <button
                        onClick={handleKeypadClear}
                        className="aspect-square flex items-center justify-center text-sm font-semibold text-neutral-600 bg-red-50 rounded-xl hover:bg-red-100 active:bg-red-200 transition-colors"
                      >
                        초기화
                      </button>
                      <button
                        onClick={() => handleKeypadPress('0')}
                        className="aspect-square flex items-center justify-center text-2xl font-semibold text-neutral-900 bg-white rounded-xl hover:bg-neutral-100 active:bg-neutral-200 transition-colors shadow-sm"
                      >
                        0
                      </button>
                      <button
                        onClick={handleKeypadDelete}
                        className="aspect-square flex items-center justify-center text-neutral-600 bg-neutral-200 rounded-xl hover:bg-neutral-300 active:bg-neutral-400 transition-colors"
                      >
                        <Delete className="w-6 h-6" />
                      </button>
                    </div>

                    {/* 적립 버튼 */}
                    <button
                      onClick={handleEarnClick}
                      disabled={phone.length !== 8}
                      className={`w-full mt-4 py-4 rounded-xl text-lg font-bold transition-colors ${
                        phone.length === 8
                          ? 'bg-amber-500 text-white hover:bg-amber-600'
                          : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                      }`}
                    >
                      적립
                    </button>
                  </div>
                </>
              ) : (
                // 세션 없을 때: 대기 중
                <div className="flex flex-col items-center justify-center h-full py-16">
                  <Clock className="w-16 h-16 text-neutral-300 mb-6" />
                  <h2 className="text-2xl font-bold text-neutral-400 mb-2">
                    대기 중
                  </h2>
                  <p className="text-neutral-500 text-center mb-8">
                    사장님이 결제금액을 입력하면<br />
                    포인트 적립이 가능합니다.
                  </p>
                  <p className="text-sm text-neutral-400">
                    잠시만 기다려주세요
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Step 2: 추가 정보 입력 모달 */}
      {step === 'info' && (
        <div className="w-full max-w-md bg-white rounded-3xl shadow-lg p-8">
          <h2 className="text-xl font-bold text-neutral-900 text-center mb-2">
            추가 정보 입력
          </h2>
          <p className="text-sm text-neutral-500 text-center mb-6">
            선택사항이지만 더 나은 서비스를 위해<br />
            입력해 주시면 감사하겠습니다
          </p>

          {/* 에러 메시지 */}
          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl mb-4 text-sm">
              {error}
            </div>
          )}

          {/* 마케팅 동의 (필수) */}
          <div className="mb-6">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={marketingConsent}
                onChange={(e) => setMarketingConsent(e.target.checked)}
                className="w-5 h-5 mt-0.5 rounded border-neutral-300 text-amber-500 focus:ring-amber-500"
              />
              <span className="text-sm text-neutral-700">
                <span className="font-semibold text-red-500">[필수]</span> 마케팅 정보 수신에 동의합니다
                <br />
                <span className="text-xs text-neutral-500">
                  포인트 적립, 할인 혜택 등의 정보를 받아보실 수 있습니다.
                </span>
              </span>
            </label>
          </div>

          {/* 성별 선택 */}
          <div className="mb-6">
            <p className="text-sm font-medium text-neutral-700 mb-3">
              성별 <span className="text-neutral-400">(선택)</span>
            </p>
            <div className="flex gap-2">
              {GENDER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setGender(gender === option.value ? null : option.value)}
                  className={`flex-1 py-3 rounded-xl text-sm font-medium transition-colors ${
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
                className={`flex-1 py-3 rounded-xl text-sm font-medium transition-colors ${
                  gender === null
                    ? 'bg-neutral-200 text-neutral-900'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                선택 안함
              </button>
            </div>
          </div>

          {/* 연령대 선택 */}
          <div className="mb-8">
            <p className="text-sm font-medium text-neutral-700 mb-3">
              연령대 <span className="text-neutral-400">(선택)</span>
            </p>
            <div className="grid grid-cols-3 gap-2">
              {AGE_GROUP_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setAgeGroup(ageGroup === option.value ? null : option.value)}
                  className={`py-3 rounded-xl text-sm font-medium transition-colors ${
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
                className={`py-3 rounded-xl text-sm font-medium transition-colors ${
                  ageGroup === null
                    ? 'bg-neutral-200 text-neutral-900'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                선택 안함
              </button>
            </div>
          </div>

          {/* 버튼 */}
          <div className="flex gap-3">
            <button
              onClick={() => {
                setStep('phone');
                setIsPolling(true);
                setError(null);
              }}
              className="flex-1 py-4 rounded-xl text-neutral-600 bg-neutral-100 hover:bg-neutral-200 font-medium transition-colors"
            >
              이전
            </button>
            <button
              onClick={handleSubmitEarn}
              disabled={!marketingConsent || isLoading}
              className={`flex-1 py-4 rounded-xl font-bold transition-colors flex items-center justify-center gap-2 ${
                marketingConsent && !isLoading
                  ? 'bg-amber-500 text-white hover:bg-amber-600'
                  : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
              }`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  처리 중...
                </>
              ) : (
                '포인트 적립하기'
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: 완료 화면 */}
      {step === 'complete' && (
        <div className="w-full max-w-md bg-white rounded-3xl shadow-lg p-8 text-center">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-12 h-12 text-green-600" />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-neutral-900 mb-2">
            적립 완료!
          </h2>

          <div className="text-4xl font-bold text-amber-500 my-4">
            {formatNumber(earnedPoints)}P
          </div>

          <p className="text-neutral-600 mb-6">
            적립되었습니다
          </p>

          <div className="bg-neutral-50 rounded-xl py-4 px-6 inline-block">
            <span className="text-sm text-neutral-500">현재 보유 포인트</span>
            <p className="text-2xl font-bold text-neutral-900">
              {formatNumber(newBalance)} P
            </p>
          </div>

          <p className="text-xs text-neutral-400 mt-6">
            3초 후 자동으로 처음 화면으로 돌아갑니다
          </p>

          <button
            onClick={resetAll}
            className="mt-4 px-8 py-3 rounded-xl bg-neutral-100 text-neutral-700 font-medium hover:bg-neutral-200 transition-colors"
          >
            처음으로
          </button>
        </div>
      )}
    </div>
  );
}
