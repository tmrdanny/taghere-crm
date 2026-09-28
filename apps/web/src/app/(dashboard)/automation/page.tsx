'use client';

import { API_BASE } from '@/lib/api-config';
import { useEffect, useState } from 'react';
import { trackEvent } from '@/lib/analytics';
import { useRouter } from 'next/navigation';
import { Switch } from '@/components/ui/switch';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalTitle,
  ModalDescription,
} from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import {
  Cake,
  Bell,
  Heart,
  HandMetal,
  Star,
  Moon,
  Calendar,
  ChevronRight,
  Send,
  Gift,
  TrendingUp,
  Info,
  Zap,
  AlertTriangle,
} from 'lucide-react';


interface AutomationRule {
  id: string;
  type: string;
  enabled: boolean;
  triggerConfig: any;
  couponEnabled: boolean;
  couponContent: string | null;
  couponValidDays: number;
  cooldownDays: number;
  sendTimeHour: number;
}

interface RuleStat {
  ruleId: string;
  type: string;
  monthlySent: number;
  monthlyCouponUsed: number;
  usageRate: number;
}

interface Dashboard {
  totalSent: number;
  totalCouponUsed: number;
  usageRate: number;
  estimatedRevenue: number;
}

interface PreviewData {
  totalEligible: number;
  thisMonthEstimate: number;
  estimatedMonthlyCost: number;
}

interface PreviewAllResponse {
  previews: Record<string, PreviewData>;
  hasNaverPlaceUrl: boolean;
}

// 시나리오 메타 정보 (추천 순서로 정렬)
const SCENARIOS = [
  {
    type: 'BIRTHDAY',
    label: '생일 축하',
    icon: Cake,
    description: '생일 3일 전, 축하 쿠폰을 자동 발송합니다',
    available: true,
    recommended: true,
    best: true,
    targetLabel: '생일 정보 고객',
  },
  {
    type: 'CHURN_PREVENTION',
    label: '이탈 방지',
    icon: Bell,
    description: '30일 이상 미방문 고객에게 재방문 쿠폰 발송',
    available: true,
    recommended: true,
    best: false,
    targetLabel: '이탈 위험 고객',
  },
  {
    type: 'FIRST_VISIT_FOLLOWUP',
    label: '첫 방문 팔로업',
    icon: HandMetal,
    description: '첫 방문 3일 후, 감사 메시지 + 재방문 쿠폰',
    available: true,
    recommended: true,
    best: true,
    targetLabel: '첫 방문 고객',
  },
  {
    type: 'ANNIVERSARY',
    label: '가입 기념일',
    icon: Heart,
    description: '가입 기념일 3일 전, 축하 쿠폰을 자동 발송합니다',
    available: true,
    recommended: false,
    targetLabel: '등록 고객',
  },
  {
    type: 'VIP_MILESTONE',
    label: 'VIP 마일스톤',
    icon: Star,
    description: '방문 10회, 50회 등 마일스톤 달성 시 감사 쿠폰',
    available: true,
    recommended: false,
    targetLabel: 'VIP 후보 고객',
  },
  {
    type: 'WINBACK',
    label: '장기 미방문 윈백',
    icon: Moon,
    description: '90일 이상 장기 미방문 고객 특별 할인',
    available: true,
    recommended: false,
    targetLabel: '장기 미방문 고객',
  },
  {
    type: 'SLOW_DAY',
    label: '비수기 프로모션',
    icon: Calendar,
    description: '설정한 비수기 요일에 자동 프로모션 발송',
    available: true,
    recommended: false,
    targetLabel: '프로모션 대상 고객',
  },
];

const QUICK_START_TYPES = ['BIRTHDAY', 'CHURN_PREVENTION', 'FIRST_VISIT_FOLLOWUP'];

const PLATFORM_BENCHMARKS = {
  couponUsageRate: 38,
  revisitConversion: 27,
  roiMultiplier: 6,
};

