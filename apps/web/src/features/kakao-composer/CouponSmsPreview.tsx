import { ChevronLeft, Users, Camera, ArrowUp } from 'lucide-react';
import { buildCouponSmsText } from './coupon-sms';

// 쿠폰 문자 미리보기 (폰 프레임 스크린 내부 콘텐츠).
// 리타겟 쿠폰은 알림톡 대신 광고 문자(LMS)로 나간다 — 실제 발송 문구와 같은 본문을 문자 말풍선으로 보여준다.
// (dashboard)/messages · franchise retarget · franchise acquisition 공용.
// 폰 프레임(베젤)은 각 페이지가 소유하고, 이 컴포넌트는 스크린 안쪽을 흰 배경으로 덮어 렌더링한다.
export function CouponSmsPreview({
  couponStoreName,
  couponContent,
  couponExpiryDate,
  showNaverLink = true,
  customBody,
}: {
  couponStoreName: string;
  couponContent: string;
  couponExpiryDate: string;
  /** 매장 네이버 플레이스 링크가 있을 때만 길찾기 줄이 붙는다 */
  showNaverLink?: boolean;
  /** 매장이 직접 쓴 문자 본문 (없으면 기본 문구) */
  customBody?: string | null;
}) {
  const text = buildCouponSmsText({ storeName: couponStoreName, couponContent, expiryDate: couponExpiryDate, withNaverLink: showNaverLink, customBody });
  return (
    <div className="absolute inset-0 flex flex-col bg-white" style={{ paddingTop: '13cqw' }}>
      {/* iOS 메시지 헤더 */}
      <div className="flex items-center justify-between px-4 pt-1 pb-2 border-b border-[#e5e5ea]">
        <ChevronLeft className="w-5 h-5 text-[#007aff]" />
        <div className="flex flex-col items-center gap-1">
          <div className="w-8 h-8 bg-[#9ca3af] rounded-full flex items-center justify-center text-white">
            <Users className="w-4 h-4" />
          </div>
          <span className="text-[11px] font-medium text-[#1e293b]">070-4138-0263</span>
        </div>
        <div className="w-5" />
      </div>

      <div className="flex justify-center my-3">
        <span className="text-[10px] bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded-full">문자 메시지 · 오늘 오후 12:30</span>
      </div>

      <div className="flex-1 min-h-0 px-3 overflow-y-auto">
        <div className="flex justify-start">
          <div className="bg-[#e5e5ea] text-[#1e293b] py-2.5 px-3 rounded-2xl rounded-bl-sm max-w-[88%] text-[12px] leading-[1.5] whitespace-pre-wrap break-all">
            {text}
          </div>
        </div>
      </div>

      <div className="py-2 px-3 bg-white border-t border-[#e5e5ea] flex items-center gap-2">
        <Camera className="w-5 h-5 text-[#c7c7cc]" />
        <div className="flex-1 h-8 border border-[#c7c7cc] rounded-full px-3 flex items-center text-[12px] text-[#c7c7cc]">문자 메시지</div>
        <div className="w-6 h-6 bg-[#007aff] rounded-full flex items-center justify-center text-white">
          <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
        </div>
      </div>
    </div>
  );
}
