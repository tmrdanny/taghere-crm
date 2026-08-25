'use client';

import { useState } from 'react';

import { AnalyticsData } from './types';

export function HourlyBarChart({ data }: { data: AnalyticsData['byHour'] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="w-full h-[180px] flex flex-col">
      <div className="flex-1 flex items-end gap-[2px] pb-6">
        {data.map((d, i) => {
          const height = (d.count / max) * 100;
          const isHovered = hovered === i;
          return (
            <div
              key={i}
              className="flex-1 relative flex flex-col items-center"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              {isHovered && d.count > 0 && (
                <div className="absolute bottom-full mb-1 bg-neutral-900 text-white text-[11px] px-2 py-1 rounded whitespace-nowrap z-10">
                  {d.hour}시: {d.count}건
                </div>
              )}
              <div
                className="w-full rounded-t transition-all cursor-pointer"
                style={{
                  height: `${height}%`,
                  minHeight: d.count > 0 ? '3px' : '0px',
                  backgroundColor: '#6BA3FF',
                  opacity: hovered === null || isHovered ? 1 : 0.5,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-[2px] text-[9px] text-neutral-400 pt-1 border-t border-neutral-200">
        {data.map((d) => (
          <div key={d.hour} className="flex-1 text-center">
            {d.hour % 3 === 0 ? d.hour : ''}
          </div>
        ))}
      </div>
    </div>
  );
}
