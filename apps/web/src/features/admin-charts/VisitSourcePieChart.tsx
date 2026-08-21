'use client';

import { useState } from 'react';

import { VisitSourceDistribution } from './types';
import { CHART_COLORS } from './utils';

// Visit Source Pie Chart
export function VisitSourcePieChart({ data }: { data: VisitSourceDistribution[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (data.length === 0) return null;

  const total = data.reduce((sum, d) => sum + d.count, 0);
  let currentAngle = -90; // Start from top

  const slices = data.map((d, i) => {
    const angle = (d.count / total) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    currentAngle = endAngle;

    // Calculate path
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    const largeArc = angle > 180 ? 1 : 0;

    const x1 = 50 + 40 * Math.cos(startRad);
    const y1 = 50 + 40 * Math.sin(startRad);
    const x2 = 50 + 40 * Math.cos(endRad);
    const y2 = 50 + 40 * Math.sin(endRad);

    // For hover effect - slightly larger radius
    const hoverX1 = 50 + 42 * Math.cos(startRad);
    const hoverY1 = 50 + 42 * Math.sin(startRad);
    const hoverX2 = 50 + 42 * Math.cos(endRad);
    const hoverY2 = 50 + 42 * Math.sin(endRad);

    const isHovered = hoveredIndex === i;
    const pathD = isHovered
      ? `M 50 50 L ${hoverX1} ${hoverY1} A 42 42 0 ${largeArc} 1 ${hoverX2} ${hoverY2} Z`
      : `M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`;

    // Label position (center of arc)
    const midAngle = (startAngle + endAngle) / 2;
    const midRad = (midAngle * Math.PI) / 180;
    const labelRadius = 25;
    const labelX = 50 + labelRadius * Math.cos(midRad);
    const labelY = 50 + labelRadius * Math.sin(midRad);

    return {
      pathD,
      color: CHART_COLORS[i % CHART_COLORS.length],
      label: d.label,
      count: d.count,
      percentage: d.percentage,
      labelX,
      labelY,
    };
  });

  return (
    <div className="w-full h-full flex">
      {/* Pie Chart */}
      <div className="w-1/2 h-full relative">
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {slices.map((slice, i) => (
            <path
              key={i}
              d={slice.pathD}
              fill={slice.color}
              stroke="#fff"
              strokeWidth="0.5"
              opacity={hoveredIndex === null || hoveredIndex === i ? 1 : 0.5}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              className="cursor-pointer transition-opacity"
            />
          ))}
        </svg>
      </div>

      {/* Legend */}
      <div className="w-1/2 h-full overflow-y-auto pl-4">
        <div className="space-y-2">
          {data.map((d, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 text-[12px] cursor-pointer transition-opacity ${
                hoveredIndex === null || hoveredIndex === i ? 'opacity-100' : 'opacity-50'
              }`}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <div
                className="w-3 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
              />
              <span className="text-neutral-700 truncate flex-1">{d.label}</span>
              <span className="text-neutral-500 whitespace-nowrap">
                {d.count}명 ({d.percentage.toFixed(1)}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
