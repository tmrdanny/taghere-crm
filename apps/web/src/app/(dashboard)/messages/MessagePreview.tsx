import { ChevronLeft, Users, Camera, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { API_BASE } from '@/lib/api-config';
import { UploadedImage } from './types';

// 발송 메시지 미리보기 (우측 폰 프레임). SMS / 카카오 알림톡 탭에 따라 화면 전환.
// 읽기 전용 표시 컴포넌트 — 상태/핸들러는 부모에서 관리.
export function MessagePreview({
  activeTab,
  uploadedImage,
  messageContent,
  isAdMessage,
  couponStoreName,
  couponContent,
  couponExpiryDate,
}: {
  activeTab: 'sms' | 'kakao';
  uploadedImage: UploadedImage | null;
  messageContent: string;
  isAdMessage: boolean;
  couponStoreName: string;
  couponContent: string;
  couponExpiryDate: string;
}) {
  return (
    <div className="hidden lg:block flex-none w-[360px] self-start">
      <div className="bg-[#e2e8f0] rounded-3xl p-5">
        <p className="text-center text-[#64748b] mb-4">발송 메시지 미리보기</p>
        <div className="flex justify-center">
          {/* Phone Frame */}
          <div className="relative w-72 h-[580px] bg-neutral-800 rounded-[2.5rem] p-2 shadow-2xl">
            {/* Inner bezel */}
            <div className="w-full h-full bg-neutral-900 rounded-[2rem] p-1 overflow-hidden">
              {/* Screen */}
              <div className={cn(
                "w-full h-full rounded-[1.75rem] overflow-hidden flex flex-col relative",
                activeTab === 'sms' ? 'bg-white' : 'bg-[#B2C7D9]'
              )}>
                {/* Dynamic Island / Notch */}
                <div className="absolute top-2 left-1/2 -translate-x-1/2 w-16 h-5 bg-neutral-900 rounded-full z-10" />

                {/* SMS Preview */}
                {activeTab === 'sms' && (
                  <>
                    {/* iOS Header */}
                    <div className="flex items-center justify-between px-4 pt-10 pb-2 border-b border-[#e5e5ea]">
                      <ChevronLeft className="w-5 h-5 text-[#007aff]" />
                      <div className="flex flex-col items-center gap-1">
                        <div className="w-8 h-8 bg-[#9ca3af] rounded-full flex items-center justify-center text-white">
                          <Users className="w-4 h-4" />
                        </div>
                        <span className="text-[11px] font-medium text-[#1e293b]">태그히어 CRM</span>
                      </div>
                      <div className="w-5" />
                    </div>

                    {/* Date badge */}
                    <div className="flex justify-center my-3">
                      <span className="text-[10px] bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded-full">
                        오늘 오후 12:30
                      </span>
                    </div>

                    {/* Message Body */}
                    <div className="flex-1 px-3 overflow-y-auto">
                      <div className="flex justify-start">
                        <div className="bg-[#e5e5ea] text-[#1e293b] py-2.5 px-3 rounded-2xl rounded-bl-sm max-w-[85%] text-[12px] leading-[1.5]">
                          {/* 이미지 미리보기 */}
                          {uploadedImage && (
                            <div className="mb-2 -mx-1 -mt-1">
                              <img
                                src={`${API_BASE}${uploadedImage.imageUrl}`}
                                alt="첨부 이미지"
                                className="w-full max-w-[180px] rounded-lg"
                              />
                            </div>
                          )}
                          {messageContent ? (
                            <span className="whitespace-pre-wrap break-words">
                              {isAdMessage
                                ? `(광고)\n${messageContent.replace(/{고객명}/g, '{고객명}')}\n무료수신거부 080-500-4233`
                                : messageContent.replace(/{고객명}/g, '{고객명}')}
                            </span>
                          ) : (
                            <span className="text-[#94a3b8]">메시지 미리보기</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Input Bar */}
                    <div className="py-2 px-3 bg-white border-t border-[#e5e5ea] flex items-center gap-2">
                      <Camera className="w-5 h-5 text-[#c7c7cc]" />
                      <div className="flex-1 h-8 border border-[#c7c7cc] rounded-full px-3 flex items-center text-[12px] text-[#c7c7cc]">
                        iMessage
                      </div>
                      <div className="w-6 h-6 bg-[#007aff] rounded-full flex items-center justify-center text-white">
                        <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
                      </div>
                    </div>
                  </>
                )}

                {/* Kakao Preview - 쿠폰 알림톡 */}
                {activeTab === 'kakao' && (
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
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
