import type { ReactNode } from 'react';

/**
 * iPhone 18 Pro 목업 프레임 — 티타늄 테두리, 얇은 베젤, 다이내믹 아일랜드, 상태 표시줄, 홈 인디케이터.
 * children 은 화면 영역(상태 표시줄 아래)에 그대로 렌더된다.
 */
export function IPhoneFrame({
  children,
  screenClassName = 'bg-white',
  className = 'w-[296px]',
  time = '9:41',
}: {
  children: ReactNode;
  screenClassName?: string;
  /** 폭 지정 (높이는 실제 기기 비율로 자동) */
  className?: string;
  time?: string;
}) {
  return (
    <div className={`relative mx-auto ${className}`} style={{ aspectRatio: '71.5 / 149.6' }}>
      {/* 측면 버튼: 왼쪽 액션 버튼·볼륨, 오른쪽 전원·카메라 컨트롤 */}
      <span className="absolute -left-[3px] top-[18%] h-[5%] w-[3px] rounded-l-sm bg-[#8e8a84]" aria-hidden />
      <span className="absolute -left-[3px] top-[26%] h-[9%] w-[3px] rounded-l-sm bg-[#8e8a84]" aria-hidden />
      <span className="absolute -left-[3px] top-[37%] h-[9%] w-[3px] rounded-l-sm bg-[#8e8a84]" aria-hidden />
      <span className="absolute -right-[3px] top-[28%] h-[13%] w-[3px] rounded-r-sm bg-[#8e8a84]" aria-hidden />
      <span className="absolute -right-[3px] top-[58%] h-[7%] w-[3px] rounded-r-sm bg-[#8e8a84]" aria-hidden />

      {/* 티타늄 외곽 */}
      <div className="absolute inset-0 rounded-[48px] bg-gradient-to-b from-[#c9c5bf] via-[#a8a49e] to-[#c3bfb8] p-[3px] shadow-[0_30px_60px_-24px_rgba(19,22,81,0.45),0_2px_6px_rgba(0,0,0,0.12)]">
        {/* 검은 베젤 */}
        <div className="h-full w-full rounded-[45px] bg-[#0b0b0c] p-[7px]">
          {/* 화면 */}
          <div className={`relative flex h-full w-full flex-col overflow-hidden rounded-[38px] ${screenClassName}`}>
            {/* 상태 표시줄 */}
            <div className="relative z-10 flex h-[44px] shrink-0 items-center justify-between px-[26px] pt-[6px] text-[13px] font-semibold text-[#111]">
              <span className="tracking-[-0.2px]">{time}</span>
              <span className="flex items-center gap-[5px]" aria-hidden>
                <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor">
                  <rect x="0" y="7" width="3" height="4" rx="0.8" />
                  <rect x="4.5" y="5" width="3" height="6" rx="0.8" />
                  <rect x="9" y="2.5" width="3" height="8.5" rx="0.8" />
                  <rect x="13.5" y="0" width="3" height="11" rx="0.8" />
                </svg>
                <svg width="15" height="11" viewBox="0 0 15 11" fill="currentColor">
                  <path d="M7.5 2.2c2.1 0 4 .8 5.5 2.2l1-1C12.3 1.8 10 .8 7.5.8S2.7 1.8 1 3.4l1 1c1.5-1.4 3.4-2.2 5.5-2.2Z" />
                  <path d="M7.5 5.3c1.3 0 2.4.5 3.3 1.3l1-1C10.6 4.5 9.1 3.9 7.5 3.9S4.4 4.5 3.2 5.6l1 1c.9-.8 2-1.3 3.3-1.3Z" />
                  <path d="M7.5 8.3c.5 0 1 .2 1.3.5L7.5 10.2 6.2 8.8c.3-.3.8-.5 1.3-.5Z" />
                </svg>
                <span className="relative inline-flex h-[12px] w-[24px] items-center rounded-[4px] border border-[#111]/40 p-[1.5px]">
                  <span className="h-full w-[78%] rounded-[2px] bg-[#111]" />
                  <span className="absolute -right-[3px] top-1/2 h-[4px] w-[1.5px] -translate-y-1/2 rounded-r bg-[#111]/40" />
                </span>
              </span>
            </div>

            {/* 다이내믹 아일랜드 */}
            <div className="absolute left-1/2 top-[11px] z-20 h-[30px] w-[94px] -translate-x-1/2 rounded-full bg-black" aria-hidden />

            <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>

            {/* 홈 인디케이터 */}
            <div className="pointer-events-none absolute bottom-[7px] left-1/2 z-20 h-[5px] w-[108px] -translate-x-1/2 rounded-full bg-black/80" aria-hidden />
          </div>
        </div>
      </div>
    </div>
  );
}
