'use client';

import { ChevronLeft, Menu, Play, Search } from 'lucide-react';
import { API_BASE } from '@/lib/api-config';
import { IPhoneFrame } from '@/components/ui/iphone-frame';
import { cn } from '@/lib/utils';
import { BubbleType, PkButton, PkCommerce, PkContent, PkImage, STAFF_VERIFY_BUTTON, applySenderFooter, couponTitle } from './spec';

// 카카오톡 대화방 안의 브랜드 메시지 미리보기 — 실제 수신 화면과 카카오 비즈니스 가이드 목업 기준.
// (375pt 화면 기준 치수를 폰 프레임 화면 폭에 맞춰 약 0.8배로 줄였다)
//  공통: 로고 프로필 · 이름줄 “(광고) 채널명” · 흰 말풍선 · 버튼 아래 쿠폰 · 말풍선 아래 수신거부 안내
//  일반 폭(텍스트·이미지·커머스): 시간은 말풍선 오른쪽 아래 / 와이드·캐러셀: 수신거부 줄 다음 줄에 시간
const CHANNEL = '태그히어 플레이스';
const OPT_OUT = '무료수신거부 080-870-0263';
const NORMAL_W = 200;
const ink = 'text-[#191919]';
const gray = 'text-[#8a8a8a]';
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;
const num = (s: string) => Number(String(s ?? '').replace(/,/g, '')) || 0;

function Img({ image, ratio, placeholder, className }: { image: PkImage | null; ratio: string; placeholder: string; className?: string }) {
  return image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`${API_BASE}${image.url}`} alt="" className={cn('block w-full object-cover', className)} style={{ aspectRatio: ratio }} />
  ) : (
    <div className={cn('grid w-full place-items-center bg-[#dde2e7] text-[10px] text-[#8b939c]', className)} style={{ aspectRatio: ratio }}>
      {placeholder}
    </div>
  );
}

const Divider = () => <div className="h-px w-full bg-[#ededed]" />;

// 버튼 — 회색 바탕 #f0f0f0, 테두리 없음. 텍스트·이미지형은 세로로 쌓고, 나머지는 2개까지 나란히.
function Buttons({ buttons, horizontal, className }: { buttons: PkButton[]; horizontal?: boolean; className?: string }) {
  if (!buttons.length) return null;
  return (
    <div className={cn('grid gap-[5px]', horizontal && buttons.length === 2 && 'grid-cols-2', className)}>
      {buttons.map((b, i) => (
        <div key={i} className={cn('flex h-[30px] items-center justify-center truncate rounded-[6px] bg-[#f0f0f0] px-2 text-[11.5px]', ink)}>
          {b.name || '버튼'}
        </div>
      ))}
    </div>
  );
}

// 쿠폰 — 말풍선(카드) 맨 아래. 왼쪽 쿠폰명·설명, 점선 구분(위아래 반원 홈), 오른쪽 하늘색 칸 다운로드 + COUPON
function Coupon({ content, className }: { content: PkContent; className?: string }) {
  if (!content.coupon) return null;
  return (
    <div className={cn('relative grid h-[42px] grid-cols-[minmax(0,1fr)_40px] rounded-[6px] border border-[#e2e4e8] bg-white', className)}>
      <div className="grid content-center gap-px overflow-hidden px-2.5">
        <span className={cn('truncate text-[12px] font-medium leading-tight', ink)}>{couponTitle(content.coupon)}</span>
        <span className={cn('truncate text-[10px] leading-tight', gray)}>{content.coupon.description || '쿠폰 설명'}</span>
      </div>
      <div className="grid content-center justify-items-center gap-[1px] rounded-r-[5px] border-l border-dashed border-[#c6d8f2] bg-[#eaf2fd] text-[#3f7ee8]">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M8 2.5v8M4.5 7.5 8 11l3.5-3.5M3 13.5h10" />
        </svg>
        <span className="text-[5.5px] font-bold tracking-[0.1em]">COUPON</span>
      </div>
      <span className="absolute -top-[5px] right-[35px] h-[9px] w-[9px] rounded-full border border-[#e2e4e8] bg-white [clip-path:inset(50%_0_0_0)]" />
      <span className="absolute -bottom-[5px] right-[35px] h-[9px] w-[9px] rounded-full border border-[#e2e4e8] bg-white [clip-path:inset(0_0_50%_0)]" />
    </div>
  );
}

