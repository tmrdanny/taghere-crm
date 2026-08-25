'use client';

import { useState } from 'react';

import { AnalyticsData } from './types';
import { CHART_PALETTE } from './utils';

const GENDER_LABEL: Record<string, string> = {
  MALE: '남성',
  FEMALE: '여성',
  UNKNOWN: '미상',
};

export function GenderPieChart({ data }: { data: AnalyticsData['demographics']['byGender'] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) {
    return <p className="text-center text-sm text-neutral-400 py-8">데이터가 없습니다.</p>;
  }

  let currentAngle = -90;
  const slices = data.map((d, i) => {
    const angle = (d.count / total) * 360;
    const start = currentAngle;
    const end = start + angle;
    currentAngle = end;
    const startRad = (start * Math.PI) / 180;
    const endRad = (end * Math.PI) / 180;
    const largeArc = angle > 180 ? 1 : 0;
    const x1 = 50 + 40 * Math.cos(startRad);
    const y1 = 50 + 40 * Math.sin(startRad);
    const x2 = 50 + 40 * Math.cos(endRad);
    const y2 = 50 + 40 * Math.sin(endRad);
    return {
      d: `M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`,
      color: CHART_PALETTE[i % CHART_PALETTE.length],
      label: GENDER_LABEL[d.gender] || d.gender,
      count: d.count,
      pct: total > 0 ? (d.count / total) * 100 : 0,
    };
  });

  return (
    <div className="w-full h-full flex">
      <div className="w-1/2 h-full">
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {slices.map((s, i) => (
            <path
              key={i}
              d={s.d}
              fill={s.color}
              stroke="#fff"
              strokeWidth="0.5"
              opacity={hoveredIdx === null || hoveredIdx === i ? 1 : 0.5}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="cursor-pointer transition-opacity"
            />
          ))}
        </svg>
      </div>
      <div className="w-1/2 pl-3 flex flex-col justify-center gap-2">
        {slices.map((s, i) => (
          <div
            key={i}
            className="flex items-center gap-2 text-xs"
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            <div className="w-3 h-3 rounded" style={{ backgroundColor: s.color }} />
            <span className="text-neutral-700 flex-1">{s.label}</span>
            <span className="text-neutral-500">
              {s.count}명 ({s.pct.toFixed(0)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
