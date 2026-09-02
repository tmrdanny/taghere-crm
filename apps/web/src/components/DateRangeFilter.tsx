'use client';

import { useEffect, useRef, useState } from 'react';
import { Calendar, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

interface Props {
  /** 프리셋 일수 (직접 선택 중이면 무시된다) */
  days: number;
  onDaysChange: (d: number) => void;
  dayOptions?: number[];
  /** 사용자 지정 범위. null 이면 프리셋 모드 */
  range: DateRange | null;
  onRangeChange: (r: DateRange | null) => void;
  /** 활성 상태 색상 (tailwind 클래스). 프랜차이즈/매장 테마 구분용 */
  accentClass?: string;
}

const todayStr = () => {
  // KST 기준 오늘 (브라우저 TZ 무관)
  const kst = new Date(Date.now() + 9 * 3600000);
  return kst.toISOString().slice(0, 10);
};

/**
 * "7일 / 30일 / 90일 + 직접 선택" 기간 필터.
 * 직접 선택은 하루 단위(from === to)도 허용한다.
 */
export default function DateRangeFilter({
  days,
  onDaysChange,
  dayOptions = [7, 30, 90],
  range,
  onRangeChange,
  accentClass = 'bg-blue-50 border-blue-200 text-blue-700',
}: Props) {
  const [open, setOpen] = useState(false);
  const [tempFrom, setTempFrom] = useState('');
  const [tempTo, setTempTo] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const label = range ? `${range.from.slice(5)} ~ ${range.to.slice(5)}` : '직접 선택';

  const apply = () => {
    if (!tempFrom || !tempTo) return;
    // 뒤집힌 입력은 자동으로 바로잡는다
    const [from, to] = tempFrom <= tempTo ? [tempFrom, tempTo] : [tempTo, tempFrom];
    onRangeChange({ from, to });
    setOpen(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {dayOptions.length > 0 && (
      <div className="flex gap-1 p-1 bg-slate-100 rounded-lg">
        {dayOptions.map((d) => (
          <button
            key={d}
            onClick={() => {
              onRangeChange(null);
              onDaysChange(d);
            }}
            className={cn(
              'px-3 py-1 text-sm font-medium rounded-md transition-colors',
              !range && days === d
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            {d}일
          </button>
        ))}
      </div>
      )}

      <div className="relative" ref={ref}>
        <button
          onClick={() => {
            setTempFrom(range?.from || todayStr());
            setTempTo(range?.to || todayStr());
            setOpen(!open);
          }}
          className={cn(
            'flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border transition-colors',
            range ? accentClass : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
          )}
        >
          <Calendar className="w-3.5 h-3.5" />
          {label}
          {range && (
            <X
              className="w-3.5 h-3.5 hover:opacity-60"
              onClick={(e) => {
                e.stopPropagation();
                onRangeChange(null);
              }}
            />
          )}
        </button>

        {open && (
          <div className="absolute top-full right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg p-3 z-50 w-[260px]">
            <div className="space-y-2">
              <div>
                <label className="block text-xs text-slate-500 mb-1">시작일</label>
                <input
                  type="date"
                  value={tempFrom}
                  max={tempTo || undefined}
                  onChange={(e) => setTempFrom(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">종료일</label>
                <input
                  type="date"
                  value={tempTo}
                  min={tempFrom || undefined}
                  onChange={(e) => setTempTo(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-md"
                />
              </div>
              <p className="text-[11px] text-slate-400">
                시작일과 종료일을 같게 하면 하루만 조회합니다 (최대 366일)
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => {
                    onRangeChange(null);
                    setOpen(false);
                  }}
                  className="flex-1 px-2 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50"
                >
                  초기화
                </button>
                <button
                  onClick={apply}
                  disabled={!tempFrom || !tempTo}
                  className="flex-1 px-2 py-1.5 text-sm text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-40"
                >
                  적용
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
