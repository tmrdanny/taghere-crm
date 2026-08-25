'use client';

import React, { useRef, useState } from 'react';

import { AnalyticsData } from './types';
import { CHART_PALETTE } from './utils';

export function DailyIssuedChart({
  dates,
  brands,
}: {
  dates: string[];
  brands: AnalyticsData['dailyTrendByBrand'];
}) {
  const [hoveredX, setHoveredX] = useState<number | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  if (dates.length === 0) {
    return <p className="text-center text-sm text-neutral-400 py-8">데이터가 없습니다.</p>;
  }

  // 전체 최대값 (브랜드 중 가장 높은 일자 값)
  const max = Math.max(
    1,
    ...brands.flatMap((b) => b.series),
  );

  const yLabels = [max, Math.round(max / 2), 0];
  const xLabels =
    dates.length > 2
      ? [dates[0].slice(5), dates[Math.floor(dates.length / 2)].slice(5), dates[dates.length - 1].slice(5)]
      : dates.map((d) => d.slice(5));

  // 각 브랜드의 path 생성
  const brandPaths = brands.map((brand, idx) => {
    const points = brand.series.map((value, i) => {
      const x = (i / (dates.length - 1 || 1)) * 100;
      const y = 100 - (value / max) * 100;
      return { x, y, value };
    });
    const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    return {
      ...brand,
      path,
      points,
      color: CHART_PALETTE[idx % CHART_PALETTE.length],
    };
  });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!chartRef.current) return;
    const rect = chartRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    // 가장 가까운 날짜 인덱스
    const idx = Math.round((x / 100) * (dates.length - 1));
    setHoveredX(Math.max(0, Math.min(dates.length - 1, idx)));
  };

  const hoveredDate = hoveredX !== null ? dates[hoveredX] : null;
  const hoveredXPercent = hoveredX !== null ? (hoveredX / (dates.length - 1 || 1)) * 100 : 0;

  return (
    <div className="w-full">
      {/* 범례 */}
      {brandPaths.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-2 text-xs">
          {brandPaths.map((b) => (
            <div key={b.brandId} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: b.color }} />
              <span className="text-neutral-700">{b.brandName}</span>
            </div>
          ))}
        </div>
      )}

      <div className="w-full h-[240px] relative">
        <div className="absolute left-0 top-0 bottom-6 w-10 flex flex-col justify-between text-[11px] text-neutral-400">
          {yLabels.map((l, i) => (
            <span key={i}>{l.toLocaleString()}</span>
          ))}
        </div>
        <div
          ref={chartRef}
          className="absolute left-12 right-0 top-0 bottom-6 cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoveredX(null)}
        >
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
            {/* 가로 그리드 */}
            <line x1="0" y1="0" x2="100" y2="0" stroke="#E5E5E5" strokeWidth="0.5" />
            <line x1="0" y1="50" x2="100" y2="50" stroke="#E5E5E5" strokeWidth="0.5" />
            <line x1="0" y1="100" x2="100" y2="100" stroke="#E5E5E5" strokeWidth="0.5" />

            {/* 브랜드별 라인 */}
            {brandPaths.map((b) => (
              <path
                key={b.brandId}
                d={b.path}
                fill="none"
                stroke={b.color}
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {/* 호버 라인 */}
            {hoveredX !== null && (
              <>
                <line
                  x1={hoveredXPercent}
                  y1="0"
                  x2={hoveredXPercent}
                  y2="100"
                  stroke="#9CA3AF"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                  strokeDasharray="4 4"
                />
                {brandPaths.map((b) => {
                  const p = b.points[hoveredX];
                  if (!p) return null;
                  return (
                    <circle
                      key={b.brandId}
                      cx={p.x}
                      cy={p.y}
                      r="4"
                      fill={b.color}
                      stroke="white"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })}
              </>
            )}
          </svg>

          {/* 툴팁 */}
          {hoveredX !== null && hoveredDate && brandPaths.length > 0 && (
            <div
              className="absolute bg-neutral-900 text-white text-[12px] px-3 py-2 rounded-lg shadow-lg pointer-events-none z-10"
              style={{
                left: `${Math.min(Math.max(hoveredXPercent, 15), 85)}%`,
                top: '-8px',
                transform: 'translate(-50%, -100%)',
              }}
            >
              <p className="font-medium mb-1">{hoveredDate}</p>
              {brandPaths.map((b) => (
                <p key={b.brandId} style={{ color: b.color }}>
                  {b.brandName}: {b.points[hoveredX]?.value.toLocaleString() || 0}건
                </p>
              ))}
            </div>
          )}
        </div>
        <div className="absolute left-12 right-0 bottom-0 flex justify-between text-[11px] text-neutral-400">
          {xLabels.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
