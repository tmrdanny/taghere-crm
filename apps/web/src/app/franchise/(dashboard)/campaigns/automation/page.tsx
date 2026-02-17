'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
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
  Store,
  ChevronDown,
} from 'lucide-react';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface StoreInfo {
  id: string;
  name: string;
  naverPlaceUrl: string;
  activeRuleCount: number;
}

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

const SCENARIOS = [
  { type: 'BIRTHDAY', label: '생일 축하', icon: Cake, description: '생일 3일 전, 축하 쿠폰을 자동 발송합니다' },
  { type: 'CHURN_PREVENTION', label: '이탈 방지', icon: Bell, description: '30일 이상 미방문 고객에게 재방문 쿠폰 발송' },
  { type: 'ANNIVERSARY', label: '가입 기념일', icon: Heart, description: '가입 기념일 3일 전, 축하 쿠폰을 자동 발송합니다' },
  { type: 'FIRST_VISIT_FOLLOWUP', label: '첫 방문 팔로업', icon: HandMetal, description: '첫 방문 3일 후, 감사 메시지 + 재방문 쿠폰' },
  { type: 'VIP_MILESTONE', label: 'VIP 마일스톤', icon: Star, description: '방문 10회, 50회 등 마일스톤 달성 시 감사 쿠폰' },
  { type: 'WINBACK', label: '장기 미방문 윈백', icon: Moon, description: '90일 이상 장기 미방문 고객 특별 할인' },
  { type: 'SLOW_DAY', label: '비수기 프로모션', icon: Calendar, description: '설정한 비수기 요일에 자동 프로모션 발송' },
];

