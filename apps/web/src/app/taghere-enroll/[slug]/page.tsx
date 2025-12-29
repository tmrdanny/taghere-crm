'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Image from 'next/image';
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

function TaghereEnrollContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const [orderInfo, setOrderInfo] = useState<OrderInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAlreadyParticipated, setShowAlreadyParticipated] = useState(false);

  const slug = params.slug as string;
  const ordersheetId = searchParams.get('ordersheetId');
  const urlError = searchParams.get('error');

  useEffect(() => {
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
  }, [slug, ordersheetId, urlError]);

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

  return (
    <div className="min-h-screen bg-neutral-100 font-pretendard flex justify-center">
      <div className="w-full max-w-md h-screen flex flex-col bg-white overflow-hidden">
        {/* Main Content - 중앙 정렬 */}
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          {/* Title */}
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold text-neutral-900 mb-0.5">
              포인트
            </h1>
            <p className="text-xl font-bold">
              <span className="text-blue-500">{formatNumber(orderInfo?.earnPoints || 0)}원</span>
              <span className="text-neutral-900"> 받아 가세요</span>
            </p>
            {orderInfo && orderInfo.resultPrice > 0 && (
              <p className="text-sm text-neutral-500 mt-2">
                결제금액 {formatNumber(orderInfo.resultPrice)}원 × {orderInfo.ratePercent}% 적립
              </p>
            )}
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
                <span className="text-blue-500 font-medium">결제 금액 {orderInfo?.ratePercent || 5}%</span>
                <span className="text-neutral-600"> 포인트가 적립돼요 🎉</span>
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
      <div className="min-h-screen bg-neutral-100 flex justify-center">
        <div className="w-full max-w-md h-screen flex items-center justify-center bg-white">
          <div className="w-8 h-8 border-2 border-[#FFD541] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    }>
      <TaghereEnrollContent />
    </Suspense>
  );
}
