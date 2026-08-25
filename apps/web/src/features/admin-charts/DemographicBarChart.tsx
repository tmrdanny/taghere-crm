'use client';

import { useState } from 'react';

import { formatNumber } from '@/lib/utils';

import { DemographicItem } from './types';

// Demographic Bar Chart
export function DemographicBarChart({ data, colors }: { data: DemographicItem[]; colors: string[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (data.length === 0) return null;

  const maxCount = Math.max(...data.map((d) => d.count));
  if (maxCount === 0) return <div className="h-full flex items-center justify-center text-neutral-400">데이터가 없습니다</div>;

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 flex items-end gap-3 pb-6">
        {data.map((d, i) => {
          const height = maxCount > 0 ? (d.count / maxCount) * 100 : 0;
          const isHovered = hoveredIndex === i;

          return (
            <div
              key={d.key}
              className="flex-1 relative flex flex-col items-center"
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {isHovered && (
                <div className="absolute bottom-full mb-2 bg-neutral-900 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap z-10">
                  <div className="font-medium">{d.label}</div>
                  <div>{formatNumber(d.count)}명 ({d.percentage}%)</div>
                </div>
              )}

              <div
                className="w-full rounded-t-md transition-all cursor-pointer"
                style={{
                  height: `${height}%`,
                  minHeight: d.count > 0 ? '4px' : '0px',
                  backgroundColor: colors[i % colors.length],
                  opacity: hoveredIndex === null || isHovered ? 1 : 0.5,
                  transform: isHovered ? 'scaleY(1.02)' : 'scaleY(1)',
                  transformOrigin: 'bottom',
                }}
              />

              <span className="absolute bottom-[-20px] text-[10px] text-neutral-500">
                {formatNumber(d.count)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex gap-3 pt-2 border-t border-neutral-200">
        {data.map((d, i) => (
          <div
            key={d.key}
            className="flex-1 text-center text-[11px] text-neutral-600 font-medium truncate"
            title={d.label}
          >
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}
