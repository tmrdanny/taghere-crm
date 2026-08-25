'use client';

import { API_BASE } from '@/lib/api-config';
import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { trackEvent } from '@/lib/analytics';
import { InlineBannerCarousel, BottomModal, type Banner } from '@/features/enroll/banners';

interface OrderDetails {
  storeName: string;
  orderNumber?: string;
  items: { name: string; quantity: number }[];
  totalPrice: number;
  menuLink?: string;
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
  const [showBottomModal, setShowBottomModal] = useState(false);
  const [banners, setBanners] = useState<Banner[]>([]);

  const rawOrderId = searchParams.get('ordersheetId') || searchParams.get('orderId');
  const ordersheetId = rawOrderId && /^\{.+\}$/.test(rawOrderId) ? null : rawOrderId;
  const slug = searchParams.get('slug') || 'taghere-test';
  const type = searchParams.get('type'); // 'stamp', 'membership', or null
  const isStamp = type === 'stamp';
  const isMembership = type === 'membership';
  const hasOrder = Boolean(ordersheetId); // 텍스트 결정용: ordersheetId 유무로 판단

  // 모든 매장에서 바텀 모달 표시
  const shouldShowModal = true;

  // ordersheetId/orderId 유효성 확인 (V1: 24자 hex MongoDB ObjectId, V2: OR로 시작하는 ID)
  const isValidOrdersheetId = ordersheetId && (/^[a-f0-9]{24}$/i.test(ordersheetId) || /^OR/.test(ordersheetId));

  useEffect(() => {
    // 스탬프/멤버십 타입이면 ordersheetId 없어도 기본 UI 표시
    if ((isStamp || isMembership) && !ordersheetId) {
      setOrderDetails({
        storeName: '',
        orderNumber: undefined,
        items: [],
        totalPrice: 0,
      });
      setIsLoading(false);
      return;
    }

    // ordersheetId가 없으면 에러 (포인트 타입)
    if (!ordersheetId) {
      setError('주문 정보가 없습니다.');
      setIsLoading(false);
      return;
    }

    // ordersheetId가 유효하지 않으면 기본 UI 표시 (주문번호 없이)
    if (!isValidOrdersheetId) {
      setOrderDetails({
        storeName: '',
        orderNumber: undefined,
        items: [],
        totalPrice: 0,
      });
      setIsLoading(false);
      return;
    }

    const fetchOrderDetails = async () => {
      try {
        // ordersheetId로 주문 정보 조회
        const res = await fetch(`${API_BASE}/api/taghere/ordersheet?ordersheetId=${ordersheetId}&slug=${slug}`);

        if (res.ok) {
          const data = await res.json();
          // ordersheet API 응답을 order-details 형식으로 변환
          setOrderDetails({
            storeName: data.storeName || '',
            orderNumber: data.orderNumber || undefined,
            items: (data.orderItems || []).map((item: any) => ({
              name: item.name || item.menuName || item.label || '상품',
              quantity: item.quantity || item.count || 1,
            })),
            totalPrice: data.resultPrice || 0,
            menuLink: data.menuLink || undefined,
          });
        } else {
          // API 호출 실패해도 기본 UI 표시
          console.error('Failed to fetch order details, showing default UI');
          setOrderDetails({
            storeName: '',
            orderNumber: undefined,
            items: [],
            totalPrice: 0,
          });
        }
      } catch (e) {
        console.error('Failed to fetch order details:', e);
        // 에러 발생해도 기본 UI 표시
        setOrderDetails({
          storeName: '',
          orderNumber: undefined,
          items: [],
          totalPrice: 0,
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrderDetails();
  }, [ordersheetId, isValidOrdersheetId, slug]);

  // 배너 로드 (모든 매장)
  useEffect(() => {
    const fetchBanners = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/admin/banners/active?slug=${slug}`);
        if (res.ok) {
          const data = await res.json();
          setBanners(data);
        }
      } catch (e) {
        console.error('Failed to fetch banners:', e);
      }
    };

    fetchBanners();
  }, [slug]);

  // 바텀 모달 표시 (taghere-test만)
  useEffect(() => {
    if (shouldShowModal) {
      setShowBottomModal(true);
    }
  }, [shouldShowModal]);

  const handleGoBack = () => {
    trackEvent('completion_cta_click', { store_slug: slug, flow_type: type || 'points', has_menu_link: !!orderDetails?.menuLink });
    // menuLink가 있으면 해당 링크로, 없으면 뒤로가기
    if (orderDetails?.menuLink) {
      window.location.href = orderDetails.menuLink;
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
          <span className="text-lg font-bold text-[#1d2022]">
            {hasOrder ? '주문정보' : isMembership ? '멤버십 등록' : '스탬프 적립'}
          </span>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto px-5 pt-6 pb-24">
          {/* Success Icon & Message */}
          <div className="flex flex-col items-center mb-6">
            <CheckIcon />
            <h1 className="text-xl font-bold text-[#1d2022] mt-4 tracking-tight">
              {hasOrder ? '주문이 완료되었어요' : isMembership ? '멤버십 등록이 완료되었어요' : '스탬프가 적립되었어요'}
            </h1>
          </div>

          {/* Order Number Card - 주문번호가 있을 때만 표시 */}
          {orderDetails.orderNumber && (
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
          )}

          {/* Order Details Card */}
          <div className="rounded-[10px] border border-[#ebeced] overflow-hidden">
            {/* Store Info - storeName이 있을 때 표시 */}
            {orderDetails.storeName && (
              <div className="px-5 py-4 border-b border-[#ebeced]">
                <span className="text-sm font-semibold text-[#1d2022]">{orderDetails.storeName}</span>
              </div>
            )}

            {/* Order Items - 항상 표시 */}
            <div className="px-5 py-4 border-b border-[#ebeced]">
              {orderDetails.items.length > 0 ? (
                orderDetails.items.map((item, index) => (
                  <div key={index} className="text-sm font-medium text-[#55595e] leading-[1.3] mb-1.5 last:mb-0">
                    {item.name} {item.quantity}개
                  </div>
                ))
              ) : (
                <div className="text-sm font-medium text-[#55595e]">-</div>
              )}
            </div>

            {/* Total Price - 항상 표시 */}
            <div className="px-5 py-4 flex items-center justify-between">
              <span className="text-base font-semibold text-[#1d2022]">총 주문금액</span>
              <span className="text-base font-semibold text-[#1d2022]">
                {orderDetails.totalPrice > 0 ? `${formatNumber(orderDetails.totalPrice)}원` : '-'}
              </span>
            </div>

          </div>

          {/* 배너 캐러셀 */}
          <InlineBannerCarousel banners={banners} />
        </div>

        {/* Bottom CTA - Fixed */}
        <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-[#d1d3d6] px-5 pt-4 pb-[max(30px,env(safe-area-inset-bottom))]">
          <button
            onClick={handleGoBack}
            className="w-full py-4 bg-[#FFD541] text-[#1d2022] font-semibold text-base rounded-[10px]"
          >
            메뉴판 돌아가기
          </button>
        </div>
      </div>

      <style jsx global>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-jp.min.css');

        .font-pretendard {
          font-family: 'Pretendard JP Variable', 'Pretendard JP', -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif;
        }
      `}</style>

      {/* 바텀 모달 */}
      <BottomModal
        isOpen={showBottomModal}
        onClose={() => setShowBottomModal(false)}
        banners={banners}
        title={hasOrder ? '주문이 완료되었어요' : isMembership ? '멤버십 등록이 완료되었어요' : '스탬프가 적립되었어요'}
        subtitle="매장을 이용해주셔서 감사합니다"
      />
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
