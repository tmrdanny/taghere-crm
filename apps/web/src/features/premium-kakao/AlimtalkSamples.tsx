'use client';

import { ALIMTALK_SAMPLES } from './samples';

// 템플릿 기본형(쿠폰 알림톡) 샘플 — 누르면 쿠폰 내용과 유효기간(2주 뒤)을 채운다
export function AlimtalkSamples({ onPick }: { onPick: (couponContent: string, expiryDate: string) => void }) {
  const expiry = () => {
    const d = new Date(Date.now() + 14 * 86400000);
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일까지`;
  };
  return (
    <div className="grid gap-1.5">
      <span className="text-[12px] font-medium text-[color:var(--ad-ink-2)]">샘플로 시작하기</span>
      <div className="flex flex-wrap gap-1.5">
        {ALIMTALK_SAMPLES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s.couponContent, expiry())}
            className="ad-press inline-flex h-8 items-center gap-1.5 rounded-full border border-[color:var(--ad-line-strong)] bg-white px-3 text-[12.5px] text-[color:var(--ad-ink-2)] hover:border-[color:var(--ad-faint)]"
          >
            <span className="font-medium text-[color:var(--ad-ink)]">{s.name}</span>
            <span className="text-[11px] text-[color:var(--ad-faint)]">{s.tag}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
