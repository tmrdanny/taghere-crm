'use client';

import { useRef } from 'react';
import { cn } from '@/lib/utils';
import { DEFAULT_COUPON_SMS_BODY, SMS_BODY_MAX, SMS_BODY_VARS } from './coupon-sms';

// 쿠폰 문자 본문 — 기본 문구 / 직접 쓰기. value 가 null 이면 기본 문구로 나간다.
// (광고) 표기 · 직원 확인 링크 · 길찾기 링크 · 무료수신거부는 발송할 때 자동으로 붙는다.
export function CouponSmsBodyField({
  value,
  onChange,
  label = '문자 내용',
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  label?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const custom = value !== null;

  const insert = (token: string) => {
    const el = ref.current;
    const cur = value ?? '';
    if (!el) return onChange(cur + token);
    const start = el.selectionStart ?? cur.length;
    const end = el.selectionEnd ?? cur.length;
    const next = (cur.slice(0, start) + token + cur.slice(end)).slice(0, SMS_BODY_MAX);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-[color:var(--ad-ink-2)]">{label}</span>
        <div className="flex rounded-[10px] bg-[color:var(--ad-bg)] p-[3px]" role="radiogroup" aria-label={label}>
          {[
            { on: !custom, text: '기본 문구', pick: () => onChange(null) },
            { on: custom, text: '직접 쓰기', pick: () => !custom && onChange(DEFAULT_COUPON_SMS_BODY) },
          ].map((o) => (
            <button
              key={o.text}
              type="button"
              role="radio"
              aria-checked={o.on}
              onClick={o.pick}
              className={cn('h-8 rounded-[8px] px-3 text-[12.5px] font-medium', o.on ? 'bg-white text-[color:var(--ad-ink)] shadow-sm' : 'text-[color:var(--ad-muted)]')}
            >
              {o.text}
            </button>
          ))}
        </div>
      </div>

      {custom && (
        <>
          <textarea
            ref={ref}
            value={value ?? ''}
            maxLength={SMS_BODY_MAX}
            onChange={(e) => onChange(e.target.value)}
            rows={6}
            className="w-full resize-y rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 py-2.5 text-[13.5px] leading-[1.6] text-[color:var(--ad-ink)] focus:border-[color:var(--ad-ink)] focus:outline-none"
            placeholder="손님에게 보낼 문구를 자유롭게 써 주세요"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            {SMS_BODY_VARS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => insert(t)}
                className="h-7 rounded-full border border-[color:var(--ad-line-strong)] bg-white px-2.5 text-[12px] text-[color:var(--ad-ink-2)] hover:border-[color:var(--ad-ink)]"
              >
                {t}
              </button>
            ))}
            <span className="ml-auto text-[11.5px] tabular-nums text-[color:var(--ad-faint)]">
              {(value ?? '').length}/{SMS_BODY_MAX}
            </span>
          </div>
        </>
      )}
      <p className="text-[12px] leading-[1.55] text-[color:var(--ad-muted)]">
        {custom ? '버튼을 누르면 매장명·쿠폰 내용·유효기간이 들어갈 자리를 넣어요. ' : '매장명·쿠폰 내용·유효기간이 들어간 기본 문구로 보내요. '}
        (광고) 표기, 직원 확인 링크, 길찾기 링크, 수신거부 번호는 자동으로 붙어요.
      </p>
    </div>
  );
}
