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
      className="ad-card ad-press mb-4 cursor-pointer transition-shadow hover:shadow-[0_0_0_1px_var(--ad-line-strong)]"
      onClick={onNavigate}
    >
      {/* 상단: 타이틀 + CTA */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
          <span className="text-[14px] font-semibold text-[color:var(--ad-ink)]">놓치고 있는 고객이 있어요</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)] sm:inline">월 30건 무료</span>
          <div className="inline-flex h-8 items-center gap-1 rounded-[10px] bg-white px-3 text-[12.5px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] transition-colors hover:bg-[color:var(--ad-bg-alt)]">
            시작하기
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      {/* 하단: 3개 지표 카드 */}
      <div className="mx-5 mb-4 mt-1 grid grid-cols-3 rounded-[12px] bg-[color:var(--ad-bg-alt)]">
        <div className="p-3 text-center [&+&]:border-l [&+&]:border-[color:var(--ad-line)]">
          <HandMetal className="mx-auto mb-1 h-4 w-4 text-[color:var(--ad-faint)]" />
          <p className="ad-tnum text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">{automationStatus.previews?.FIRST_VISIT_FOLLOWUP?.thisMonthEstimate ?? 0}명</p>
          <p className="mt-0.5 text-[12px] text-[color:var(--ad-muted)]">첫 방문 · 재방문 쿠폰 미발송</p>
        </div>
        <div className="p-3 text-center [&+&]:border-l [&+&]:border-[color:var(--ad-line)]">
          <Cake className="mx-auto mb-1 h-4 w-4 text-[color:var(--ad-faint)]" />
          <p className="ad-tnum text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">{automationStatus.previews?.BIRTHDAY?.thisMonthEstimate ?? 0}명</p>
          <p className="mt-0.5 text-[12px] text-[color:var(--ad-muted)]">이번 달 생일 · 축하 미발송</p>
        </div>
        <div className="p-3 text-center [&+&]:border-l [&+&]:border-[color:var(--ad-line)]">
          <Bell className="mx-auto mb-1 h-4 w-4 text-[color:var(--ad-faint)]" />
          <p className="ad-tnum text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">{automationStatus.previews?.CHURN_PREVENTION?.thisMonthEstimate ?? 0}명</p>
          <p className="mt-0.5 text-[12px] text-[color:var(--ad-muted)]">이탈 위험 · 쿠폰 없이 이탈 중</p>
        </div>
      </div>
    </div>
  );
}
