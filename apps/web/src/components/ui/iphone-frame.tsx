import type { ReactNode } from 'react';

/**
 * iPhone 18 Pro 목업 — 두꺼운 블랙 베젤, 큰 코너, 다이내믹 아일랜드, 화면 끝까지 차는 콘텐츠.
 * 모든 치수는 폭 기준 비율(cqw)이라 어떤 폭에서도 실제 기기 비율을 유지한다.
 * children 은 화면 전체에 깔리며, 상단 안전 영역(아일랜드 높이)만큼 자동으로 내려온다.
 */
export function IPhoneFrame({
  children,
  screenClassName = 'bg-white',
  className = 'w-[300px]',
  fullBleed = false,
}: {
  children: ReactNode;
  screenClassName?: string;
  /** 폭 지정 (높이는 기기 비율로 자동) */
  className?: string;
  /** true 면 상단 안전 영역 없이 콘텐츠가 아일랜드 뒤까지 깔린다 (히어로 이미지 등) */
  fullBleed?: boolean;
}) {
  return (
    <div className={`relative mx-auto [container-type:inline-size] ${className}`} style={{ aspectRatio: '71.5 / 149.6' }}>
      {/* 본체: 블랙 베젤 + 가장자리 하이라이트 + 부드러운 그림자 */}
      <div
        className="absolute inset-0 bg-[#0e1113]"
        style={{
          borderRadius: '15.5cqw',
          padding: '3.6cqw',
          boxShadow:
            'inset 0 0 0 1.2px rgba(255,255,255,0.14), inset 0 0 0 0.45cqw #1c2124, 0 40px 80px -30px rgba(19,22,81,0.35), 0 18px 36px -18px rgba(0,0,0,0.35)',
        }}
      >
        {/* 화면 */}
        <div
          className={`relative flex h-full w-full flex-col overflow-hidden ${screenClassName}`}
          style={{ borderRadius: '12cqw' }}
        >
          {/* 다이내믹 아일랜드 */}
          <div
            className="absolute left-1/2 z-30 -translate-x-1/2 rounded-full bg-black"
            style={{ top: '2.6cqw', width: '31cqw', height: '9cqw' }}
            aria-hidden
          />
          <div className="relative flex min-h-0 flex-1 flex-col" style={fullBleed ? undefined : { paddingTop: '13cqw' }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
