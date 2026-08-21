'use client';

import { useState } from 'react';

import { CHART_PALETTE } from './utils';

export function CategoryBarChart({
  data,
  labelMap,
}: {
  data: { key: string; count: number }[];
  labelMap?: Record<string, string>;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  if (data.length === 0) {
    return <p className="text-center text-sm text-neutral-400 py-8">데이터가 없습니다.</p>;
  }
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 flex items-end gap-2 pb-6">
        {data.map((d, i) => {
          const height = (d.count / max) * 100;
          const isH = hovered === i;
          const label = labelMap?.[d.key] || d.key;
          return (
            <div
              key={i}
              className="flex-1 relative flex flex-col items-center"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              {isH && (
                <div className="absolute bottom-full mb-1 bg-neutral-900 text-white text-[11px] px-2 py-1 rounded whitespace-nowrap z-10">
                  {label}: {d.count}명
                </div>
              )}
              <div
                className="w-full rounded-t transition-all cursor-pointer"
                style={{
                  height: `${height}%`,
                  minHeight: d.count > 0 ? '4px' : '0px',
                  backgroundColor: CHART_PALETTE[i % CHART_PALETTE.length],
                  opacity: hovered === null || isH ? 1 : 0.5,
                }}
              />
              <span className="absolute bottom-[-18px] text-[10px] text-neutral-500">
                {d.count}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 pt-2 border-t border-neutral-200">
        {data.map((d, i) => {
          const label = labelMap?.[d.key] || d.key;
          return (
            <div key={i} className="flex-1 text-center text-[10px] text-neutral-600 truncate" title={label}>
              {label.length > 8 ? label.slice(0, 7) + '…' : label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
