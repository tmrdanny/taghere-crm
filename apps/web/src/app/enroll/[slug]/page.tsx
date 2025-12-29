'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { formatNumber } from '@/lib/utils';

interface StoreInfo {
  id: string;
  name: string;
  fixedPointEnabled: boolean;
  fixedPointAmount: number;
}

interface SuccessData {
  points: number;
  storeName: string;
  customerId: string;
}

function StarRating({ rating, onRatingChange }: { rating: number; onRatingChange: (rating: number) => void }) {
  return (
    <div className="flex gap-2 justify-center">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onRatingChange(star)}
          className="cursor-pointer hover:scale-110 transition-transform"
        >
          <svg
            className={`w-7 h-7 ${star <= rating ? 'fill-yellow-400 text-yellow-400' : 'fill-none text-neutral-300'}`}
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
          </svg>
        </button>
      ))}
    </div>
  );
}

function GiftBoxImage({ onClick, isOpening }: { onClick: () => void; isOpening: boolean }) {
  return (
    <div
      className={`gift-box-wrapper ${isOpening ? 'opening' : ''}`}
      onClick={!isOpening ? onClick : undefined}
    >
      <Image
        src="/gift-box.avif"
        alt="선물 상자"
        width={180}
        height={180}
        className="gift-box-image"
        priority
      />

      <style jsx>{`
        .gift-box-wrapper {
          cursor: pointer;
          animation: gentleFloat 3s ease-in-out infinite;
        }

        .gift-box-wrapper:hover {
          animation: gentleFloat 2s ease-in-out infinite;
        }

        .gift-box-wrapper.opening {
          animation: boxOpen 0.6s ease-out forwards;
        }

        @keyframes gentleFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }

        @keyframes boxOpen {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(0.8); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function SuccessPopup({
  successData,
  onClose
}: {
  successData: SuccessData;
  onClose: () => void;
}) {
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!successData.customerId) {
      onClose();
      return;
    }

    setIsSubmitting(true);
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/customers/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerId: successData.customerId,
          feedbackRating: feedbackRating || null,
          feedbackText: feedbackText.trim() || null,
        }),
      });
      setIsSubmitted(true);
    } catch (error) {
      console.error('Feedback submission error:', error);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  // 제출 완료 화면
  if (isSubmitted) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
        <div className="bg-white rounded-2xl w-full max-w-xs shadow-xl overflow-hidden p-6 text-center">
          <h2 className="text-lg font-bold text-neutral-900 mb-2">
            제출이 완료되었어요!
          </h2>
          <p className="text-sm text-neutral-500 mb-5">
            소중한 의견 감사합니다
          </p>
          <button
            onClick={onClose}
            className="w-full py-3 bg-[#FFD541] hover:bg-[#FFCA00] text-neutral-900 font-semibold text-base rounded-xl transition-colors"
          >
            확인
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
      <div className="bg-white rounded-2xl w-full max-w-xs shadow-xl overflow-hidden">
        {/* Points Display */}
        <div className="pt-6 pb-4 text-center">
          <p className="text-3xl font-extrabold text-[#131651]">
            +{formatNumber(successData.points)} P
          </p>
        </div>

        {/* Feedback Form */}
        <div className="px-5 pb-5">
          <h2 className="text-base font-bold text-neutral-900 text-center mb-1">
            매장 경험을 남겨주세요
          </h2>
          <p className="text-xs text-neutral-500 text-center mb-4">
            소중한 의견은 큰 도움이 돼요
          </p>

          {/* Star Rating */}
          <div className="mb-3">
            <StarRating rating={feedbackRating} onRatingChange={setFeedbackRating} />
          </div>

          {/* Feedback Text */}
          <textarea
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder="의견을 남겨주세요 (선택)"
            className="w-full h-20 px-3 py-2 border border-neutral-200 rounded-xl resize-none text-sm focus:outline-none focus:ring-2 focus:ring-[#FFD541] focus:border-transparent"
          />

          {/* Buttons */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 py-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-semibold text-sm rounded-xl transition-colors"
            >
              다음에 쓸게요
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1 py-3 bg-[#FFD541] hover:bg-[#FFCA00] disabled:bg-[#FFE88A] text-neutral-900 font-semibold text-sm rounded-xl transition-colors"
            >
              {isSubmitting ? '제출 중...' : '제출 할게요'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EnrollSlugContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAlreadyParticipated, setShowAlreadyParticipated] = useState(false);
  const [successData, setSuccessData] = useState<SuccessData | null>(null);

  const slug = params.slug as string;
  const orderId = searchParams.get('orderId');
  const redirect = searchParams.get('redirect');
  const urlError = searchParams.get('error');
  const storeName = searchParams.get('storeName');

  // Success params from redirect
  const successPoints = searchParams.get('points');
  const successStoreName = searchParams.get('successStoreName');
  const customerId = searchParams.get('customerId');

  useEffect(() => {
    // Check if redirected back with success data
    if (successPoints && customerId) {
      setSuccessData({
        points: parseInt(successPoints),
        storeName: successStoreName || storeName || '태그히어',
        customerId,
      });
      setIsLoading(false);
      return;
    }

    if (urlError === 'already_participated') {
      setShowAlreadyParticipated(true);
    } else if (urlError) {
      setError('로그인에 실패했습니다. 다시 시도해주세요.');
      setIsLoading(false);
      return;
    }

    const fetchStoreInfo = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

        // slug로 store 정보 조회
        const res = await fetch(`${apiUrl}/api/stores/by-slug/${slug}`);
        if (res.ok) {
          const data = await res.json();
          setStoreInfo(data);
        } else if (res.status === 404) {
          setError('존재하지 않는 매장입니다.');
        }
      } catch (e) {
        console.error('Failed to fetch store info:', e);
        setError('매장 정보를 불러오는데 실패했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchStoreInfo();
  }, [slug, urlError, successPoints, customerId, successStoreName, storeName]);

  const handleOpenGift = () => {
    if (!storeInfo) return;

    setIsOpening(true);

    setTimeout(() => {
      const params = new URLSearchParams();
      params.set('storeId', storeInfo.id);
      params.set('slug', slug); // slug도 전달하여 redirect 시 사용
      if (orderId) params.set('orderId', orderId);
      if (redirect) params.set('redirect', redirect);

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      window.location.href = `${apiUrl}/auth/kakao/start?${params.toString()}`;
    }, 500);
  };

  const handleCloseSuccessPopup = () => {
    setSuccessData(null);
    // Clear URL params
    const url = new URL(window.location.href);
    url.searchParams.delete('points');
    url.searchParams.delete('successStoreName');
    url.searchParams.delete('customerId');
    window.history.replaceState({}, '', url.toString());
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-100 font-pretendard flex justify-center">
        <div className="w-full max-w-md h-screen flex items-center justify-center bg-white">
          <div className="w-8 h-8 border-2 border-[#FFD541] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-100 font-pretendard flex justify-center">
        <div className="w-full max-w-md h-screen flex flex-col items-center justify-center bg-white p-6">
          <div className="text-5xl mb-4">😢</div>
          <h1 className="text-lg font-semibold text-neutral-900 mb-2">오류가 발생했습니다</h1>
          <p className="text-neutral-500 text-sm mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 bg-[#FFD541] text-neutral-900 font-semibold rounded-xl text-sm"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  const maxPoints = storeInfo?.fixedPointEnabled ? storeInfo.fixedPointAmount : 100;

  return (
    <div className="min-h-screen bg-neutral-100 font-pretendard flex justify-center">
      <div className="w-full max-w-md h-screen flex flex-col bg-white overflow-hidden">
        {/* Main Content - 중앙 정렬 */}
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          {/* Title */}
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold text-neutral-900 mb-0.5">
              포인트 최대
            </h1>
            <p className="text-xl font-bold">
              <span className="text-blue-500">{formatNumber(maxPoints)}원</span>
              <span className="text-neutral-900"> 받아 가세요</span>
            </p>
          </div>

          {/* Gift Box Image */}
          <div className="mb-6">
            <GiftBoxImage onClick={handleOpenGift} isOpening={isOpening} />
          </div>

          {/* Steps - 컴팩트하게 */}
          <div className="w-full max-w-xs">
            {/* Step 1 */}
            <div className="flex items-center gap-3 mb-2">
              <div className="w-7 h-7 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-400 text-xs font-medium shrink-0">
                1
              </div>
              <p className="text-neutral-600 text-sm">선물 상자를 클릭하면</p>
            </div>

            {/* Step 2 */}
            <div className="flex items-center gap-3 mb-2">
              <div className="w-7 h-7 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-400 text-xs font-medium shrink-0">
                2
              </div>
              <p className="text-neutral-600 text-sm">카카오 로그인 후</p>
            </div>

            {/* Step 3 */}
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-400 text-xs font-medium shrink-0">
                3
              </div>
              <p className="text-sm">
                <span className="text-blue-500 font-medium">포인트</span>
                <span className="text-neutral-600">가 들어있는 상자를 받아요 🎉</span>
              </p>
            </div>
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="px-6 pb-6 pt-4">
          <button
            onClick={handleOpenGift}
            disabled={isOpening}
            className="w-full py-3.5 bg-[#FFD541] hover:bg-[#FFCA00] disabled:bg-[#FFE88A] text-neutral-900 font-semibold text-base rounded-[10px] transition-colors"
          >
            {isOpening ? '상자 여는 중...' : '선물 상자 열기'}
          </button>
        </div>
      </div>

      {/* Already Participated Popup */}
      {showAlreadyParticipated && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-2xl p-6 w-full max-w-xs text-center shadow-xl">
            <div className="text-4xl mb-4">🎁</div>
            <h2 className="text-lg font-bold text-neutral-900 mb-2">
              참여는 하루 한 번만 가능해요
            </h2>
            <p className="text-sm text-neutral-500 mb-5">
              내일 다시 방문해주세요!
            </p>
            <button
              onClick={() => setShowAlreadyParticipated(false)}
              className="w-full py-3 bg-[#FFD541] hover:bg-[#FFCA00] text-neutral-900 font-semibold text-base rounded-xl transition-colors"
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* Success Popup with Feedback */}
      {successData && (
        <SuccessPopup
          successData={successData}
          onClose={handleCloseSuccessPopup}
        />
      )}

      <style jsx global>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-jp.min.css');

        .font-pretendard {
          font-family: 'Pretendard JP Variable', 'Pretendard JP', -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif;
        }
      `}</style>
    </div>
  );
}

export default function EnrollSlugPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-neutral-100 flex justify-center">
        <div className="w-full max-w-md h-screen flex items-center justify-center bg-white">
          <div className="w-8 h-8 border-2 border-[#FFD541] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    }>
      <EnrollSlugContent />
    </Suspense>
  );
}
