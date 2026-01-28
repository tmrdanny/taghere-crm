'use client';

import { useEffect, useState, Suspense, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { Loader2, ArrowLeft, Phone } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface WaitingData {
  id: string;
  waitingNumber: number;
  waitingTypeName: string;
  partySize: number;
  status: string;
  position: number | null;
  createdAt: string;
}

interface StatusResponse {
  found: boolean;
  storeName: string;
  waiting?: WaitingData;
}

function CancelPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const storeSlug = params.storeSlug as string;
  const phoneFromUrl = searchParams.get('phone') || '';

  const [phone, setPhone] = useState(phoneFromUrl);
  const [waiting, setWaiting] = useState<WaitingData | null>(null);
  const [storeName, setStoreName] = useState('');
  const [step, setStep] = useState<'input' | 'confirm' | 'complete'>(phoneFromUrl ? 'confirm' : 'input');
  const [isLoading, setIsLoading] = useState(!!phoneFromUrl);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Format phone number as user types
  const formatPhoneInput = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 3) return numbers;
    if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
    return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneInput(e.target.value);
    setPhone(formatted);
  };

  // Fetch waiting status
  const fetchWaitingStatus = useCallback(async (phoneNumber: string) => {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setError('올바른 전화번호를 입력해주세요.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/public/waiting/${storeSlug}/status/${cleanPhone}`);

      if (!res.ok) {
        throw new Error('웨이팅 정보를 찾을 수 없습니다.');
      }

      const data: StatusResponse = await res.json();

      if (!data.found || !data.waiting) {
        setError('오늘 등록한 웨이팅이 없습니다.');
        setStep('input');
        return;
      }

      if (data.waiting.status !== 'WAITING' && data.waiting.status !== 'CALLED') {
        setError('이미 처리된 웨이팅입니다.');
        setStep('input');
        return;
      }

      setWaiting(data.waiting);
      setStoreName(data.storeName);
      setStep('confirm');
    } catch (err) {
      setError(err instanceof Error ? err.message : '조회 중 오류가 발생했습니다.');
      setStep('input');
    } finally {
      setIsLoading(false);
    }
  }, [storeSlug]);

  // Auto fetch if phone is in URL
  useEffect(() => {
    if (phoneFromUrl) {
      fetchWaitingStatus(phoneFromUrl);
    }
  }, [phoneFromUrl, fetchWaitingStatus]);

  // Handle form submit
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchWaitingStatus(phone);
  };

  // Handle cancel confirmation
  const handleCancel = async () => {
    if (!waiting) return;

    setIsCancelling(true);
    setError(null);

    try {
      const cleanPhone = phone.replace(/\D/g, '');
      const res = await fetch(`${API_BASE}/api/public/waiting/${storeSlug}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone, waitingId: waiting.id }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || '취소에 실패했습니다.');
      }

      setStep('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : '취소 중 오류가 발생했습니다.');
    } finally {
      setIsCancelling(false);
    }
  };

  // Go back handler
  const handleBack = () => {
    if (step === 'confirm') {
      setStep('input');
      setWaiting(null);
      setError(null);
    } else {
      router.back();
    }
  };

  // Input step - phone number input
  if (step === 'input') {
    return (
      <div className="h-[100dvh] bg-white font-pretendard flex justify-center">
        <div className="w-full max-w-[430px] h-full flex flex-col">
          {/* Header */}
          <div className="px-5 py-4 border-b border-[#ebeced] flex items-center">
            <button onClick={handleBack} className="p-1 -ml-1">
              <ArrowLeft className="w-5 h-5 text-[#1d2022]" />
            </button>
            <h1 className="text-[16px] font-semibold text-[#1d2022] text-center flex-1 mr-6">웨이팅 취소</h1>
          </div>

          {/* Content */}
          <div className="flex-1 px-5 py-8 flex flex-col">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-[#f8f9fa] rounded-full flex items-center justify-center mx-auto">
                <Phone className="w-8 h-8 text-[#6BA3FF]" />
              </div>
              <h2 className="text-[18px] font-bold text-[#1d2022] mt-4 mb-2">
                웨이팅 취소를 위해
              </h2>
              <p className="text-[14px] text-[#91949a]">
                등록된 전화번호를 입력해주세요
              </p>
            </div>

            <form onSubmit={handleSearch} className="flex-1 flex flex-col">
              <div className="mb-4">
                <input
                  type="tel"
                  value={phone}
                  onChange={handlePhoneChange}
                  placeholder="010-1234-5678"
                  className="w-full px-4 py-4 bg-[#f8f9fa] border border-[#ebeced] rounded-[10px] text-[16px] text-[#1d2022] placeholder:text-[#b1b5b8] focus:outline-none focus:ring-2 focus:ring-[#FFD541] focus:border-transparent text-center"
                  maxLength={13}
                  autoFocus
                />
              </div>

              {error && (
                <div className="mb-4 p-3 bg-[#FFF0F3] rounded-[10px]">
                  <p className="text-[13px] text-[#FF6B6B] text-center">{error}</p>
                </div>
              )}

              <div className="mt-auto">
                <button
                  type="submit"
                  disabled={isLoading || phone.replace(/\D/g, '').length < 10}
                  className="w-full py-4 bg-[#FFD541] text-[#1d2022] rounded-[10px] text-[15px] font-semibold hover:bg-[#f5c728] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    '웨이팅 조회'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Loading state for initial URL fetch
  if (isLoading) {
    return (
      <div className="h-[100dvh] bg-white font-pretendard flex justify-center">
        <div className="w-full max-w-[430px] h-full flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-[#6BA3FF] animate-spin mx-auto mb-4" />
            <p className="text-[14px] text-[#91949a]">로딩 중...</p>
          </div>
        </div>
      </div>
    );
  }

  // Complete step - cancellation successful
  if (step === 'complete') {
    return (
      <div className="h-[100dvh] bg-white font-pretendard flex justify-center">
        <div className="w-full max-w-[430px] h-full flex flex-col items-center justify-center px-5">
          <div className="w-20 h-20 bg-[#61EB49] rounded-full flex items-center justify-center mb-6">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-[20px] font-bold text-[#1d2022] mb-2">웨이팅이 취소되었습니다</h2>
          <p className="text-[14px] text-[#91949a] text-center">
            다음에 또 방문해주세요!
          </p>
          <p className="text-[13px] text-[#b1b5b8] mt-6 text-center">
            이 페이지를 닫아주세요
          </p>
        </div>
      </div>
    );
  }

  // Confirm step - show waiting info and cancel button
  return (
    <div className="h-[100dvh] bg-white font-pretendard flex justify-center">
      <div className="w-full max-w-[430px] h-full flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#ebeced] flex items-center">
          <button onClick={handleBack} className="p-1 -ml-1">
            <ArrowLeft className="w-5 h-5 text-[#1d2022]" />
          </button>
          <h1 className="text-[16px] font-semibold text-[#1d2022] text-center flex-1 mr-6">웨이팅 취소</h1>
        </div>

        {/* Content */}
        <div className="flex-1 px-5 py-6 flex flex-col">
          {/* Warning Card */}
          <div className="bg-[#FFF8E1] rounded-[16px] p-6 mb-6">
            <div className="text-center">
              <span className="text-[24px]">⚠️</span>
              <h2 className="text-[18px] font-bold text-[#1d2022] mt-3 mb-4">
                정말 취소하시겠어요?
              </h2>

              {waiting && (
                <div className="text-left bg-white rounded-[10px] p-4">
                  <div className="flex justify-between items-center py-2 border-b border-[#ebeced]">
                    <span className="text-[14px] text-[#91949a]">대기번호</span>
                    <span className="text-[14px] font-semibold text-[#1d2022]">#{waiting.waitingNumber}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-[#ebeced]">
                    <span className="text-[14px] text-[#91949a]">인원</span>
                    <span className="text-[14px] font-semibold text-[#1d2022]">{waiting.partySize}명</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-[14px] text-[#91949a]">현재 순서</span>
                    <span className="text-[14px] font-semibold text-[#1d2022]">{waiting.position ?? '-'}번째</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-[#FFF0F3] rounded-[10px]">
              <p className="text-[13px] text-[#FF6B6B] text-center">{error}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-auto space-y-3">
            <button
              onClick={handleCancel}
              disabled={isCancelling}
              className="w-full py-4 bg-[#FF6B6B] text-white rounded-[10px] text-[15px] font-semibold hover:bg-[#e85c5c] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isCancelling ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                '취소하기'
              )}
            </button>
            <button
              onClick={handleBack}
              disabled={isCancelling}
              className="w-full py-4 bg-[#f8f9fa] text-[#55595e] rounded-[10px] text-[15px] font-semibold hover:bg-[#ebeced] transition-colors disabled:opacity-50"
            >
              돌아가기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WaitingCancelPage() {
  return (
    <Suspense
      fallback={
        <div className="h-[100dvh] bg-white font-pretendard flex justify-center">
          <div className="w-full max-w-[430px] h-full flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-[#6BA3FF] animate-spin" />
          </div>
        </div>
      }
    >
      <CancelPageContent />
    </Suspense>
  );
}
