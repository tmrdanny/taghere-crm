'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
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

// 시나리오 메타 정보
const SCENARIOS = [
  {
    type: 'BIRTHDAY',
    label: '생일 축하',
    icon: Cake,
    description: '생일 3일 전, 축하 쿠폰을 자동 발송합니다',
    available: true,
  },
  {
    type: 'CHURN_PREVENTION',
    label: '이탈 방지',
    icon: Bell,
    description: '30일 이상 미방문 고객에게 재방문 쿠폰 발송',
    available: true,
  },
  {
    type: 'ANNIVERSARY',
    label: '기념일',
    icon: Heart,
    description: '기념일 7일 전, 특별 쿠폰을 자동 발송합니다',
    available: false,
  },
  {
    type: 'FIRST_VISIT_FOLLOWUP',
    label: '첫 방문 팔로업',
    icon: HandMetal,
    description: '첫 방문 3일 후, 감사 메시지 + 재방문 쿠폰',
    available: false,
  },
  {
    type: 'VIP_MILESTONE',
    label: 'VIP 마일스톤',
    icon: Star,
    description: '방문 10회, 50회 등 마일스톤 달성 시 감사 쿠폰',
    available: false,
  },
  {
    type: 'WINBACK',
    label: '장기 미방문 윈백',
    icon: Moon,
    description: '90일 이상 장기 미방문 고객 특별 할인',
    available: false,
  },
  {
    type: 'SLOW_DAY',
    label: '비수기 프로모션',
    icon: Calendar,
    description: '매출이 낮은 요일에 자동 프로모션 발송',
    available: false,
  },
];

export default function AutomationPage() {
  const router = useRouter();
  const { showToast, ToastComponent } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [stats, setStats] = useState<RuleStat[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [togglingType, setTogglingType] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const [rulesRes, dashboardRes] = await Promise.all([
        fetch(`${apiUrl}/api/automation/rules`, { headers }),
        fetch(`${apiUrl}/api/automation/dashboard`, { headers }),
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

  const getRuleByType = (type: string) => rules.find((r) => r.type === type);
  const getStatByType = (type: string) => stats.find((s) => s.type === type);

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
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-neutral-900">자동 마케팅</h1>
        <p className="text-neutral-500 mt-1">
          ON/OFF만 설정하면, 고객에게 자동으로 쿠폰이 발송됩니다
        </p>
      </div>

      {/* 이번 달 성과 대시보드 */}
      {dashboard && (dashboard.totalSent > 0 || rules.some((r) => r.enabled)) && (
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
          </CardContent>
        </Card>
      )}

      {/* 시나리오 목록 */}
      <div className="space-y-3">
        {SCENARIOS.map((scenario) => {
          const rule = getRuleByType(scenario.type);
          const stat = getStatByType(scenario.type);
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
                    </div>
                    <p className="text-sm text-neutral-500 mt-0.5">
                      {scenario.description}
                    </p>
                    {scenario.available && stat && stat.monthlySent > 0 && (
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

      {/* 과금 안내 */}
      <div className="mt-6 flex items-start gap-2 text-sm text-neutral-500 bg-neutral-50 rounded-lg p-4">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <p>
          자동 마케팅은 건당 50원이 과금됩니다. 월 30건까지 무료 크레딧이 적용됩니다.
          충전금이 부족하면 자동 발송이 일시 중단됩니다.
        </p>
      </div>
    </div>
  );
}
