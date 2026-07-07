'use client';

import { useEffect, useState } from 'react';

/**
 * 스탬프 매번 적립 개수 직접 입력 팝업.
 * 직원이 적립할 스탬프 개수를 입력하는 공용 오버레이 (태블릿/적립 URL 공용).
 * - variant='tablet': 터치 친화적 큰 버튼/폰트
 * - 취소 시 적립 자체가 취소됨 (onCancel)
 */
export function StampCountPrompt({
  open,
  storeName,
  submitting = false,
  variant = 'default',
  onCancel,
  onConfirm,
}: {
  open: boolean;
  storeName?: string;
  submitting?: boolean;
  variant?: 'default' | 'tablet';
  onCancel: () => void;
  onConfirm: (count: number) => void;
}) {
  const [value, setValue] = useState('1');

  // 팝업이 열릴 때마다 기본값 1로 초기화
  useEffect(() => {
    if (open) setValue('1');
  }, [open]);

  if (!open) return null;

  const parsed = parseInt(value, 10);
  const isValid = Number.isInteger(parsed) && parsed >= 1;
  const isTablet = variant === 'tablet';

  const step = (delta: number) => {
    const next = Math.max(1, (Number.isInteger(parsed) ? parsed : 0) + delta);
    setValue(String(next));
  };

  const handleConfirm = () => {
    if (!isValid || submitting) return;
    onConfirm(parsed);
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 px-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`w-full rounded-2xl bg-white shadow-xl ${
          isTablet ? 'max-w-md p-8' : 'max-w-sm p-6'
        }`}
      >
        <h2
          className={`font-bold text-neutral-900 ${
            isTablet ? 'text-2xl' : 'text-lg'
          }`}
        >
          스탬프 적립 개수
        </h2>
        <p
          className={`mt-1 text-neutral-500 ${
            isTablet ? 'text-base' : 'text-sm'
          }`}
        >
          {storeName ? `${storeName} · ` : ''}적립할 스탬프 개수를 입력해주세요.
        </p>

        <div
          className={`mt-6 flex items-center justify-center gap-3 ${
            isTablet ? 'gap-4' : ''
          }`}
        >
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={!isValid || parsed <= 1}
            className={`flex items-center justify-center rounded-xl border border-neutral-300 font-bold text-neutral-600 disabled:opacity-40 ${
              isTablet ? 'h-16 w-16 text-3xl' : 'h-12 w-12 text-2xl'
            }`}
            aria-label="개수 감소"
          >
            −
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ''))}
            className={`rounded-xl border border-neutral-300 text-center font-bold text-neutral-900 focus:border-neutral-900 focus:outline-none ${
              isTablet ? 'h-16 w-28 text-3xl' : 'h-12 w-24 text-2xl'
            }`}
          />
          <button
            type="button"
            onClick={() => step(1)}
            disabled={!Number.isInteger(parsed)}
            className={`flex items-center justify-center rounded-xl border border-neutral-300 font-bold text-neutral-600 disabled:opacity-40 ${
              isTablet ? 'h-16 w-16 text-3xl' : 'h-12 w-12 text-2xl'
            }`}
            aria-label="개수 증가"
          >
            +
          </button>
        </div>
        <p className={`mt-2 text-center text-neutral-400 ${isTablet ? 'text-sm' : 'text-xs'}`}>
          개
        </p>

        <div className={`mt-8 flex gap-3`}>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className={`flex-1 rounded-xl border border-neutral-300 font-semibold text-neutral-700 disabled:opacity-50 ${
              isTablet ? 'py-4 text-lg' : 'py-3 text-base'
            }`}
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!isValid || submitting}
            className={`flex-1 rounded-xl bg-neutral-900 font-semibold text-white disabled:opacity-40 ${
              isTablet ? 'py-4 text-lg' : 'py-3 text-base'
            }`}
          >
            {submitting ? '적립 중...' : '적립하기'}
          </button>
        </div>
      </div>
    </div>
  );
}
