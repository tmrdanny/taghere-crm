'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { formatNumber } from '@/lib/utils';

function SuccessContent() {
  const searchParams = useSearchParams();
  const points = parseInt(searchParams.get('points') || '0');
  const storeName = searchParams.get('storeName') || '태그히어';
  const resultPrice = parseInt(searchParams.get('resultPrice') || '0');

  return (
    <div className="min-h-screen bg-neutral-100 font-pretendard flex justify-center">
      <div className="w-full max-w-md h-screen flex flex-col bg-white overflow-hidden">
        {/* Main Content */}
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          {/* Title */}
          <h1 className="text-xl font-bold text-neutral-900 mb-2 text-center">
            포인트 적립이 완료되었어요!
          </h1>

          {/* Store Name */}
          <p className="text-blue-500 font-semibold text-lg mb-4">
            {storeName}
          </p>

          {/* Points Display */}
          <div className="px-8 py-5 mb-6">
            <p className="text-3xl font-extrabold text-[#131651] text-center">
              +{formatNumber(points)} P
            </p>
            {resultPrice > 0 && (
              <p className="text-sm text-neutral-500 text-center mt-1">
                결제금액 {formatNumber(resultPrice)}원 적립
              </p>
            )}
          </div>

          {/* Info */}
          <div className="w-full max-w-xs space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center text-lg shrink-0">
                💬
              </div>
              <p className="text-neutral-600 text-sm">
                알림톡으로 포인트 내역을 확인해주세요
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-lg shrink-0">
                💡
              </div>
              <p className="text-sm">
                <span className="text-neutral-600">다음 방문 시 </span>
                <span className="text-blue-500 font-medium">포인트 사용</span>
                <span className="text-neutral-600"> 가능해요</span>
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Info */}
        <div className="px-6 pb-8 pt-4 text-center">
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

export default function TaghereEnrollSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-neutral-100 flex justify-center">
        <div className="w-full max-w-md h-screen flex items-center justify-center bg-white">
          <div className="w-8 h-8 border-2 border-[#FFD541] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    }>
      <SuccessContent />
    </Suspense>
  );
}