// 커머스 가격 — 할인가(굵게, 원) · 정가(회색 취소선, 원 없음) · 할인율(주황)
function Price({ commerce }: { commerce: PkCommerce }) {
  const reg = num(commerce.regularPrice);
  const sale = num(commerce.discountPrice);
  if (!reg) return <div className="text-[16px] font-bold leading-tight text-[#c4c8cc]">가격</div>;
  if (!sale || sale >= reg) return <div className={cn('text-[16px] font-bold leading-tight', ink)}>{won(reg)}</div>;
  const rate = Math.round((1 - sale / reg) * 100);
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={cn('text-[16px] font-bold leading-tight', ink)}>{won(sale)}</span>
      <span className="text-[10.5px] text-[#a0a0a0] line-through">{reg.toLocaleString('ko-KR')}</span>
      <span className="text-[10.5px] font-semibold text-[#f0562b]">{rate}%</span>
    </div>
  );
}

function CommerceInfo({ commerce, additional }: { commerce: PkCommerce; additional: string }) {
  return (
    <div className="grid gap-2">
      <div className="grid gap-1">
        <span className={cn('truncate text-[12px] leading-snug', ink)}>{commerce.title || <span className="text-[#b5b9be]">상품명</span>}</span>
        <Price commerce={commerce} />
      </div>
      {additional && (
        <>
          <Divider />
          <span className={cn('whitespace-pre-wrap text-[11px] leading-snug', gray)}>{additional}</span>
        </>
      )}
    </div>
  );
}

const Body = ({ value, ph }: { value: string; ph: string }) => (
  <p className={cn('whitespace-pre-wrap break-words text-[12px] leading-[1.45]', ink)}>{value || <span className="text-[#b5b9be]">{ph}</span>}</p>
);

const Bubble = ({ children, wide, className, style }: { children: React.ReactNode; wide?: boolean; className?: string; style?: React.CSSProperties }) => (
  <div className={cn('overflow-hidden rounded-[12px] bg-white', wide ? 'w-full' : '', className)} style={wide ? style : { width: NORMAL_W, ...style }}>
    {children}
  </div>
);