export default function FranchiseAutomationPage() {
  const router = useRouter();
  const { showToast, ToastComponent } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [stores, setStores] = useState<StoreInfo[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [stats, setStats] = useState<RuleStat[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [isLoadingRules, setIsLoadingRules] = useState(false);
  const [togglingType, setTogglingType] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const getHeaders = () => {
    const token = localStorage.getItem('franchiseToken');
    return { Authorization: `Bearer ${token}` };
  };

  useEffect(() => {
    fetchStores();
  }, []);

  useEffect(() => {
    if (selectedStoreId) {
      fetchRulesForStore(selectedStoreId);
    }
  }, [selectedStoreId]);

  const fetchStores = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/franchise/automation/stores`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setStores(data.stores);
      }
    } catch (error) {
      console.error('Failed to fetch stores:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRulesForStore = async (storeId: string) => {
    if (storeId === 'ALL') {
      setRules([]);
      setStats([]);
      setDashboard(null);
      return;
    }
    setIsLoadingRules(true);
    try {
      const [rulesRes, dashboardRes] = await Promise.all([
        fetch(`${apiUrl}/api/franchise/automation/stores/${storeId}/rules`, { headers: getHeaders() }),
        fetch(`${apiUrl}/api/franchise/automation/stores/${storeId}/dashboard`, { headers: getHeaders() }),
      ]);
      if (rulesRes.ok) {
        const data = await rulesRes.json();
        setRules(data.rules);
        setStats(data.stats);
      }
      if (dashboardRes.ok) {
        setDashboard(await dashboardRes.json());
      }
    } catch (error) {
      console.error('Failed to fetch rules:', error);
    } finally {
      setIsLoadingRules(false);
    }
  };

  const handleToggle = async (type: string, enabled: boolean) => {
    if (selectedStoreId === 'ALL') {
      // 전체 가맹점 일괄 토글
      setTogglingType(type);
      try {
        const res = await fetch(`${apiUrl}/api/franchise/automation/bulk/rules/${type}`, {
          method: 'PUT',
          headers: { ...getHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.skippedStores.length > 0) {
            showToast(
              `${data.updatedCount}개 가맹점 적용 완료. ${data.skippedStores.length}개 가맹점은 네이버 플레이스 링크가 없어 건너뛰었습니다.`,
              'success'
            );
          } else {
            showToast(`전체 ${data.updatedCount}개 가맹점에 적용되었습니다.`, 'success');
          }
          fetchStores();
        } else {
          const error = await res.json();
          showToast(error.error || '설정 변경에 실패했습니다.', 'error');
        }
      } catch {
        showToast('설정 변경에 실패했습니다.', 'error');
      } finally {
        setTogglingType(null);
      }
      return;
    }

    setTogglingType(type);
    try {
      const res = await fetch(`${apiUrl}/api/franchise/automation/stores/${selectedStoreId}/rules/${type}`, {
        method: 'PUT',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (res.ok) {
        setRules((prev) => prev.map((r) => (r.type === type ? { ...r, enabled } : r)));
        showToast(enabled ? '자동 마케팅이 활성화되었습니다.' : '자동 마케팅이 비활성화되었습니다.', 'success');
      } else {
        const error = await res.json();
        showToast(error.error || '설정 변경에 실패했습니다.', 'error');
      }
    } catch {
      showToast('설정 변경에 실패했습니다.', 'error');
    } finally {
      setTogglingType(null);
    }
  };

  const getRuleByType = (type: string) => rules.find((r) => r.type === type);
  const getStatByType = (type: string) => stats.find((s) => s.type === type);
  const selectedStore = stores.find((s) => s.id === selectedStoreId);

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        <div className="text-center py-12 text-slate-500">불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      {ToastComponent}

      {/* 헤더 */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">자동 마케팅</h1>
        <p className="text-slate-500 mt-1">
          가맹점별로 자동 마케팅을 설정할 수 있습니다. 비용은 각 가맹점의 충전금에서 차감됩니다.
        </p>
      </div>

      {/* 가맹점 선택 */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-700 mb-2">
          <Store className="w-4 h-4 inline-block mr-1" />
          가맹점 선택
        </label>
        <div className="relative">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="w-full flex items-center justify-between px-4 py-3 bg-white border border-slate-300 rounded-lg text-sm hover:border-slate-400 transition-colors"
          >
            <span className={selectedStoreId ? 'text-slate-900' : 'text-slate-400'}>
              {selectedStoreId === 'ALL'
                ? `전체 가맹점 (${stores.length}개)`
                : selectedStore
                  ? `${selectedStore.name} (활성 ${selectedStore.activeRuleCount}개)`
                  : '가맹점을 선택해주세요'}
            </span>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {isDropdownOpen && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-auto">
              {/* 전체 가맹점 옵션 */}
              <button
                onClick={() => {
                  setSelectedStoreId('ALL');
                  setIsDropdownOpen(false);
                }}
                className={`w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors border-b border-slate-100 ${
                  selectedStoreId === 'ALL' ? 'bg-franchise-50 text-franchise-700 font-medium' : 'text-slate-700'
                }`}
              >
                <span>전체 가맹점 ({stores.length}개)</span>
                <span className="text-xs text-slate-400">일괄 설정</span>
              </button>

              {stores.map((store) => (
                <button
                  key={store.id}
                  onClick={() => {
                    setSelectedStoreId(store.id);
                    setIsDropdownOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors ${
                    selectedStoreId === store.id ? 'bg-franchise-50 text-franchise-700 font-medium' : 'text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span>{store.name}</span>
                    {!store.naverPlaceUrl && (
                      <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">네이버 미설정</span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400">
                    활성 {store.activeRuleCount}개
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 가맹점 미선택 */}
      {!selectedStoreId && (
        <div className="text-center py-16 text-slate-400">
          <Store className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>가맹점을 선택하면 자동 마케팅 시나리오가 표시됩니다</p>
        </div>
      )}

      {/* 전체 가맹점 모드 */}
      {selectedStoreId === 'ALL' && (
        <>
          <div className="mb-4 p-3 bg-franchise-50 border border-franchise-200 rounded-lg">
            <p className="text-sm text-franchise-700">
              <strong>전체 가맹점 일괄 설정</strong> - ON/OFF를 토글하면 모든 가맹점에 일괄 적용됩니다.
              네이버 플레이스 링크가 없는 가맹점은 활성화에서 자동으로 제외됩니다.
            </p>
          </div>

          <div className="space-y-3">
            {SCENARIOS.map((scenario) => {
              const Icon = scenario.icon;
              return (
                <Card key={scenario.type}>
                  <CardContent className="py-4 px-5">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-100 text-slate-500">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-slate-900">{scenario.label}</h3>
                        <p className="text-sm text-slate-500 mt-0.5">{scenario.description}</p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <button
                          onClick={() => handleToggle(scenario.type, true)}
                          disabled={togglingType === scenario.type}
                          className="px-3 py-1.5 text-xs font-medium bg-franchise-600 text-white rounded-md hover:bg-franchise-700 disabled:opacity-50 transition-colors"
                        >
                          전체 ON
                        </button>
                        <button
                          onClick={() => handleToggle(scenario.type, false)}
                          disabled={togglingType === scenario.type}
                          className="px-3 py-1.5 text-xs font-medium bg-slate-200 text-slate-700 rounded-md hover:bg-slate-300 disabled:opacity-50 transition-colors"
                        >
                          전체 OFF
                        </button>
                        <button
                          onClick={() => router.push(`/franchise/campaigns/automation/${scenario.type}?storeId=ALL`)}
                          className="p-1.5 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-50 transition-colors"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* 개별 가맹점 모드 */}
      {selectedStoreId && selectedStoreId !== 'ALL' && (
        <>
          {isLoadingRules ? (
            <div className="text-center py-12 text-slate-500">불러오는 중...</div>
          ) : (
            <>
              {/* 대시보드 */}
              {dashboard && (dashboard.totalSent > 0 || rules.some((r) => r.enabled)) && (
                <Card className="mb-6">
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className="flex items-center justify-center gap-1.5 text-slate-500 text-sm mb-1">
                          <Send className="w-4 h-4" />
                          <span>자동 발송</span>
                        </div>
                        <div className="text-2xl font-bold text-slate-900">{dashboard.totalSent}건</div>
                      </div>
                      <div>
                        <div className="flex items-center justify-center gap-1.5 text-slate-500 text-sm mb-1">
                          <Gift className="w-4 h-4" />
                          <span>쿠폰 사용</span>
                        </div>
                        <div className="text-2xl font-bold text-slate-900">
                          {dashboard.totalCouponUsed}건
                          <span className="text-sm font-normal text-slate-500 ml-1">({dashboard.usageRate}%)</span>
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-center gap-1.5 text-slate-500 text-sm mb-1">
                          <TrendingUp className="w-4 h-4" />
                          <span>추정 매출</span>
                        </div>
                        <div className="text-2xl font-bold text-slate-900">
                          {dashboard.estimatedRevenue > 0 ? `${dashboard.estimatedRevenue.toLocaleString()}원` : '-'}
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
                    <Card key={scenario.type}>
                      <CardContent className="py-4 px-5">
                        <div className="flex items-center gap-4">
                          <div
                            className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                              rule?.enabled
                                ? 'bg-franchise-100 text-franchise-700'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            <Icon className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-slate-900">{scenario.label}</h3>
                            <p className="text-sm text-slate-500 mt-0.5">{scenario.description}</p>
                            {stat && stat.monthlySent > 0 && (
                              <p className="text-xs text-slate-400 mt-1">
                                이번 달: {stat.monthlySent}건 발송, {stat.monthlyCouponUsed}건 사용 ({stat.usageRate}%)
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <Switch
                              checked={rule?.enabled || false}
                              onCheckedChange={(checked) => handleToggle(scenario.type, checked)}
                              disabled={togglingType === scenario.type}
                            />
                            <button
                              onClick={() =>
                                router.push(`/franchise/campaigns/automation/${scenario.type}?storeId=${selectedStoreId}`)
                              }
                              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-50 transition-colors"
                            >
                              <ChevronRight className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* 과금 안내 */}
      {selectedStoreId && (
        <div className="mt-6 flex items-start gap-2 text-sm text-slate-500 bg-slate-50 rounded-lg p-4">
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p>
            자동 마케팅은 건당 50원이 과금됩니다. 월 30건까지 무료 크레딧이 적용됩니다.
            비용은 각 가맹점의 충전금에서 차감됩니다.
          </p>
        </div>
      )}
    </div>
  );
}
