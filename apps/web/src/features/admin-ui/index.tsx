'use client';

// 관리자 공통 UI 조각 — app/admin/admin-theme.css 의 .ad 토큰을 사용

import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const rise = (i: number): CSSProperties => ({ ['--i' as string]: i });

export const won = (n: number) => n.toLocaleString('ko-KR');

// 숫자 카운트업 — 리렌더 없이 textContent 만 갱신
export const CountUp = memo(function CountUp({ value, duration = 1000 }: { value: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = won(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      el.textContent = won(Math.round(value * (p === 1 ? 1 : 1 - Math.pow(2, -10 * p))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <span ref={ref} className="ad-tnum">{won(value)}</span>;
});

// 글자 폭이 달라도 인디케이터가 정확히 따라가는 탭
export function Tabs<T extends string>({
  options,
  value,
  onChange,
  label,
  format,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  format?: (v: T) => string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [box, setBox] = useState({ x: 0, w: 0 });

  useLayoutEffect(() => {
    const el = refs.current[value];
    if (el) setBox({ x: el.offsetLeft, w: el.offsetWidth });
  }, [value, options]);

  return (
    <div role="tablist" aria-label={label} className="relative flex items-center rounded-[10px] bg-[rgba(29,32,34,0.045)] p-[3px]">
      <span
        aria-hidden
        className="ad-seg-indicator absolute bottom-[3px] left-0 top-[3px] rounded-[8px] bg-white shadow-[0_1px_2px_rgba(29,32,34,0.08),0_0_0_1px_rgba(29,32,34,0.04)]"
        style={{ width: box.w, transform: `translateX(${box.x}px)` }}
      />
      {options.map((o) => (
        <button
          key={o}
          ref={(el) => {
            refs.current[o] = el;
          }}
          type="button"
          role="tab"
          aria-selected={o === value}
          onClick={() => onChange(o)}
          className={cn(
            'ad-press relative z-[1] whitespace-nowrap rounded-[8px] px-2.5 py-1 text-[12.5px] font-medium',
            o === value ? 'text-[color:var(--ad-ink)]' : 'text-[color:var(--ad-muted)] hover:text-[color:var(--ad-ink-2)]'
          )}
        >
          {format ? format(o) : o}
        </button>
      ))}
    </div>
  );
}

export function SectionHead({ title, meta, action }: { title: string; meta?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <h2 className="text-[14px] font-semibold tracking-[-0.015em]">{title}</h2>
        {meta && <p className="mt-0.5 text-[12px] text-[color:var(--ad-faint)]">{meta}</p>}
      </div>
      {action}
    </div>
  );
}

export function Skel({ className }: { className?: string }) {
  return <div className={cn('ad-skel', className)} aria-hidden />;
}

export function Empty({ children = '데이터가 없습니다', className }: { children?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center text-[13px] text-[color:var(--ad-faint)]', className)}>{children}</div>
  );
}