export default function AutomationPage() {
  const router = useRouter();
  const { showToast, ToastComponent } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [stats, setStats] = useState<RuleStat[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [previewAll, setPreviewAll] = useState<PreviewAllResponse | null>(null);
  const [togglingType, setTogglingType] = useState<string | null>(null);
  const [quickStarting, setQuickStarting] = useState(false);
  const [showQuickStartModal, setShowQuickStartModal] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const [rulesRes, dashboardRes, previewAllRes] = await Promise.all([
        fetch(`${API_BASE}/api/automation/rules`, { headers }),
        fetch(`${API_BASE}/api/automation/dashboard`, { headers }),
        fetch(`${API_BASE}/api/automation/preview-all`, { headers }),
      ]);

      if (rulesRes.ok) {
        const data = await rulesRes.json();
        setRules(data.rules);
        setStats(data.stats);
      }

      if (dashboardRes.ok) {
        const data = await dashboardRes.json();
        setDashboard(data);
      }

      if (previewAllRes.ok) {
        const data = await previewAllRes.json();
        setPreviewAll(data);
      }
    } catch (error) {
      console.error('Failed to fetch automation data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = async (type: string, enabled: boolean) => {
    // ON 시 쿠폰 내용 필수 — 비어 있으면 상세 페이지로 유도
    if (enabled) {
      const rule = rules.find((r) => r.type === type);
      if (!rule?.couponContent?.trim()) {
        showToast('쿠폰 내용을 입력해주세요. 상세 설정으로 이동합니다.', 'error');
        router.push(`/automation/${type}`);
        return;
      }
    }
    setTogglingType(type);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/automation/rules/${type}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled }),
      });

      if (res.ok) {
        trackEvent('owner_automation_toggle', { rule_type: type, enabled });
        setRules((prev) =>
          prev.map((r) => (r.type === type ? { ...r, enabled } : r))
        );
        showToast(
          enabled ? '자동 마케팅이 활성화되었습니다.' : '자동 마케팅이 비활성화되었습니다.',
          'success'
        );
      } else {
        const error = await res.json();
        showToast(error.error || '설정 변경에 실패했습니다.', 'error');
        // 서버 검증에서 쿠폰 내용 누락으로 거부된 경우에도 상세 설정으로 유도
        if (error.code === 'coupon_content_required') {
          router.push(`/automation/${type}`);
        }
      }
    } catch (error) {
      console.error('Failed to toggle automation:', error);
      showToast('설정 변경에 실패했습니다.', 'error');
    } finally {
      setTogglingType(null);
    }
  };

  const handleQuickStart = async () => {
    if (!previewAll?.hasNaverPlaceUrl) {
      showToast('네이버 플레이스 링크가 없으면 자동 마케팅을 활성화할 수 없습니다. 매장 설정에서 입력해주세요.', 'error');
      return;
    }

    // 쿠폰 내용이 비어있는 시나리오가 있으면 먼저 입력 유도
    const missingContent = QUICK_START_TYPES.find(
      (type) => !rules.find((r) => r.type === type)?.couponContent?.trim()
    );
    if (missingContent) {
      showToast('쿠폰 내용을 입력해주세요. 상세 설정으로 이동합니다.', 'error');
      setShowQuickStartModal(false);
      router.push(`/automation/${missingContent}`);
      return;
    }

    setQuickStarting(true);
    try {
      const token = localStorage.getItem('token');
      const results = await Promise.all(
        QUICK_START_TYPES.map((type) =>
          fetch(`${API_BASE}/api/automation/rules/${type}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ enabled: true }),
          })
        )
      );

      const allOk = results.every((r) => r.ok);
      if (allOk) {
        trackEvent('owner_automation_quickstart', { rule_count: QUICK_START_TYPES.length });
        showToast('추천 시나리오 3개가 활성화되었습니다!', 'success');
        setRules((prev) =>
          prev.map((r) =>
            QUICK_START_TYPES.includes(r.type) ? { ...r, enabled: true } : r
          )
        );
      } else {
        const failedRes = results.find((r) => !r.ok);
        const errorData = await failedRes?.json();
        showToast(errorData?.error || '일부 시나리오 활성화에 실패했습니다.', 'error');
      }
    } catch (error) {
      console.error('Quick start failed:', error);
      showToast('시나리오 활성화에 실패했습니다.', 'error');
    } finally {
      setQuickStarting(false);
      setShowQuickStartModal(false);
    }
  };

  const getRuleByType = (type: string) => rules.find((r) => r.type === type);
  const getStatByType = (type: string) => stats.find((s) => s.type === type);

  const hasActiveRules = rules.some((r) => r.enabled);

  const quickStartEstimatedCost = QUICK_START_TYPES.reduce((sum, type) => {
    const preview = previewAll?.previews[type];
    return sum + (preview?.estimatedMonthlyCost || 0);
  }, 0);

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 sm:px-8 lg:pt-8">
        <div className="py-12 text-center text-[13px] text-[color:var(--ad-faint)]">불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 sm:px-8 lg:pt-8">
      {ToastComponent}

      {/* 헤더 */}
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-[color:var(--ad-ink)]">자동 마케팅</h1>
        <p className="mt-1 text-[13px] text-[color:var(--ad-muted)]">
          ON/OFF만 설정하면, 고객에게 자동으로 쿠폰이 발송됩니다
        </p>
      </div>

      {/* 히어로 섹션 - 활성 룰이 없을 때만 */}
      {!hasActiveRules && (
        <div className="ad-card mb-4 p-5">
          <div className="mb-5">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--ad-bg)] px-2.5 py-1 text-[12px] font-medium text-[color:var(--ad-muted)]">
                <Zap className="h-3 w-3" strokeWidth={2} />
                자동 마케팅 꺼짐
              </span>
              <h2 className="mt-3 text-[20px] font-semibold tracking-[-0.03em] text-[color:var(--ad-ink)]">
                자동 마케팅으로 매출을 올려보세요
              </h2>
              <p className="mt-1 text-[13px] text-[color:var(--ad-muted)]">
                ON/OFF만 설정하면 끝! 고객에게 자동으로 쿠폰이 발송되어 재방문을 유도합니다.
              </p>
            </div>
          </div>

          {/* 플랫폼 벤치마크 */}
          <div className="mb-2 grid grid-cols-3 rounded-[12px] border border-[color:var(--ad-line)]">
            <div className="p-4 text-center">
              <div className="mb-1 text-[12px] text-[color:var(--ad-muted)]">쿠폰 사용률</div>
              <div className="ad-tnum text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">
                {PLATFORM_BENCHMARKS.couponUsageRate}%
              </div>
            </div>
            <div className="border-l border-[color:var(--ad-line)] p-4 text-center">
              <div className="mb-1 text-[12px] text-[color:var(--ad-muted)]">재방문 전환</div>
              <div className="ad-tnum text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">
                {PLATFORM_BENCHMARKS.revisitConversion}%
              </div>
            </div>
            <div className="border-l border-[color:var(--ad-line)] p-4 text-center">
              <div className="mb-1 text-[12px] text-[color:var(--ad-muted)]">투자 대비 효과</div>
              <div className="ad-tnum text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">
                ROI {PLATFORM_BENCHMARKS.roiMultiplier}x
              </div>
            </div>
          </div>
          <p className="mb-5 text-center text-[11px] text-[color:var(--ad-faint)]">
            태그히어 플랫폼 평균 데이터
          </p>

          {/* 빠른 시작 CTA */}
          <button
            onClick={() => setShowQuickStartModal(true)}
            className="ad-press inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-[12px] bg-[color:var(--ad-ink)] px-5 text-[14px] font-semibold text-white hover:bg-[#383c40]"
          >
            <Zap className="h-4 w-4" />
            추천 시나리오 한번에 켜기
          </button>
        </div>
      )}

      {/* 이번 달 성과 대시보드 - 활성 룰이 있을 때 */}
      {hasActiveRules && dashboard && (dashboard.totalSent > 0 || rules.some((r) => r.enabled)) && (
        <div className="ad-card mb-4">
          <div className="grid grid-cols-3">
            <div className="p-5">
              <div className="mb-1 flex items-center gap-1.5 text-[12px] text-[color:var(--ad-muted)]">
                <Send className="h-3.5 w-3.5" />
                <span>자동 발송</span>
              </div>
              <div className="ad-tnum text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">
                {dashboard.totalSent}건
              </div>
            </div>
            <div className="border-l border-[color:var(--ad-line)] p-5">
              <div className="mb-1 flex items-center gap-1.5 text-[12px] text-[color:var(--ad-muted)]">
                <Gift className="h-3.5 w-3.5" />
                <span>쿠폰 사용</span>
              </div>
              <div className="ad-tnum text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">
                {dashboard.totalCouponUsed}건
                <span className="ml-1 text-[13px] font-normal text-[color:var(--ad-muted)]">
                  ({dashboard.usageRate}%)
                </span>
              </div>
            </div>
            <div className="border-l border-[color:var(--ad-line)] p-5">
              <div className="mb-1 flex items-center gap-1.5 text-[12px] text-[color:var(--ad-muted)]">
                <TrendingUp className="h-3.5 w-3.5" />
                <span>추정 매출</span>
              </div>
              <div className="ad-tnum text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">
                {dashboard.estimatedRevenue > 0
                  ? `${dashboard.estimatedRevenue.toLocaleString()}원`
                  : '-'}
              </div>
            </div>
          </div>

          {/* 벤치마크 비교 */}
          {dashboard.totalSent > 0 && (
            <div className="border-t border-[color:var(--ad-line)] px-5 py-3">
              <p className="text-[13px] text-[color:var(--ad-ink-2)]">
                이번 달 발송 {dashboard.totalSent}건 중 {dashboard.totalCouponUsed}건 사용
                ({dashboard.usageRate}%)
                <span className={`ml-1 font-medium ${
                  dashboard.usageRate >= PLATFORM_BENCHMARKS.couponUsageRate
                    ? 'text-[color:var(--ad-pos)]'
                    : 'text-[color:var(--ad-faint)]'
                }`}>
                  — 태그히어 평균 대비{' '}
                  {dashboard.usageRate >= PLATFORM_BENCHMARKS.couponUsageRate ? '+' : ''}
                  {dashboard.usageRate - PLATFORM_BENCHMARKS.couponUsageRate}%p
                </span>
              </p>
            </div>
          )}
        </div>
      )}

      {/* 시나리오 목록 */}
      <div className="ad-card overflow-hidden">
        <div className="divide-y divide-[color:var(--ad-line)]">
        {SCENARIOS.map((scenario) => {
          const rule = getRuleByType(scenario.type);
          const stat = getStatByType(scenario.type);
          const preview = previewAll?.previews[scenario.type];
          const Icon = scenario.icon;

          return (
            <div
              key={scenario.type}
              className={`px-5 py-4 ${!scenario.available ? 'opacity-60' : ''}`}
            >
                <div className="flex items-center gap-4">
                  {/* 아이콘 */}
                  <Icon
                    className={`h-4 w-4 flex-shrink-0 ${
                      rule?.enabled ? 'text-[color:var(--ad-ink)]' : 'text-[color:var(--ad-faint)]'
                    }`}
                    strokeWidth={1.8}
                  />

                  {/* 내용 */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">
                        {scenario.label}
                      </h3>
                      {scenario.best ? (
                        <span className="inline-flex rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">Best</span>
                      ) : scenario.recommended ? (
                        <span className="inline-flex rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">추천</span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[13px] text-[color:var(--ad-muted)]">
                      {scenario.description}
                    </p>

                    {/* 비활성 상태: 대상 고객 수 표시 */}
                    {scenario.available && !rule?.enabled && preview && preview.thisMonthEstimate > 0 && (
                      <p className="mt-1 text-[12px] font-medium text-[color:var(--ad-ink-2)]">
                        내 매장 대상 고객 {preview.thisMonthEstimate}명
                        {preview.estimatedMonthlyCost > 0 && (
                          <span className="font-normal text-[color:var(--ad-faint)]">
                            {' '}· 예상 비용 ~{preview.estimatedMonthlyCost.toLocaleString()}원/월
                          </span>
                        )}
                      </p>
                    )}

                    {/* 활성 상태: 이번 달 실적 */}
                    {scenario.available && rule?.enabled && stat && stat.monthlySent > 0 && (
                      <p className="mt-1 text-[12px] text-[color:var(--ad-faint)]">
                        이번 달: {stat.monthlySent}건 발송, {stat.monthlyCouponUsed}건 사용 ({stat.usageRate}%)
                      </p>
                    )}
                  </div>

                  {/* ON/OFF 토글 또는 곧 출시 */}
                  {scenario.available ? (
                    <div className="flex flex-shrink-0 items-center gap-3">
                      <Switch
                        checked={rule?.enabled || false}
                        onCheckedChange={(checked) =>
                          handleToggle(scenario.type, checked)
                        }
                        disabled={togglingType === scenario.type}
                      />
                      <button
                        onClick={() =>
                          router.push(`/automation/${scenario.type}`)
                        }
                        className="ad-press rounded-[8px] p-1.5 text-[color:var(--ad-faint)] transition-colors hover:bg-[color:var(--ad-bg-alt)] hover:text-[color:var(--ad-ink-2)]"
                      >
                        <ChevronRight className="h-5 w-5" />
                      </button>
                    </div>
                  ) : (
                    <span className="inline-flex flex-shrink-0 rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">
                      곧 출시
                    </span>
                  )}
                </div>
            </div>
          );
        })}
        </div>
      </div>

      {/* 과금 안내 (리프레이밍) */}
      <div className="mt-4 flex items-start gap-2 rounded-[12px] bg-[color:var(--ad-bg-alt)] px-4 py-3 text-[13px] text-[color:var(--ad-muted)]">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
        <p>
          <span className="font-medium text-[color:var(--ad-ink-2)]">월 30건까지 무료!</span>{' '}
          이후 건당 50원 (커피 한잔 가격으로 고객 한 명을 다시 모십니다).
          충전금이 부족하면 자동 발송이 일시 중단됩니다.
        </p>
      </div>

      {/* 빠른 시작 확인 모달 */}
      <Modal open={showQuickStartModal} onOpenChange={setShowQuickStartModal}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>추천 시나리오 활성화</ModalTitle>
            <ModalDescription>
              아래 3개의 시나리오를 한번에 활성화합니다
            </ModalDescription>
          </ModalHeader>

          <div className="space-y-2 py-2">
            {QUICK_START_TYPES.map((type) => {
              const scenario = SCENARIOS.find((s) => s.type === type)!;
              const preview = previewAll?.previews[type];
              const ScenarioIcon = scenario.icon;
              return (
                <div key={type} className="flex items-center gap-3 rounded-[12px] bg-[color:var(--ad-bg-alt)] p-3">
                  <ScenarioIcon className="h-4 w-4 flex-shrink-0 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">
                      {scenario.label}
                    </div>
                    {preview && (
                      <div className="text-[12px] text-[color:var(--ad-muted)]">
                        대상 {preview.thisMonthEstimate}명 · ~{preview.estimatedMonthlyCost.toLocaleString()}원/월
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {quickStartEstimatedCost > 0 && (
            <p className="text-center text-[12px] text-[color:var(--ad-faint)]">
              예상 월 비용: ~{quickStartEstimatedCost.toLocaleString()}원 (무료 30건 적용 전)
            </p>
          )}

          {previewAll && !previewAll.hasNaverPlaceUrl && (
            <div className="mt-2 flex items-start gap-2 rounded-[12px] bg-[color:var(--ad-bg-alt)] px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
              <div>
                <p className="text-[13px] text-[color:var(--ad-muted)]">
                  네이버 플레이스 링크가 설정되지 않았습니다
                </p>
                <button
                  onClick={() => {
                    setShowQuickStartModal(false);
                    router.push('/settings');
                  }}
                  className="mt-1 text-[12.5px] font-medium text-[color:var(--ad-link)] hover:underline"
                >
                  매장 설정에서 입력하기 →
                </button>
              </div>
            </div>
          )}

          <ModalFooter>
            <button
              onClick={() => setShowQuickStartModal(false)}
              className="ad-press inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] bg-white px-3.5 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
            >
              취소
            </button>
            <button
              onClick={handleQuickStart}
              disabled={quickStarting || !previewAll?.hasNaverPlaceUrl}
              className="ad-press inline-flex h-10 items-center justify-center gap-1.5 rounded-[12px] bg-[color:var(--ad-ink)] px-4 text-[13.5px] font-semibold text-white hover:bg-[#383c40] disabled:opacity-40"
            >
              {quickStarting ? '활성화 중...' : '3개 시나리오 켜기'}
            </button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
