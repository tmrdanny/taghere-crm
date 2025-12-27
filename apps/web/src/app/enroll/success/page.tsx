'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { formatNumber } from '@/lib/utils';

function StarRating({ rating, onRatingChange }: { rating: number; onRatingChange: (rating: number) => void }) {
  return (
    <div className="flex gap-2">
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

function PointsReveal({ points }: { points: number }) {
  const [displayPoints, setDisplayPoints] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);

  useEffect(() => {
    const duration = 1000;
    const steps = 20;
    const stepValue = points / steps;
    let current = 0;

    const timer = setTimeout(() => {
      setIsRevealed(true);
      const interval = setInterval(() => {
        current += stepValue;
        if (current >= points) {
          setDisplayPoints(points);
          clearInterval(interval);
        } else {
          setDisplayPoints(Math.floor(current));
        }
      }, duration / steps);

      return () => clearInterval(interval);
    }, 200);

    return () => clearTimeout(timer);
  }, [points]);

  return (
    <div className={`transition-all duration-500 ${isRevealed ? 'scale-100 opacity-100' : 'scale-90 opacity-0'}`}>
      <p className="text-3xl font-extrabold text-[#FFD541]">
        +{formatNumber(displayPoints)} P
      </p>
    </div>
  );
}

function EnrollSuccessContent() {
  const searchParams = useSearchParams();
  const points = parseInt(searchParams.get('points') || '100');
  const storeName = searchParams.get('storeName') || '태그히어';
  const customerId = searchParams.get('customerId') || '';

  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  const handleSubmitFeedback = async () => {
    if (!customerId || (!feedbackRating && !feedbackText.trim())) return;

    setFeedbackLoading(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/customers/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerId,
          feedbackRating: feedbackRating || null,
          feedbackText: feedbackText.trim() || null,
        }),
      });

      if (response.ok) {
        setFeedbackSubmitted(true);
      }
    } catch (error) {
      console.error('Feedback submission error:', error);
    } finally {
      setFeedbackLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100 font-pretendard flex justify-center">
      <div className="w-full max-w-md h-screen flex flex-col bg-white overflow-hidden">
        {/* Main Content - 중앙 정렬 */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 overflow-y-auto">
          {/* Title */}
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold text-neutral-900 mb-0.5">
              포인트가 적립 되었어요.
            </h1>
            <p className="text-xl font-bold">
              <span className="text-blue-500">{storeName}</span>
            </p>
          </div>

          {/* Points Display */}
          <div className="mb-6">
            <PointsReveal points={points} />
          </div>

          {/* Info Steps - 컴팩트하게 */}
          <div className="w-full max-w-xs mb-6">
            {/* Step 1 */}
            <div className="flex items-center gap-3 mb-2">
              <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center text-green-500 text-xs font-medium shrink-0">
                ✓
              </div>
              <p className="text-neutral-600 text-sm">포인트가 적립되었습니다</p>
            </div>

            {/* Step 2 */}
            <div className="flex items-center gap-3 mb-2">
              <div className="w-7 h-7 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-400 text-xs shrink-0">
                💡
              </div>
              <p className="text-sm">
                <span className="text-neutral-600">다음 방문 시 </span>
                <span className="text-blue-500 font-medium">포인트 사용</span>
                <span className="text-neutral-600"> 가능</span>
              </p>
            </div>

            {/* Step 3 - 알림톡 안내 */}
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-500 text-xs shrink-0">
                💬
              </div>
              <p className="text-neutral-600 text-sm">알림톡으로 포인트 내역을 확인하세요</p>
            </div>
          </div>

          {/* Feedback Section */}
          {customerId && !feedbackSubmitted && (
            <div className="w-full max-w-xs bg-neutral-50 rounded-xl p-4">
              <p className="text-center text-neutral-700 font-medium text-sm mb-4">
                매장 경험을 남겨주시면 큰 도움이 돼요.
              </p>

              {/* Star Rating */}
              <div className="flex justify-center mb-3">
                <StarRating rating={feedbackRating} onRatingChange={setFeedbackRating} />
              </div>

              {/* Feedback Text */}
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="의견을 남겨주세요 (선택)"
                className="w-full h-16 px-3 py-2 border border-neutral-200 rounded-lg resize-none text-sm focus:outline-none focus:ring-2 focus:ring-[#FFD541] focus:border-transparent"
              />

              {/* Submit Button */}
              <button
                onClick={handleSubmitFeedback}
                disabled={feedbackLoading || (!feedbackRating && !feedbackText.trim())}
                className="w-full mt-3 py-3.5 bg-[#FFD541] hover:bg-[#FFCA00] disabled:bg-[#FFE88A] disabled:cursor-not-allowed text-neutral-900 font-semibold text-base rounded-2xl transition-colors"
              >
                {feedbackLoading ? '저장 중...' : '피드백 남기기'}
              </button>
            </div>
          )}

          {/* Feedback Submitted */}
          {feedbackSubmitted && (
            <div className="w-full max-w-xs bg-green-50 rounded-xl p-4 text-center">
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-2">
                <span className="text-green-500 text-sm">✓</span>
              </div>
              <p className="text-green-700 font-medium text-sm">피드백을 남겨주셔서 감사합니다!</p>
            </div>
          )}
        </div>

        {/* Bottom Info */}
        <div className="px-6 pb-6 pt-4 text-center">
          <p className="text-xs text-neutral-400">
            포인트 문의: 매장 직원에게 확인해주세요
          </p>
        </div>
      </div>

      <style jsx global>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-jp.min.css');

        .font-pretendard {
          font-family: 'Pretendard JP Variable', 'Pretendard JP', -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif;
        }
      `}</style>
    </div>
  );
}

export default function EnrollSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-neutral-100 flex justify-center">
        <div className="w-full max-w-md h-screen flex items-center justify-center bg-white">
          <div className="w-8 h-8 border-2 border-[#FFD541] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    }>
      <EnrollSuccessContent />
    </Suspense>
  );
}