function Single({ type, c }: { type: BubbleType; c: PkContent }) {
  switch (type) {
    case 'TEXT':
      return (
        <Bubble>
          <div className="grid gap-2.5 p-2.5">
            <Body value={c.content} ph="본문을 입력해 주세요" />
            <Buttons buttons={c.buttons} />
            <Coupon content={c} />
          </div>
        </Bubble>
      );
    case 'IMAGE':
      return (
        <Bubble>
          <Img image={c.image} ratio="2 / 1" placeholder="이미지 800×400" />
          <div className="grid gap-2.5 p-2.5">
            <Body value={c.content} ph="본문을 입력해 주세요" />
            <Buttons buttons={c.buttons} />
            <Coupon content={c} />
          </div>
        </Bubble>
      );
    case 'COMMERCE':
      return (
        <Bubble>
          <Img image={c.image} ratio="2 / 1" placeholder="상품 이미지 800×400" />
          <div className="grid gap-2.5 p-2.5">
            <CommerceInfo commerce={c.commerce} additional={c.additionalContent} />
            <Buttons buttons={c.buttons} horizontal />
            <Coupon content={c} />
          </div>
        </Bubble>
      );
    case 'WIDE':
      return (
        <Bubble wide>
          <Img image={c.image} ratio="4 / 3" placeholder="이미지 800×600" />
          <div className="grid gap-2.5 p-2.5">
            <Body value={c.content} ph="짧은 본문 (76자)" />
            <Buttons buttons={c.buttons} horizontal />
            <Coupon content={c} />
          </div>
        </Bubble>
      );
    case 'WIDE_ITEM_LIST':
      return (
        <Bubble wide>
          <div className="grid gap-2.5 p-2.5 pt-3">
            <div className={cn('text-center text-[12.5px] font-bold', ink)}>{c.header || <span className="font-normal text-[#b5b9be]">헤더</span>}</div>
            <div className="relative overflow-hidden rounded-[5px]">
              <Img image={c.mainItem.image} ratio="2 / 1" placeholder="대표 이미지 800×400" />
              <div className="absolute inset-x-0 bottom-0 line-clamp-2 whitespace-pre-wrap bg-gradient-to-t from-black/60 to-transparent px-2.5 pb-2 pt-6 text-[12px] font-medium leading-snug text-white">
                {c.mainItem.title}
              </div>
            </div>
            <div className="grid gap-1.5">
              {c.subItems.map((it, i) => (
                <div key={i} className="grid grid-cols-[38px_minmax(0,1fr)] items-center gap-2.5">
                  <div className="h-[38px] w-[38px] overflow-hidden rounded-[4px]">
                    <Img image={it.image} ratio="1 / 1" placeholder="1:1" />
                  </div>
                  <span className={cn('line-clamp-2 text-[12px] leading-snug', ink)}>{it.title || <span className="text-[#b5b9be]">목록 {i + 1}</span>}</span>
                </div>
              ))}
            </div>
            <Buttons buttons={c.buttons} horizontal />
            <Coupon content={c} />
          </div>
        </Bubble>
      );
    case 'PREMIUM_VIDEO':
      return (
        <Bubble wide>
          <div className="relative">
            <Img image={c.image} ratio="16 / 9" placeholder="카카오TV 영상" className={c.image ? '' : 'bg-[#2f3337] text-[#a0a7ae]'} />
            <span className="absolute bottom-2 left-2 rounded-full bg-black/55 px-1.5 py-[1px] text-[9.5px] text-white">영상</span>
            <span className="absolute bottom-2 right-2 grid h-7 w-7 place-items-center rounded-full bg-black/55">
              <Play className="ml-[1px] h-3 w-3 fill-white text-white" />
            </span>
          </div>
          <div className="grid gap-2.5 p-2.5">
            {c.header && <b className={cn('text-[12.5px] font-bold', ink)}>{c.header}</b>}
            {c.header && <Divider />}
            <Body value={c.content} ph="짧은 본문" />
            <Buttons buttons={c.buttons} />
            <Coupon content={c} />
          </div>
        </Bubble>
      );
    default:
      return null;
  }
}

