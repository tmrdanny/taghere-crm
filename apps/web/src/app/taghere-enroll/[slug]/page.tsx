'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { formatNumber } from '@/lib/utils';

interface OrderInfo {
  storeId: string;
  storeName: string;
  ordersheetId: string;
  resultPrice: number;
  ratePercent: number;
  earnPoints: number;
  alreadyEarned: boolean;
}

interface SuccessData {
  points: number;
  storeName: string;
  customerId: string;
  resultPrice: number;
}

function StarRating({ rating, onRatingChange }: { rating: number; onRatingChange: (rating: number) => void }) {
  return (
    <div className="flex gap-3 justify-center">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onRatingChange(star)}
          className="cursor-pointer hover:scale-110 transition-transform"
        >
          <svg
            className={`w-10 h-10 ${star <= rating ? 'fill-[#FFD541] text-[#FFD541]' : 'fill-none text-neutral-300'}`}
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

function CoinImage({ onClick, isOpening }: { onClick: () => void; isOpening: boolean }) {
  return (
    <div
      className={`coin-image-wrapper ${isOpening ? 'opening' : ''}`}
      onClick={!isOpening ? onClick : undefined}
    >
      <img
        src="/pointcoin-3d-white.webp"
        alt="포인트 코인"
        className="coin-image"
      />

      <style jsx>{`
        .coin-image-wrapper {
          cursor: pointer;
          animation: gentleFloat 3s ease-in-out infinite;
        }

        .coin-image-wrapper:hover {
          animation: gentleFloat 2s ease-in-out infinite;
        }

        .coin-image-wrapper.opening {
          animation: boxOpen 0.6s ease-out forwards;
        }

        .coin-image {
          width: 240px;
          height: 240px;
          object-fit: contain;
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
      // 제출 완료 후 팝업 없이 바로 order-success로 이동
      onClose();
    } catch (error) {
      console.error('Feedback submission error:', error);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-[30px]">
      <div className="bg-white rounded-2xl w-full max-w-[315px] shadow-xl overflow-hidden">
        {/* Points Display */}
        <div className="pt-8 pb-2 text-center">
          <p className="text-[32px] font-bold text-[#61EB49]">
            +{formatNumber(successData.points)}P
          </p>
        </div>

        {/* Feedback Form */}
        <div className="px-5 pb-6">
          <h2 className="text-lg font-bold text-neutral-900 text-center mb-1">
            주머니에 쏙 넣어드렸어요!
          </h2>
          <p className="text-sm text-neutral-400 text-center mb-6">
            소중한 의견은 큰 도움이 돼요
          </p>

          {/* Star Rating */}
          <div className="mb-4">
            <StarRating rating={feedbackRating} onRatingChange={setFeedbackRating} />
          </div>

          {/* Feedback Text */}
          <textarea
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder="의견을 남겨주세요 (선택)"
            className="w-full h-[100px] px-4 py-3 bg-neutral-100 border-0 rounded-xl resize-none text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#FFD541]"
          />

          {/* Buttons */}
          <div className="flex gap-2.5 mt-5">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 py-3.5 bg-neutral-200 hover:bg-neutral-300 text-neutral-600 font-semibold text-sm rounded-xl transition-colors"
            >
              다음에 쓸게요
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1 py-3.5 bg-[#FFD541] hover:bg-[#FFCA00] disabled:bg-[#FFE88A] text-neutral-900 font-semibold text-sm rounded-xl transition-colors"
            >
              {isSubmitting ? '제출 중...' : '제출 할게요'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TaghereEnrollContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const [orderInfo, setOrderInfo] = useState<OrderInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAlreadyParticipated, setShowAlreadyParticipated] = useState(false);
  const [successData, setSuccessData] = useState<SuccessData | null>(null);
  const [isAgreed, setIsAgreed] = useState(false);
  const [showAgreementWarning, setShowAgreementWarning] = useState(false);

  const slug = params.slug as string;
  const ordersheetId = searchParams.get('ordersheetId');
  const urlError = searchParams.get('error');

  // Success params from redirect
  const successPoints = searchParams.get('points');
  const successStoreName = searchParams.get('successStoreName');
  const customerId = searchParams.get('customerId');
  const successResultPrice = searchParams.get('resultPrice');

  useEffect(() => {
    // Check if redirected back with success data
    if (successPoints && customerId) {
      setSuccessData({
        points: parseInt(successPoints),
        storeName: successStoreName || '태그히어',
        customerId,
        resultPrice: parseInt(successResultPrice || '0'),
      });
      setIsLoading(false);
      return;
    }

    if (urlError === 'already_participated') {
      setShowAlreadyParticipated(true);
      setIsLoading(false);
      return;
    } else if (urlError) {
      setError('로그인에 실패했습니다. 다시 시도해주세요.');
      setIsLoading(false);
      return;
    }

    if (!ordersheetId) {
      setError('주문 정보가 없습니다.');
      setIsLoading(false);
      return;
    }

    const fetchOrderInfo = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

        // TagHere API로 주문 정보 조회
        const res = await fetch(`${apiUrl}/api/taghere/ordersheet?ordersheetId=${ordersheetId}&slug=${slug}`);
        if (res.ok) {
          const data = await res.json();

          if (data.alreadyEarned) {
            setShowAlreadyParticipated(true);
          } else {
            setOrderInfo(data);
          }
        } else if (res.status === 404) {
          setError('존재하지 않는 매장입니다.');
        } else {
          const errorData = await res.json();
          setError(errorData.error || '주문 정보를 불러오는데 실패했습니다.');
        }
      } catch (e) {
        console.error('Failed to fetch order info:', e);
        setError('주문 정보를 불러오는데 실패했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrderInfo();
  }, [slug, ordersheetId, urlError, successPoints, customerId, successStoreName, successResultPrice]);

  const handleOpenGift = () => {
    if (!orderInfo) return;

    setIsOpening(true);

    setTimeout(() => {
      const params = new URLSearchParams();
      params.set('storeId', orderInfo.storeId);
      params.set('slug', slug);
      if (ordersheetId) params.set('ordersheetId', ordersheetId);

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      window.location.href = `${apiUrl}/auth/kakao/taghere-start?${params.toString()}`;
    }, 500);
  };

  const handleCloseSuccessPopup = () => {
    setSuccessData(null);

    // order-success 페이지로 리다이렉트
    const url = new URL(window.location.origin + '/taghere-enroll/order-success');
    if (ordersheetId) url.searchParams.set('ordersheetId', ordersheetId);
    url.searchParams.set('slug', slug);
    window.location.href = url.toString();
  };

  if (isLoading) {
    return (
      <div className="h-[100dvh] bg-neutral-100 font-pretendard flex justify-center overflow-hidden">
        <div className="w-full max-w-md h-full flex items-center justify-center bg-white">
          <div className="w-8 h-8 border-2 border-[#FFD541] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-[100dvh] bg-neutral-100 font-pretendard flex justify-center overflow-hidden">
        <div className="w-full max-w-md h-full flex flex-col items-center justify-center bg-white p-6">
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

  return (
    <div className="h-[100dvh] bg-neutral-100 font-pretendard flex justify-center overflow-hidden">
      <div className="w-full max-w-[430px] h-full flex flex-col bg-white relative">
        {/* Title - 상단 영역 (flex: 1) */}
        <div className="flex-1 flex flex-col justify-end pb-4">
          <div className="text-center">
            <p className="text-[26px] font-bold text-[#1d2022] leading-[130%] tracking-[-0.6px]">
              방금 전 주문으로 적립된
              <br />
              <span className="text-[#61EB49]">{formatNumber(orderInfo?.earnPoints || 0)}P</span>
              <span> 받아가세요</span>
            </p>
            {orderInfo && orderInfo.resultPrice > 0 && (
              <p className="text-[14px] font-medium text-[#b1b5b8] leading-[130%] mt-2">
                주문 금액 {formatNumber(orderInfo.resultPrice)}원 x {orderInfo.ratePercent}% 적립
              </p>
            )}
          </div>
        </div>

        {/* Coin Image - 중앙 영역 (flex: 2) */}
        <div className="flex-[2] flex items-center justify-center">
          <CoinImage onClick={() => {
            if (!isAgreed) {
              setShowAgreementWarning(true);
              return;
            }
            handleOpenGift();
          }} isOpening={isOpening} />
        </div>

        {/* Info Text Box - 코인 아래
        <div className="px-5">
          <div className="rounded-[12px] bg-[#f8f9fa] p-3 text-center">
            <p className="text-[15px] font-medium text-[#55595e] leading-[130%]">
              카카오 로그인하면 <span className="text-[#61EB49]">포인트</span>를 받을 수 있어요
            </p>
          </div>
        </div> */}

        {/* 하단 고정 영역 - 체크박스 + CTA */}
        <div className="flex-[1.2] flex flex-col justify-end px-5 pb-8">
          {/* 동의 체크박스 */}
          <div className={`flex items-center justify-between px-3 py-3 border rounded-[10px] mb-4 transition-colors ${
            showAgreementWarning && !isAgreed ? 'border-red-400 bg-red-50' : 'border-[#e5e5e5]'
          }`}>
            <button
              type="button"
              onClick={() => {
                setIsAgreed(!isAgreed);
                setShowAgreementWarning(false);
              }}
              className="flex items-center gap-2.5 flex-1"
            >
              <div className={`w-[20px] h-[20px] border-2 rounded flex items-center justify-center transition-colors flex-shrink-0 ${
                isAgreed ? 'bg-[#FFD541] border-[#FFD541]' : showAgreementWarning ? 'border-red-400 bg-white' : 'border-[#d1d5db] bg-white'
              }`}>
                {isAgreed && (
                  <svg className="w-3 h-3 text-[#1d2022]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <span className={`text-[12px] text-left ${showAgreementWarning && !isAgreed ? 'text-red-500' : 'text-[#1d2022]'}`}>[필수] 포인트 적립 알림 및 매장 혜택 수신 동의</span>
            </button>
            <button
              type="button"
              onClick={() => window.open('https://tmr-founders.notion.site/2de2217234e3807bbfa0db51b12a5e77?source=copy_link', '_blank')}
              className="p-1 text-[#9ca3af] hover:text-[#6b7280] transition-colors flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <button
            onClick={() => {
              if (!isAgreed) {
                setShowAgreementWarning(true);
                return;
              }
              handleOpenGift();
            }}
            disabled={isOpening}
            className="w-full py-4 font-semibold text-base rounded-[10px] transition-colors bg-[#FFD541] hover:bg-[#FFCA00] text-[#1d2022]"
          >
            {isOpening ? '적립 중...' : '포인트 적립하기'}
          </button>
        </div>
      </div>

      {/* Already Participated Popup */}
      {showAlreadyParticipated && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-2xl p-6 w-full max-w-xs text-center shadow-xl">
            <div className="text-4xl mb-4">🎁</div>
            <h2 className="text-lg font-bold text-neutral-900 mb-2">
              이미 적립이 완료되었어요
            </h2>
            <p className="text-sm text-neutral-500 mb-5">
              이 주문에 대한 포인트가 이미 적립되었습니다.
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

export default function TaghereEnrollPage() {
  return (
    <Suspense fallback={
      <div className="h-[100dvh] bg-neutral-100 flex justify-center overflow-hidden">
        <div className="w-full max-w-md h-full flex items-center justify-center bg-white">
          <div className="w-8 h-8 border-2 border-[#FFD541] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    }>
      <TaghereEnrollContent />
    </Suspense>
  );
}
