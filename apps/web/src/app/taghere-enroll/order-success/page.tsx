'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

interface OrderDetails {
  storeName: string;
  storeLogoUrl?: string;
  orderNumber: string;
  items: { name: string; quantity: number }[];
  totalPrice: number;
}

function CheckIcon() {
  return (
    <div className="w-12 h-12 rounded-full bg-[#61EB49] flex items-center justify-center">
      <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </div>
  );
}

function formatNumber(num: number): string {
  return num.toLocaleString('ko-KR');
}

function OrderSuccessContent() {
  const searchParams = useSearchParams();
  const [orderDetails, setOrderDetails] = useState<OrderDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const storeId = searchParams.get('storeId');
  const ordersheetId = searchParams.get('ordersheetId');

  useEffect(() => {
    if (!storeId || !ordersheetId) {
      setError('주문 정보가 없습니다.');
      setIsLoading(false);
      return;
    }

    const fetchOrderDetails = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
        const res = await fetch(`${apiUrl}/api/taghere/order-details?storeId=${storeId}&ordersheetId=${ordersheetId}`);

        if (res.ok) {
          const data = await res.json();
          setOrderDetails(data);
        } else {
          const errorData = await res.json();
          setError(errorData.error || '주문 정보를 불러오는데 실패했습니다.');
        }
      } catch (e) {
        console.error('Failed to fetch order details:', e);
        setError('주문 정보를 불러오는데 실패했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrderDetails();
  }, [storeId, ordersheetId]);

  const handleGoBack = () => {
    // 태그히어 모바일오더 메뉴 페이지로 돌아가기
    if (storeId) {
      window.location.href = `https://order.taghere.com/store/${storeId}`;
    } else {
      window.history.back();
    }
  };

  if (isLoading) {
    return (
      <div className="h-[100dvh] bg-white font-pretendard flex justify-center overflow-hidden">
        <div className="w-full max-w-md h-full flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#FFD541] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !orderDetails) {
    return (
      <div className="h-[100dvh] bg-white font-pretendard flex justify-center overflow-hidden">
        <div className="w-full max-w-md h-full flex flex-col items-center justify-center p-6">
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
    <div className="h-[100dvh] bg-white font-pretendard flex justify-center overflow-hidden">
      <div className="w-full max-w-md h-full flex flex-col relative">
        {/* Header */}
        <div className="flex-shrink-0 h-[54px] border-b border-[#ebeced] flex items-center justify-center">
          <span className="text-lg font-bold text-[#1d2022]">주문정보</span>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto px-5 pt-6 pb-24">
          {/* Success Icon & Message */}
          <div className="flex flex-col items-center mb-6">
            <CheckIcon />
            <h1 className="text-xl font-bold text-[#1d2022] mt-4 tracking-tight">
              주문이 접수되었습니다
            </h1>
          </div>

          {/* Order Number Card */}
          <div
            className="rounded-[10px] p-4 mb-4 flex items-center justify-between"
            style={{
              boxShadow: '0px 5px 10px rgba(18, 27, 76, 0.08)',
              background: '#fff padding-box, linear-gradient(-86.27deg, #141dd5, #aa00ff) border-box',
              border: '1px solid transparent',
            }}
          >
            <span className="text-base font-semibold text-[#55595e]">주문번호</span>
            <span
              className="text-[28px] font-bold tracking-tight"
              style={{
                background: 'linear-gradient(91.01deg, #129efc, #7d0fe3)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              {orderDetails.orderNumber}
            </span>
          </div>

          {/* Order Details Card */}
          <div className="rounded-[10px] border border-[#ebeced] overflow-hidden">
            {/* Store Info */}
            <div className="px-5 py-4 flex items-center gap-2.5 border-b border-[#ebeced]">
              {orderDetails.storeLogoUrl ? (
                <img
                  src={orderDetails.storeLogoUrl}
                  alt={orderDetails.storeName}
                  className="w-[30px] h-[30px] rounded-full object-cover"
                />
              ) : (
                <div className="w-[30px] h-[30px] rounded-full bg-neutral-200 flex items-center justify-center text-xs">
                  🏪
                </div>
              )}
              <span className="text-sm font-semibold text-[#1d2022]">{orderDetails.storeName}</span>
            </div>

            {/* Order Items */}
            <div className="px-5 py-4 border-b border-[#ebeced]">
              {orderDetails.items.map((item, index) => (
                <div key={index} className="text-sm font-medium text-[#55595e] leading-[1.3] mb-1.5 last:mb-0">
                  {item.name} {item.quantity}개
                </div>
              ))}
            </div>

            {/* Total Price */}
            <div className="px-5 py-4 flex items-center justify-between">
              <span className="text-base font-semibold text-[#1d2022]">총 주문금액</span>
              <span className="text-base font-semibold text-[#1d2022]">{formatNumber(orderDetails.totalPrice)}원</span>
            </div>

            {/* View Order History Button */}
            <div className="px-5 pb-5">
              <button
                className="w-full h-10 rounded-[10px] border border-[#d1d3d6] bg-white text-sm font-medium text-[#55595e]"
                onClick={() => {
                  if (storeId) {
                    window.location.href = `https://order.taghere.com/store/${storeId}/orders`;
                  }
                }}
              >
                주문내역 보기
              </button>
            </div>
          </div>
        </div>

        {/* Bottom CTA - Fixed */}
        <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-[#d1d3d6] px-5 pt-4 pb-[max(30px,env(safe-area-inset-bottom))]">
          <button
            onClick={handleGoBack}
            className="w-full py-4 bg-[#FFD541] text-[#1d2022] font-semibold text-base rounded-[10px]"
          >
            메뉴로 돌아가기
          </button>
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

export default function OrderSuccessPage() {
  return (
    <Suspense fallback={
      <div className="h-[100dvh] bg-white flex justify-center overflow-hidden">
        <div className="w-full max-w-md h-full flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#FFD541] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    }>
      <OrderSuccessContent />
    </Suspense>
  );
}
