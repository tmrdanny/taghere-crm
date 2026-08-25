'use client';

import React, { useState } from 'react';

import { TrendData } from './types';

// Simple line chart component using SVG with hover tooltip
export function CustomerTrendChart({ data }: { data: TrendData[] }) {
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; data: TrendData } | null>(null);
  const chartRef = React.useRef<HTMLDivElement>(null);

  if (data.length === 0) return null;

  const maxValue = Math.max(...data.map((d) => d.cumulative));
  const minValue = Math.min(...data.map((d) => d.cumulative));
  const valueRange = maxValue - minValue || 1;

  // Generate path
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1 || 1)) * 100;
    const y = 100 - ((d.cumulative - minValue) / valueRange) * 100;
    return { x, y, data: d };
  });

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');

  // Area fill path
  const areaD = `${pathD} L 100 100 L 0 100 Z`;

  // Y-axis labels
  const yLabels = [maxValue, Math.round((maxValue + minValue) / 2), minValue];

  // X-axis labels (show first, middle, last dates)
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

    // Find closest point
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
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="w-full h-full"
        >
          {/* Grid lines */}
          <line x1="0" y1="0" x2="100" y2="0" stroke="#E5E5E5" strokeWidth="0.5" />
          <line x1="0" y1="50" x2="100" y2="50" stroke="#E5E5E5" strokeWidth="0.5" />
          <line x1="0" y1="100" x2="100" y2="100" stroke="#E5E5E5" strokeWidth="0.5" />

          {/* Area fill */}
          <path d={areaD} fill="url(#gradient)" opacity="0.3" />

          {/* Line */}
          <path
            d={pathD}
            fill="none"
            stroke="#FFD541"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />

          {/* Hover point indicator */}
          {hoveredPoint && (
            <circle
              cx={hoveredPoint.x}
              cy={hoveredPoint.y}
              r="3"
              fill="#FFD541"
              stroke="#fff"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* Gradient definition */}
          <defs>
            <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFD541" />
              <stop offset="100%" stopColor="#FFD541" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>

        {/* Tooltip */}
        {hoveredPoint && (
          <div
            className="absolute pointer-events-none bg-neutral-900 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap z-10"
            style={{
              left: `${hoveredPoint.x}%`,
              top: `${hoveredPoint.y}%`,
              transform: 'translate(-50%, -130%)',
            }}
          >
            <div className="font-medium">{hoveredPoint.data.date.slice(5).replace('-', '/')}</div>
            <div>누적: {hoveredPoint.data.cumulative.toLocaleString()}명</div>
            <div>신규: +{hoveredPoint.data.count}명</div>
          </div>
        )}
      </div>

      {/* X-axis labels */}
      <div className="absolute left-12 right-0 bottom-0 h-6 flex justify-between text-[11px] text-neutral-400">
        {xLabels.map((label, i) => (
          <span key={i}>{label}</span>
        ))}
      </div>
    </div>
  );
}
