'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

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
    targetLabel: '생일 정보 고객',
  },
  {
    type: 'CHURN_PREVENTION',
    label: '이탈 방지',
    icon: Bell,
    description: '30일 이상 미방문 고객에게 재방문 쿠폰 발송',
    available: true,
    recommended: true,
    targetLabel: '이탈 위험 고객',
  },
  {
    type: 'FIRST_VISIT_FOLLOWUP',
    label: '첫 방문 팔로업',
    icon: HandMetal,
    description: '첫 방문 3일 후, 감사 메시지 + 재방문 쿠폰',
    available: true,
    recommended: true,
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
        fetch(`${apiUrl}/api/automation/rules`, { headers }),
        fetch(`${apiUrl}/api/automation/dashboard`, { headers }),
        fetch(`${apiUrl}/api/automation/preview-all`, { headers }),
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
    setTogglingType(type);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${apiUrl}/api/automation/rules/${type}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled }),
      });

      if (res.ok) {
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

    setQuickStarting(true);
    try {
      const token = localStorage.getItem('token');
      const results = await Promise.all(
        QUICK_START_TYPES.map((type) =>
          fetch(`${apiUrl}/api/automation/rules/${type}`, {
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
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        <div className="text-center py-12 text-neutral-500">불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      {ToastComponent}

      {/* 헤더 */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-neutral-900">자동 마케팅</h1>
        <p className="text-neutral-500 mt-1">
          ON/OFF만 설정하면, 고객에게 자동으로 쿠폰이 발송됩니다
        </p>
      </div>

      {/* 히어로 섹션 - 활성 룰이 없을 때만 */}
      {!hasActiveRules && (
        <Card className="mb-6 border-brand-200 bg-gradient-to-br from-brand-50 to-white">
          <CardContent className="pt-6 pb-6">
            <div className="flex items-start gap-3 mb-5">
              <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center flex-shrink-0">
                <Zap className="w-5 h-5 text-brand-700" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-neutral-900">
                  자동 마케팅으로 매출을 올려보세요
                </h2>
                <p className="text-sm text-neutral-500 mt-1">
                  ON/OFF만 설정하면 끝! 고객에게 자동으로 쿠폰이 발송되어 재방문을 유도합니다.
                </p>
              </div>
            </div>

            {/* 플랫폼 벤치마크 */}
            <div className="grid grid-cols-3 gap-3 mb-2">
              <div className="bg-white rounded-lg p-3 text-center border border-neutral-100">
                <div className="text-xs text-neutral-500 mb-1">쿠폰 사용률</div>
                <div className="text-xl font-bold text-brand-700">
                  {PLATFORM_BENCHMARKS.couponUsageRate}%
                </div>
              </div>
              <div className="bg-white rounded-lg p-3 text-center border border-neutral-100">
                <div className="text-xs text-neutral-500 mb-1">재방문 전환</div>
                <div className="text-xl font-bold text-brand-700">
                  {PLATFORM_BENCHMARKS.revisitConversion}%
                </div>
              </div>
              <div className="bg-white rounded-lg p-3 text-center border border-neutral-100">
                <div className="text-xs text-neutral-500 mb-1">투자 대비 효과</div>
                <div className="text-xl font-bold text-brand-700">
                  ROI {PLATFORM_BENCHMARKS.roiMultiplier}x
                </div>
              </div>
            </div>
            <p className="text-[11px] text-neutral-400 text-center mb-5">
              태그히어 플랫폼 평균 데이터
            </p>

            {/* 빠른 시작 CTA */}
            <Button
              onClick={() => setShowQuickStartModal(true)}
              className="w-full"
              size="lg"
            >
              <Zap className="w-4 h-4 mr-2" />
              추천 시나리오 한번에 켜기
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 이번 달 성과 대시보드 - 활성 룰이 있을 때 */}
      {hasActiveRules && dashboard && (dashboard.totalSent > 0 || rules.some((r) => r.enabled)) && (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="flex items-center justify-center gap-1.5 text-neutral-500 text-sm mb-1">
                  <Send className="w-4 h-4" />
                  <span>자동 발송</span>
                </div>
                <div className="text-2xl font-bold text-neutral-900">
                  {dashboard.totalSent}건
                </div>
              </div>
              <div>
                <div className="flex items-center justify-center gap-1.5 text-neutral-500 text-sm mb-1">
                  <Gift className="w-4 h-4" />
                  <span>쿠폰 사용</span>
                </div>
                <div className="text-2xl font-bold text-neutral-900">
                  {dashboard.totalCouponUsed}건
                  <span className="text-sm font-normal text-neutral-500 ml-1">
                    ({dashboard.usageRate}%)
                  </span>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-center gap-1.5 text-neutral-500 text-sm mb-1">
                  <TrendingUp className="w-4 h-4" />
                  <span>추정 매출</span>
                </div>
                <div className="text-2xl font-bold text-neutral-900">
                  {dashboard.estimatedRevenue > 0
                    ? `${dashboard.estimatedRevenue.toLocaleString()}원`
                    : '-'}
                </div>
              </div>
            </div>

            {/* 벤치마크 비교 */}
            {dashboard.totalSent > 0 && (
              <div className="mt-4 pt-3 border-t border-neutral-100 text-center">
                <p className="text-sm text-neutral-600">
                  이번 달 발송 {dashboard.totalSent}건 중 {dashboard.totalCouponUsed}건 사용
                  ({dashboard.usageRate}%)
                  <span className={`ml-1 font-medium ${
                    dashboard.usageRate >= PLATFORM_BENCHMARKS.couponUsageRate
                      ? 'text-green-600'
                      : 'text-neutral-400'
                  }`}>
                    — 태그히어 평균 대비{' '}
                    {dashboard.usageRate >= PLATFORM_BENCHMARKS.couponUsageRate ? '+' : ''}
                    {dashboard.usageRate - PLATFORM_BENCHMARKS.couponUsageRate}%p
                  </span>
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 시나리오 목록 */}
      <div className="space-y-3">
        {SCENARIOS.map((scenario) => {
          const rule = getRuleByType(scenario.type);
          const stat = getStatByType(scenario.type);
          const preview = previewAll?.previews[scenario.type];
          const Icon = scenario.icon;

          return (
            <Card
              key={scenario.type}
              className={!scenario.available ? 'opacity-60' : ''}
            >
              <CardContent className="py-4 px-5">
                <div className="flex items-center gap-4">
                  {/* 아이콘 */}
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      rule?.enabled
                        ? 'bg-brand-100 text-brand-700'
                        : 'bg-neutral-100 text-neutral-500'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>

                  {/* 내용 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-neutral-900">
                        {scenario.label}
                      </h3>
                      {scenario.recommended && (
                        <Badge variant="success">추천</Badge>
                      )}
                    </div>
                    <p className="text-sm text-neutral-500 mt-0.5">
                      {scenario.description}
                    </p>

                    {/* 비활성 상태: 대상 고객 수 표시 */}
                    {scenario.available && !rule?.enabled && preview && preview.thisMonthEstimate > 0 && (
                      <p className="text-xs text-brand-600 mt-1 font-medium">
                        내 매장 대상 고객 {preview.thisMonthEstimate}명
                        {preview.estimatedMonthlyCost > 0 && (
                          <span className="text-neutral-400 font-normal">
                            {' '}· 예상 비용 ~{preview.estimatedMonthlyCost.toLocaleString()}원/월
                          </span>
                        )}
                      </p>
                    )}

                    {/* 활성 상태: 이번 달 실적 */}
                    {scenario.available && rule?.enabled && stat && stat.monthlySent > 0 && (
                      <p className="text-xs text-neutral-400 mt-1">
                        이번 달: {stat.monthlySent}건 발송, {stat.monthlyCouponUsed}건 사용 ({stat.usageRate}%)
                      </p>
                    )}
                  </div>

                  {/* ON/OFF 토글 또는 곧 출시 */}
                  {scenario.available ? (
                    <div className="flex items-center gap-3 flex-shrink-0">
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
                        className="p-1.5 text-neutral-400 hover:text-neutral-600 rounded-md hover:bg-neutral-50 transition-colors"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-neutral-400 bg-neutral-100 px-2.5 py-1 rounded-full flex-shrink-0">
                      곧 출시
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 과금 안내 (리프레이밍) */}
      <div className="mt-6 flex items-start gap-2 text-sm text-neutral-500 bg-neutral-50 rounded-lg p-4">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <p>
          <span className="font-medium text-neutral-700">월 30건까지 무료!</span>{' '}
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

          <div className="space-y-3 py-2">
            {QUICK_START_TYPES.map((type) => {
              const scenario = SCENARIOS.find((s) => s.type === type)!;
              const preview = previewAll?.previews[type];
              const ScenarioIcon = scenario.icon;
              return (
                <div key={type} className="flex items-center gap-3 p-3 bg-neutral-50 rounded-lg">
                  <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center flex-shrink-0">
                    <ScenarioIcon className="w-4 h-4 text-brand-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-neutral-900">
                      {scenario.label}
                    </div>
                    {preview && (
                      <div className="text-xs text-neutral-500">
                        대상 {preview.thisMonthEstimate}명 · ~{preview.estimatedMonthlyCost.toLocaleString()}원/월
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {quickStartEstimatedCost > 0 && (
            <p className="text-xs text-neutral-400 text-center">
              예상 월 비용: ~{quickStartEstimatedCost.toLocaleString()}원 (무료 30건 적용 전)
            </p>
          )}

          {previewAll && !previewAll.hasNaverPlaceUrl && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg mt-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-amber-800">
                  네이버 플레이스 링크가 설정되지 않았습니다
                </p>
                <button
                  onClick={() => {
                    setShowQuickStartModal(false);
                    router.push('/settings');
                  }}
                  className="text-xs text-brand-600 hover:text-brand-700 font-medium mt-1"
                >
                  매장 설정에서 입력하기 →
                </button>
              </div>
            </div>
          )}

          <ModalFooter>
            <Button
              variant="secondary"
              onClick={() => setShowQuickStartModal(false)}
            >
              취소
            </Button>
            <Button
              onClick={handleQuickStart}
              disabled={quickStarting || !previewAll?.hasNaverPlaceUrl}
            >
              {quickStarting ? '활성화 중...' : '3개 시나리오 켜기'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
