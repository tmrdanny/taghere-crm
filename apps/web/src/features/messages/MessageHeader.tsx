import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/utils';

// 캠페인 메시지 작성 헤더: 채널 탭 전환 + 가치 제안/무료 크레딧 배너.
export function MessageHeader({
  activeTab,
  onTabChange,
  targetCount,
  freeCreditsRemaining,
}: {
  activeTab: 'sms' | 'kakao';
  onTabChange: (tab: 'sms' | 'kakao') => void;
  targetCount: number;
  freeCreditsRemaining: number | undefined;
}) {
  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 pb-5 border-b border-[#e5e7eb]">
        <h1 className="whitespace-nowrap text-lg sm:text-xl font-bold text-[#1e293b]">캠페인 메시지 만들기</h1>
        <div className="flex max-w-full overflow-x-auto bg-[#f1f5f9] rounded-lg p-1">
          {([
            ['kakao', '카카오톡'],
            ['sms', '문자 (SMS/LMS)'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => onTabChange(key)}
              className={cn(
                'px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold rounded-md transition-all whitespace-nowrap',
                activeTab === key
                  ? 'bg-white shadow-sm text-[#1e293b]'
                  : 'text-[#64748b] hover:text-[#1e293b]'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Value Proposition Banner */}
      <div className="flex items-center gap-3 px-4 py-4 bg-gradient-to-r from-emerald-50 to-blue-50 border border-emerald-100 rounded-xl">
        <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-emerald-800">
            {formatNumber(targetCount)}명의 고객에게 메시지를 보내보세요
          </p>
          <p className="text-xs text-emerald-600 mt-0.5">
            1명만 재방문해도 평균 25,000원 매출 발생
          </p>
        </div>
      </div>

      {/* Free Credits Banner */}
      {freeCreditsRemaining !== undefined && freeCreditsRemaining > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="w-6 h-6 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-xs">🎁</span>
          </div>
          <p className="text-sm text-amber-800">
            <span className="font-semibold">무료 크레딧 {freeCreditsRemaining}건</span> 남았어요!
          </p>
        </div>
      )}
    </>
  );
}
