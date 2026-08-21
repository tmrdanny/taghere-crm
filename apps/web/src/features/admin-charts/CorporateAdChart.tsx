'use client';

import React, { useRef, useState } from 'react';

import { CorporateAdTrendData } from './types';

// Dual-line chart for Corporate Ad AlimTalk + Membership signups
export function CorporateAdChart({ data }: { data: CorporateAdTrendData[] }) {
  const [hoveredPoint, setHoveredPoint] = useState<{
    x: number;
    yAlimTalk: number;
    yMembership: number;
    data: CorporateAdTrendData;
  } | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  if (data.length === 0) return null;

  const maxAlimTalk = Math.max(...data.map((d) => d.alimTalkTotal), 1);
  const maxMembership = Math.max(...data.map((d) => d.membershipCount), 1);
  const maxValue = Math.max(maxAlimTalk, maxMembership);

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1 || 1)) * 100;
    const yAlimTalk = 100 - (d.alimTalkTotal / maxValue) * 100;
    const yMembership = 100 - (d.membershipCount / maxValue) * 100;
    return { x, yAlimTalk, yMembership, data: d };
  });

  const alimTalkPath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.yAlimTalk}`)
    .join(' ');
  const membershipPath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.yMembership}`)
    .join(' ');

  const yLabels = [maxValue, Math.round(maxValue / 2), 0];
  const xLabels =
    data.length > 2
      ? [
          data[0].date.slice(5),
          data[Math.floor(data.length / 2)].date.slice(5),
          data[data.length - 1].date.slice(5),
        ]
      : data.map((d) => d.date.slice(5));

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!chartRef.current) return;
    const rect = chartRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;

    let closestPoint = points[0];
    let minDist = Math.abs(x - points[0].x);
    for (const p of points) {
      const dist = Math.abs(x - p.x);
      if (dist < minDist) {
        minDist = dist;
        closestPoint = p;
      }
    }
    setHoveredPoint(closestPoint);
  };

  return (
    <div className="w-full h-full relative">
      {/* Y-axis labels */}
      <div className="absolute left-0 top-0 bottom-6 w-10 flex flex-col justify-between text-[11px] text-neutral-400">
        {yLabels.map((label, i) => (
          <span key={i}>{label.toLocaleString()}</span>
        ))}
      </div>

      {/* Chart area */}
      <div
        ref={chartRef}
        className="absolute left-12 right-0 top-0 bottom-6 cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredPoint(null)}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
          {/* Grid lines */}
          <line x1="0" y1="0" x2="100" y2="0" stroke="#E5E5E5" strokeWidth="0.5" />
          <line x1="0" y1="50" x2="100" y2="50" stroke="#E5E5E5" strokeWidth="0.5" />
          <line x1="0" y1="100" x2="100" y2="100" stroke="#E5E5E5" strokeWidth="0.5" />

          {/* AlimTalk line */}
          <path d={alimTalkPath} fill="none" stroke="#6BA3FF" strokeWidth="2" vectorEffect="non-scaling-stroke" />

          {/* Membership line */}
          <path d={membershipPath} fill="none" stroke="#10B981" strokeWidth="2" vectorEffect="non-scaling-stroke" />

          {/* Hover indicator */}
          {hoveredPoint && (
            <>
              <line
                x1={hoveredPoint.x}
                y1="0"
                x2={hoveredPoint.x}
                y2="100"
                stroke="#9CA3AF"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
                strokeDasharray="4 4"
              />
              <circle
                cx={hoveredPoint.x}
                cy={hoveredPoint.yAlimTalk}
                r="4"
                fill="#6BA3FF"
                stroke="white"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={hoveredPoint.x}
                cy={hoveredPoint.yMembership}
                r="4"
                fill="#10B981"
                stroke="white"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
        </svg>

        {/* Tooltip */}
        {hoveredPoint && (
          <div
            className="absolute bg-neutral-900 text-white text-[12px] px-3 py-2 rounded-lg shadow-lg pointer-events-none z-10"
            style={{
              left: `${Math.min(Math.max(hoveredPoint.x, 15), 85)}%`,
              top: '-8px',
              transform: 'translate(-50%, -100%)',
            }}
          >
            <p className="font-medium">{hoveredPoint.data.date}</p>
            <p className="text-[#93C5FD]">알림톡: {hoveredPoint.data.alimTalkTotal}건 (성공 {hoveredPoint.data.alimTalkSent})</p>
            <p className="text-emerald-300">멤버십: {hoveredPoint.data.membershipCount}명</p>
          </div>
        )}
      </div>

      {/* X-axis labels */}
      <div className="absolute left-12 right-0 bottom-0 flex justify-between text-[11px] text-neutral-400">
        {xLabels.map((label, i) => (
          <span key={i}>{label}</span>
        ))}
      </div>
    </div>
  );
}
