'use client';

import type { ScaleConfig } from '@/features/enroll/types';

const DEFAULT_SCALE: ScaleConfig = { min: 1, max: 5, minLabel: '매우 별로였다', maxLabel: '매우 좋았다' };

/**
 * 척도형(1~5) 설문 입력 — 가입/적립 완료 팝업 공용.
 * 값은 "1"~"5" 문자열로 다룬다 (서버에 valueText 로 저장).
 */
export function ScaleQuestionInput({
  config,
  value,
  onChange,
}: {
  config?: ScaleConfig | null;
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  const scale = config ?? DEFAULT_SCALE;
  const scores = Array.from({ length: scale.max - scale.min + 1 }, (_, i) => scale.min + i);

  return (
    <div className="w-full max-w-[280px]">
      <div className="flex justify-between gap-1.5" role="radiogroup">
        {scores.map((score) => {
          const selected = value === String(score);
          return (
            <button
              key={score}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${score}점`}
              onClick={() => onChange(String(score))}
              className={`h-11 flex-1 rounded-lg text-[15px] font-semibold transition-colors ${
                selected
                  ? 'bg-[#FFD541] text-neutral-900'
                  : 'bg-neutral-50 border border-neutral-200 text-neutral-600'
              }`}
            >
              {score}
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between gap-3 text-[11.5px] text-neutral-500">
        <span className="text-left">{scale.minLabel}</span>
        <span className="text-right">{scale.maxLabel}</span>
      </div>
    </div>
  );
}