// 캐러셀 — 카드마다 둥근 말풍선, 다음 카드가 오른쪽에 살짝 보인다. 버튼은 카드 아래에 맞춰 정렬.
function Carousel({ type, c }: { type: 'CAROUSEL_FEED' | 'CAROUSEL_COMMERCE'; c: PkContent }) {
  return (
    // snap 기준점이 왼쪽 여백(프로필 자리)을 넘지 않도록 scroll-padding 을 같이 준다
    <div className="-mr-2.5 flex snap-x snap-mandatory scroll-pl-[42px] items-stretch gap-[5px] overflow-x-auto pl-[42px] pr-2.5 [scrollbar-width:none]">
      {c.cards.map((card, i) => (
        <Bubble key={i} className="flex flex-none snap-start flex-col">
          <Img image={card.image} ratio="2 / 1" placeholder="이미지 800×400" />
          <div className="flex flex-1 flex-col gap-2.5 p-2.5">
            {type === 'CAROUSEL_FEED' ? (
              <div className="grid gap-2">
                <b className={cn('truncate text-[12.5px] font-bold', ink)}>{card.header || <span className="font-normal text-[#b5b9be]">카드 제목</span>}</b>
                <Divider />
                <p className={cn('whitespace-pre-wrap text-[11.5px] leading-[1.45]', ink)}>{card.content || <span className="text-[#b5b9be]">설명</span>}</p>
              </div>
            ) : (
              <CommerceInfo commerce={card.commerce} additional={card.additionalContent} />
            )}
            <Buttons buttons={card.buttons} horizontal className="mt-auto" />
          </div>
        </Bubble>
      ))}
      <div className="grid w-11 flex-none place-items-center">
        <div className="grid justify-items-center gap-1 text-[9.5px] text-[#3f4b57]">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-white text-[13px] leading-none text-[#555]">›</span>
          더보기
        </div>
      </div>
    </div>
  );
}

function Profile() {
  return (
    <div className="h-[32px] w-[32px] flex-none overflow-hidden rounded-[12px] bg-black">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/Taghere-logo.png" alt="" className="h-full w-full object-cover" />
    </div>
  );
}

export function PremiumKakaoPreview({
  type,
  content: input,
  verifyButton = false,
  footerName,
  inline = false,
}: {
  type: BubbleType;
  content: PkContent;
  verifyButton?: boolean;
  /** 발송 매장 안내(“OOO에서 발송된 카카오톡 광고톡입니다.”)에 들어갈 매장명 */
  footerName?: string;
  /** 모바일 시트 안에서 쓸 때 — 데스크톱 전용 숨김/고정 없이 그린다 */
  inline?: boolean;
}) {
  // 발송 때 서버가 붙이는 것과 같은 규칙으로 맨 아래 매장 안내를 붙여 보여준다
  const raw = applySenderFooter(type, input, footerName || '매장').content;
  // 직원 확인 버튼 — 버튼 맨 끝(캐러셀은 카드마다)에 붙는다 (발송 시 서버가 같은 규칙으로 붙임)
  const vb = { name: STAFF_VERIFY_BUTTON, link: '' };
  const content: PkContent = verifyButton
    ? { ...raw, buttons: [...raw.buttons, vb], cards: raw.cards.map((card) => ({ ...card, buttons: [...card.buttons, vb] })) }
    : raw;
  const now = new Date();
  const today = now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  const time = now.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
  const isCarousel = type === 'CAROUSEL_FEED' || type === 'CAROUSEL_COMMERCE';
  const isWide = type === 'WIDE' || type === 'WIDE_ITEM_LIST' || type === 'PREMIUM_VIDEO';
  const meta = 'text-[9.5px] text-[#4f5b66]';

  return (
    <div className={inline ? 'mx-auto w-full max-w-[360px]' : 'hidden lg:block flex-none w-[360px] self-start lg:sticky lg:top-6'}>
      <div className="rounded-3xl bg-[#e2e8f0] p-5">
        <p className="mb-4 text-center text-[#64748b]">카카오톡 미리보기</p>
        <div className="flex justify-center">
          <IPhoneFrame screenClassName="bg-[#abc1d1]">
            <div className="flex min-h-0 flex-1 flex-col">
              {/* 대화방 상단 바 */}
              <div className="flex items-center gap-1.5 px-2.5 pb-2 pt-1 text-[#191919]">
                <ChevronLeft className="h-5 w-5 flex-none" strokeWidth={2} />
                <span className="flex-1 truncate text-[13px] font-semibold">{CHANNEL}</span>
                <Search className="h-4 w-4 flex-none" strokeWidth={2} />
                <Menu className="h-4 w-4 flex-none" strokeWidth={2} />
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2.5 pb-4 [scrollbar-width:none]">
                <div className="mx-auto mb-3 mt-1 w-max rounded-full bg-black/10 px-2.5 py-[3px] text-[9.5px] text-[#3f4b57]">{today}</div>

                {/* 프로필 + 이름줄 */}
                <div className="flex gap-2.5">
                  <Profile />
                  <div className="min-w-0 flex-1 truncate pt-[1px] text-[11px] text-[#191919]">(광고) {CHANNEL}</div>
                </div>

                {isCarousel ? (
                  <div className="-mt-[14px]">
                    <Carousel type={type} c={content} />
                    <div className={cn('mt-1 pl-[42px]', meta)}>{OPT_OUT}</div>
                    <div className={cn('pl-[42px]', meta)}>{time}</div>
                  </div>
                ) : isWide ? (
                  <div className="-mt-[14px] pl-[42px] pr-1">
                    <Single type={type} c={content} />
                    <div className={cn('mt-1', meta)}>{OPT_OUT}</div>
                    <div className={meta}>{time}</div>
                  </div>
                ) : (
                  <div className="-mt-[14px] pl-[42px]">
                    <div className="flex items-end gap-1">
                      <Single type={type} c={content} />
                      <span className={cn('flex-none pb-0.5', meta)}>{time}</span>
                    </div>
                    <div className={cn('mt-1', meta)}>{OPT_OUT}</div>
                  </div>
                )}
              </div>
            </div>
          </IPhoneFrame>
        </div>
        <p className="mt-3 text-center text-[11.5px] text-[#64748b]">(광고) 표시와 수신거부 안내는 카카오톡이 자동으로 붙여요</p>
      </div>
    </div>
  );
}
