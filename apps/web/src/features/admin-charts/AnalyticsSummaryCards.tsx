'use client';

import { AnalyticsData } from './types';

export function AnalyticsSummaryCards({ summary }: { summary: AnalyticsData['summary'] }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="bg-white border border-[#EAEAEA] rounded-xl p-4">
        <p className="text-xs text-neutral-500">총 발행 쿠폰</p>
        <p className="text-2xl font-bold text-neutral-900 mt-1">
          {summary.totalIssued.toLocaleString()}
        </p>
        <p className="text-[11px] text-neutral-400 mt-0.5">알림톡 발송 성공 건수</p>
      </div>
      <div className="bg-white border border-[#EAEAEA] rounded-xl p-4">
        <p className="text-xs text-neutral-500">발송 실패</p>
        <p className="text-2xl font-bold text-red-600 mt-1">
          {summary.totalFailed.toLocaleString()}
        </p>
      </div>
      <div className="bg-white border border-[#EAEAEA] rounded-xl p-4">
        <p className="text-xs text-neutral-500">발송 성공률</p>
        <p className="text-2xl font-bold text-emerald-600 mt-1">
          {summary.successRate}%
        </p>
        <p className="text-[11px] text-neutral-400 mt-0.5">성공 / (성공+실패)</p>
      </div>
    </div>
  );
}
