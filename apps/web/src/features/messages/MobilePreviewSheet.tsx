'use client';

import { useEffect, useState } from 'react';
import { Eye, X } from 'lucide-react';

// 모바일(데스크톱 레이아웃 미만)에서 발송 미리보기를 여는 버튼 + 아래에서 올라오는 시트.
// 데스크톱에서는 오른쪽 미리보기 패널이 항상 보이므로 렌더하지 않는다(lg:hidden).
export function MobilePreviewSheet({ children, label = '미리보기' }: { children: React.ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ad-press fixed bottom-[calc(16px+env(safe-area-inset-bottom,0px))] left-1/2 z-40 inline-flex h-11 -translate-x-1/2 items-center gap-1.5 rounded-full bg-[color:var(--ad-ink)] px-5 text-[14px] font-semibold text-white shadow-[0_10px_30px_-8px_rgba(0,0,0,0.45)] lg:hidden"
      >
        <Eye className="h-4 w-4" strokeWidth={2} />
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center lg:hidden" role="dialog" aria-modal="true" aria-label={label}>
          <button type="button" aria-label="닫기" className="absolute inset-0 bg-black/45" onClick={() => setOpen(false)} />
          <div className="relative max-h-[92dvh] w-full max-w-[440px] overflow-y-auto rounded-t-[24px] bg-[color:var(--ad-bg,#f2f3f4)] px-4 pb-[calc(20px+env(safe-area-inset-bottom,0px))] pt-3">
            <div className="sticky top-0 z-10 -mx-4 mb-2 flex items-center justify-between bg-[color:var(--ad-bg,#f2f3f4)] px-4 pb-2 pt-1">
              <span className="mx-auto h-1 w-10 rounded-full bg-black/15" aria-hidden />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="absolute right-3 top-0 grid h-8 w-8 place-items-center rounded-full bg-white text-[color:var(--ad-ink)] shadow-sm"
                aria-label="미리보기 닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {children}
          </div>
        </div>
      )}
    </>
  );
}
