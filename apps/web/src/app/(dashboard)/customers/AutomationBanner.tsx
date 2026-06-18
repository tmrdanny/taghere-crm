import { Zap, ArrowRight, HandMetal, Cake, Bell } from 'lucide-react';

interface AutomationStatus {
  hasActiveRules: boolean;
  previews: Record<string, { totalEligible: number; thisMonthEstimate: number }> | null;
}

// 자동 마케팅 미설정 시 노출되는 유도 배너.
export function AutomationBanner({
  automationStatus,
  onNavigate,
}: {
  automationStatus: AutomationStatus | null;
  onNavigate: () => void;
}) {
  if (!automationStatus || automationStatus.hasActiveRules) return null;
  return (
    <div
      className="mb-6 rounded-xl bg-gradient-to-r from-brand-50 via-white to-orange-50 border border-brand-200 cursor-pointer hover:shadow-lg transition-all"
      onClick={onNavigate}
    >
      {/* 상단: 타이틀 + CTA */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-brand-100 rounded-lg">
            <Zap className="w-4 h-4 text-brand-700" />
          </div>
          <span className="text-base font-bold text-neutral-900">놓치고 있는 고객이 있어요</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline text-xs font-medium text-brand-600 bg-brand-100 px-2.5 py-1 rounded-full">월 30건 무료</span>
          <div className="flex items-center gap-1 text-sm font-semibold text-white bg-brand-700 px-3 py-1.5 rounded-lg hover:bg-brand-800 transition-colors">
            시작하기
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      {/* 하단: 3개 지표 카드 */}
      <div className="grid grid-cols-3 gap-3 px-5 pb-4 pt-1">
        <div className="bg-white/80 border border-neutral-100 rounded-lg p-3 text-center">
          <HandMetal className="w-4 h-4 text-neutral-400 mx-auto mb-1" />
          <p className="text-xl font-bold text-neutral-900">{automationStatus.previews?.FIRST_VISIT_FOLLOWUP?.thisMonthEstimate ?? 0}명</p>
          <p className="text-sm text-neutral-500 mt-1">첫 방문 · 재방문 쿠폰 미발송</p>
        </div>
        <div className="bg-white/80 border border-neutral-100 rounded-lg p-3 text-center">
          <Cake className="w-4 h-4 text-neutral-400 mx-auto mb-1" />
          <p className="text-xl font-bold text-neutral-900">{automationStatus.previews?.BIRTHDAY?.thisMonthEstimate ?? 0}명</p>
          <p className="text-sm text-neutral-500 mt-1">이번 달 생일 · 축하 미발송</p>
        </div>
        <div className="bg-white/80 border border-neutral-100 rounded-lg p-3 text-center">
          <Bell className="w-4 h-4 text-neutral-400 mx-auto mb-1" />
          <p className="text-xl font-bold text-neutral-900">{automationStatus.previews?.CHURN_PREVENTION?.thisMonthEstimate ?? 0}명</p>
          <p className="text-sm text-neutral-500 mt-1">이탈 위험 · 쿠폰 없이 이탈 중</p>
        </div>
      </div>
    </div>
  );
}
