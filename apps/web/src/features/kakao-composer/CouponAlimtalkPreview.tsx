import { ChevronLeft } from 'lucide-react';

// 쿠폰 알림톡 카카오톡 미리보기 (폰 프레임 스크린 내부 콘텐츠).
// (dashboard)/messages · franchise retarget · franchise acquisition 공용.
// 폰 프레임(베젤/스크린 배경)은 각 페이지가 소유하고, 이 컴포넌트는 스크린 안쪽만 렌더링한다.
export function CouponAlimtalkPreview({
  couponStoreName,
  couponContent,
  couponExpiryDate,
}: {
  couponStoreName: string;
  couponContent: string;
  couponExpiryDate: string;
}) {
  return (
    <>
      {/* KakaoTalk header */}
      <div className="flex items-center justify-between px-4 pt-10 pb-2">
        <ChevronLeft className="w-4 h-4 text-neutral-700" />
        <span className="font-medium text-xs text-neutral-800">태그히어</span>
        <div className="w-4" />
      </div>

      {/* Date badge */}
      <div className="flex justify-center mb-3">
        <span className="text-[10px] bg-neutral-500/30 text-neutral-700 px-2 py-0.5 rounded-full">
          {new Date().toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </span>
      </div>

      {/* Message area */}
      <div className="flex-1 pl-2 pr-4 overflow-auto">
        <div className="flex gap-1.5">
          {/* Profile icon */}
          <div className="flex-shrink-0">
            <div className="w-7 h-7 rounded-full bg-neutral-300" />
          </div>

          {/* Message content */}
          <div className="flex-1 min-w-0 mr-4">
            <p className="text-[10px] text-neutral-600 mb-0.5">태그히어</p>

            {/* Coupon Alimtalk bubble */}
            <div className="relative">
              {/* Kakao badge */}
              <div className="absolute -top-1 -right-1 z-10">
                <span className="bg-neutral-700 text-white text-[8px] px-1 py-0.5 rounded-full font-medium">
                  kakao
                </span>
              </div>

              {/* 알림톡 도착 배너 */}
              <div className="bg-[#FEE500] rounded-t-md px-2 py-1.5">
                <span className="text-xs font-medium text-neutral-800">알림톡 도착</span>
              </div>

              <div className="bg-white rounded-b-md shadow-sm overflow-hidden">
                {/* 쿠폰 이미지 */}
                <img
                  src="/images/coupon_kakao.png"
                  alt="쿠폰 이미지"
                  className="w-full h-auto"
                />

                {/* Message body */}
                <div className="px-4 py-4">
                  <p className="text-xs font-semibold text-neutral-800 mb-4">
                    태그히어 고객 대상 쿠폰
                  </p>
                  <div className="space-y-1 text-xs text-neutral-700">
                    <p>
                      <span className="text-[#6BA3FF]">{couponStoreName || '매장명'}</span>에서 쿠폰을 보냈어요!
                    </p>
                    <p className="text-neutral-500 mb-4">
                      태그히어 이용 고객에게만 제공되는 쿠폰이에요.
                    </p>
                    <div className="space-y-1 mb-4">
                      <p>📌 {couponContent || '쿠폰 내용을 입력해주세요'}</p>
                      <p>📌 {couponExpiryDate || '유효기간을 입력해주세요'}</p>
                    </div>
                    <p className="text-neutral-500">
                      결제 시 직원 확인을 통해 사용할 수 있어요.
                    </p>
                  </div>
                </div>

                {/* 버튼 */}
                <div className="px-4 pb-4 space-y-2">
                  <button className="w-full py-2.5 bg-white text-neutral-800 text-xs font-medium rounded border border-neutral-300">
                    네이버 길찾기
                  </button>
                  <button className="w-full py-2.5 bg-white text-neutral-800 text-xs font-medium rounded border border-neutral-300">
                    직원 확인
                  </button>
                </div>
              </div>
            </div>

            {/* Time */}
            <p className="text-[8px] text-neutral-500 mt-0.5 text-right">
              오후 12:30
            </p>
          </div>
        </div>
      </div>

      {/* Bottom safe area */}
      <div className="h-6" />
    </>
  );
}
