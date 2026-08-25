'use client';

import { useState } from 'react';

import { VisitSourceDistribution } from './types';
import { CHART_COLORS } from './utils';

// Visit Source Bar Chart
export function VisitSourceBarChart({ data }: { data: VisitSourceDistribution[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (data.length === 0) return null;

  const maxCount = Math.max(...data.map((d) => d.count));

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 flex items-end gap-2 pb-6">
        {data.map((d, i) => {
          const height = (d.count / maxCount) * 100;
          const isHovered = hoveredIndex === i;

          return (
            <div
              key={i}
              className="flex-1 relative flex flex-col items-center"
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {/* Tooltip */}
              {isHovered && (
                <div className="absolute bottom-full mb-2 bg-neutral-900 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap z-10">
                  <div className="font-medium">{d.label}</div>
                  <div>{d.count}명 ({d.percentage.toFixed(1)}%)</div>
                </div>
              )}

              {/* Bar */}
              <div
                className="w-full rounded-t-md transition-all cursor-pointer"
                style={{
                  height: `${height}%`,
                  minHeight: '4px',
                  backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                  opacity: hoveredIndex === null || isHovered ? 1 : 0.5,
                  transform: isHovered ? 'scaleY(1.02)' : 'scaleY(1)',
                  transformOrigin: 'bottom',
                }}
              />

              {/* Count label */}
              <span className="absolute bottom-[-20px] text-[10px] text-neutral-500">
                {d.count}
              </span>
            </div>
          );
        })}
      </div>

      {/* X-axis labels */}
      <div className="flex gap-2 pt-2 border-t border-neutral-200">
        {data.map((d, i) => (
          <div
            key={i}
            className="flex-1 text-center text-[10px] text-neutral-500 truncate"
            title={d.label}
          >
            {d.label.length > 6 ? d.label.slice(0, 5) + '…' : d.label}
          </div>
        ))}
      </div>
    </div>
  );
}
