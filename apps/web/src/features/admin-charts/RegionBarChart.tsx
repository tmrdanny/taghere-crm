'use client';

import { AnalyticsData } from './types';
import { CHART_PALETTE } from './utils';

export function RegionBarChart({ data }: { data: AnalyticsData['demographics']['byRegion'] }) {
  if (data.length === 0) {
    return <p className="text-center text-sm text-neutral-400 py-8">데이터가 없습니다.</p>;
  }
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => {
        const width = (d.count / max) * 100;
        return (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-28 truncate text-neutral-700" title={d.region}>
              {d.region}
            </span>
            <div className="flex-1 h-4 bg-neutral-100 rounded overflow-hidden">
              <div
                className="h-full rounded"
                style={{
                  width: `${width}%`,
                  backgroundColor: CHART_PALETTE[i % CHART_PALETTE.length],
                }}
              />
            </div>
            <span className="w-10 text-right text-neutral-600 font-medium">{d.count}</span>
          </div>
        );
      })}
    </div>
  );
}
