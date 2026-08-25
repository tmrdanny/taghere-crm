'use client';

import React, { useRef, useState } from 'react';

import { ExternalCustomerData, ExternalPeriodType } from './types';

// Line chart component for External Customer stats with hover tooltip
export function ExternalCustomerChart({ data, period }: { data: ExternalCustomerData[]; period: ExternalPeriodType }) {
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; data: ExternalCustomerData } | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  if (data.length === 0) return null;

  const maxValue = Math.max(...data.map((d) => d.count), 1);
  const minValue = 0;

  // Format date label based on period
  const formatLabel = (dateStr: string) => {
    if (period === 'monthly') {
      // YYYY-MM -> M월
      const [year, month] = dateStr.split('-');
      return `${parseInt(month)}월`;
    } else {
      // YYYY-MM-DD -> MM/DD
      return dateStr.slice(5).replace('-', '/');
    }
  };

  // Y-axis labels
  const yLabels = [maxValue, Math.round(maxValue / 2), minValue];

  // Generate line path points
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1 || 1)) * 100;
    const y = 100 - ((d.count - minValue) / (maxValue - minValue || 1)) * 100;
    return { x, y, data: d };
  });

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');

  // Area fill path
  const areaD = `${pathD} L 100 100 L 0 100 Z`;

  // X-axis labels (show a few labels to avoid overcrowding)
  const xLabels =
    data.length > 2
      ? [
          data[0].date,
          data[Math.floor(data.length / 2)].date,
          data[data.length - 1].date,
        ]
      : data.map((d) => d.date);

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
      <div className="absolute left-0 top-0 bottom-6 w-8 flex flex-col justify-between text-[11px] text-neutral-400">
        {yLabels.map((label, i) => (
          <span key={i}>{label}</span>
        ))}
      </div>

      {/* Chart area */}
      <div
        ref={chartRef}
        className="absolute left-10 right-0 top-0 bottom-6 cursor-crosshair"
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
          <path d={areaD} fill="url(#externalGradient)" opacity="0.3" />

          {/* Line */}
          <path
            d={pathD}
            fill="none"
            stroke="#10B981"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />

          {/* Hover point indicator */}
          {hoveredPoint && (
            <circle
              cx={hoveredPoint.x}
              cy={hoveredPoint.y}
              r="3"
              fill="#10B981"
              stroke="#fff"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* Gradient definition */}
          <defs>
            <linearGradient id="externalGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
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
            <div className="font-medium">{formatLabel(hoveredPoint.data.date)}</div>
            <div>수집: {hoveredPoint.data.count}명</div>
          </div>
        )}
      </div>

      {/* X-axis labels */}
      <div className="absolute left-10 right-0 bottom-0 h-6 flex justify-between text-[10px] text-neutral-400 px-1">
        {xLabels.map((dateStr, i) => (
          <span key={i} className="truncate">
            {formatLabel(dateStr)}
          </span>
        ))}
      </div>
    </div>
  );
}
