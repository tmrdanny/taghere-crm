'use client';

import { API_BASE } from '@/lib/api-config';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
      const res = await fetch(`${API_BASE}/api/franchise/automation/stores`, { headers: getHeaders() });
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
        fetch(`${API_BASE}/api/franchise/automation/stores/${storeId}/rules`, { headers: getHeaders() }),
        fetch(`${API_BASE}/api/franchise/automation/stores/${storeId}/dashboard`, { headers: getHeaders() }),
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
        const res = await fetch(`${API_BASE}/api/franchise/automation/bulk/rules/${type}`, {
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
      const res = await fetch(`${API_BASE}/api/franchise/automation/stores/${selectedStoreId}/rules/${type}`, {
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
          가맹점별로 자동 마케팅을 설정할 수 있습니다. 비용은 각 가맹점의 충전금에서 차감됩니다.
        </p>
      </div>

      {/* 가맹점 선택 */}
      <div className="mb-4">
        <label className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-[color:var(--ad-ink-2)]">
          <Store className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
          가맹점 선택
        </label>
        <div className="relative">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex h-10 w-full items-center justify-between rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13.5px] transition-colors hover:bg-[color:var(--ad-bg-alt)]"
          >
            <span className={selectedStoreId ? 'text-[color:var(--ad-ink)]' : 'text-[color:var(--ad-faint)]'}>
              {selectedStoreId === 'ALL'
                ? `전체 가맹점 (${stores.length}개)`
                : selectedStore
                  ? `${selectedStore.name} (활성 ${selectedStore.activeRuleCount}개)`
                  : '가맹점을 선택해주세요'}
            </span>
            <ChevronDown className={`h-4 w-4 text-[color:var(--ad-faint)] transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {isDropdownOpen && (
            <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-[12px] border border-[color:var(--ad-line)] bg-white py-1 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.18)]">
              {/* 전체 가맹점 옵션 */}
              <button
                onClick={() => {
                  setSelectedStoreId('ALL');
                  setIsDropdownOpen(false);
                }}
                className={`flex w-full items-center justify-between border-b border-[color:var(--ad-line)] px-3 py-2.5 text-[13px] transition-colors hover:bg-[color:var(--ad-bg-alt)] ${
                  selectedStoreId === 'ALL' ? 'bg-[color:var(--ad-bg)] font-medium text-[color:var(--ad-ink)]' : 'text-[color:var(--ad-ink-2)]'
                }`}
              >
                <span>전체 가맹점 ({stores.length}개)</span>
                <span className="text-[12px] text-[color:var(--ad-faint)]">일괄 설정</span>
              </button>

              {stores.map((store) => (
                <button
                  key={store.id}
                  onClick={() => {
                    setSelectedStoreId(store.id);
                    setIsDropdownOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2.5 text-[13px] transition-colors hover:bg-[color:var(--ad-bg-alt)] ${
                    selectedStoreId === store.id ? 'bg-[color:var(--ad-bg)] font-medium text-[color:var(--ad-ink)]' : 'text-[color:var(--ad-ink-2)]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span>{store.name}</span>
                    {!store.naverPlaceUrl && (
                      <span className="inline-flex rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">네이버 미설정</span>
                    )}
                  </div>
                  <span className="ad-tnum text-[12px] text-[color:var(--ad-faint)]">
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
        <div className="ad-card py-16 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--ad-bg)]">
            <Store className="h-5 w-5 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
          </div>
          <p className="text-[13px] text-[color:var(--ad-faint)]">가맹점을 선택하면 자동 마케팅 시나리오가 표시됩니다</p>
        </div>
      )}

      {/* 전체 가맹점 모드 */}
      {selectedStoreId === 'ALL' && (
        <>
          <div className="mb-4 flex items-start gap-2 rounded-[12px] bg-[color:var(--ad-bg-alt)] px-4 py-3 text-[13px] text-[color:var(--ad-muted)]">
            <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
            <p>
              <span className="font-medium text-[color:var(--ad-ink-2)]">전체 가맹점 일괄 설정</span> - ON/OFF를 토글하면 모든 가맹점에 일괄 적용됩니다.
              네이버 플레이스 링크가 없는 가맹점은 활성화에서 자동으로 제외됩니다.
            </p>
          </div>

          <div className="ad-card overflow-hidden">
            <div className="divide-y divide-[color:var(--ad-line)]">
              {SCENARIOS.map((scenario) => {
                const Icon = scenario.icon;
                return (
                  <div key={scenario.type} className="px-5 py-4">
                    <div className="flex items-center gap-4">
                      <Icon className="h-4 w-4 flex-shrink-0 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">{scenario.label}</h3>
                        <p className="mt-0.5 text-[13px] text-[color:var(--ad-muted)]">{scenario.description}</p>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-2">
                        <button
                          onClick={() => handleToggle(scenario.type, true)}
                          disabled={togglingType === scenario.type}
                          className="ad-press inline-flex h-8 items-center justify-center rounded-[10px] bg-white px-3 text-[12.5px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] disabled:opacity-40"
                        >
                          전체 ON
                        </button>
                        <button
                          onClick={() => handleToggle(scenario.type, false)}
                          disabled={togglingType === scenario.type}
                          className="ad-press inline-flex h-8 items-center justify-center rounded-[10px] bg-white px-3 text-[12.5px] font-medium text-[color:var(--ad-muted)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] disabled:opacity-40"
                        >
                          전체 OFF
                        </button>
                        <button
                          onClick={() => router.push(`/franchise/campaigns/automation/${scenario.type}?storeId=ALL`)}
                          className="ad-press rounded-[8px] p-1.5 text-[color:var(--ad-faint)] transition-colors hover:bg-[color:var(--ad-bg-alt)] hover:text-[color:var(--ad-ink-2)]"
                        >
                          <ChevronRight className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* 개별 가맹점 모드 */}
      {selectedStoreId && selectedStoreId !== 'ALL' && (
        <>
          {isLoadingRules ? (
            <div className="py-12 text-center text-[13px] text-[color:var(--ad-faint)]">불러오는 중...</div>
          ) : (
            <>
              {/* 대시보드 */}
              {dashboard && (dashboard.totalSent > 0 || rules.some((r) => r.enabled)) && (
                <div className="ad-card mb-4">
                  <div className="grid grid-cols-3">
                    <div className="p-5">
                      <div className="mb-1 flex items-center gap-1.5 text-[12px] text-[color:var(--ad-muted)]">
                        <Send className="h-3.5 w-3.5" />
                        <span>자동 발송</span>
                      </div>
                      <div className="ad-tnum text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">{dashboard.totalSent}건</div>
                    </div>
                    <div className="border-l border-[color:var(--ad-line)] p-5">
                      <div className="mb-1 flex items-center gap-1.5 text-[12px] text-[color:var(--ad-muted)]">
                        <Gift className="h-3.5 w-3.5" />
                        <span>쿠폰 사용</span>
                      </div>
                      <div className="ad-tnum text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">
                        {dashboard.totalCouponUsed}건
                        <span className="ml-1 text-[13px] font-normal text-[color:var(--ad-muted)]">({dashboard.usageRate}%)</span>
                      </div>
                    </div>
                    <div className="border-l border-[color:var(--ad-line)] p-5">
                      <div className="mb-1 flex items-center gap-1.5 text-[12px] text-[color:var(--ad-muted)]">
                        <TrendingUp className="h-3.5 w-3.5" />
                        <span>추정 매출</span>
                      </div>
                      <div className="ad-tnum text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">
                        {dashboard.estimatedRevenue > 0 ? `${dashboard.estimatedRevenue.toLocaleString()}원` : '-'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 시나리오 목록 */}
              <div className="ad-card overflow-hidden">
                <div className="divide-y divide-[color:var(--ad-line)]">
                  {SCENARIOS.map((scenario) => {
                    const rule = getRuleByType(scenario.type);
                    const stat = getStatByType(scenario.type);
                    const Icon = scenario.icon;

                    return (
                      <div key={scenario.type} className="px-5 py-4">
                        <div className="flex items-center gap-4">
                          <Icon
                            className={`h-4 w-4 flex-shrink-0 ${
                              rule?.enabled ? 'text-[color:var(--ad-ink)]' : 'text-[color:var(--ad-faint)]'
                            }`}
                            strokeWidth={1.8}
                          />
                          <div className="min-w-0 flex-1">
                            <h3 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">{scenario.label}</h3>
                            <p className="mt-0.5 text-[13px] text-[color:var(--ad-muted)]">{scenario.description}</p>
                            {stat && stat.monthlySent > 0 && (
                              <p className="mt-1 text-[12px] text-[color:var(--ad-faint)]">
                                이번 달: {stat.monthlySent}건 발송, {stat.monthlyCouponUsed}건 사용 ({stat.usageRate}%)
                              </p>
                            )}
                          </div>
                          <div className="flex flex-shrink-0 items-center gap-3">
                            <Switch
                              checked={rule?.enabled || false}
                              onCheckedChange={(checked) => handleToggle(scenario.type, checked)}
                              disabled={togglingType === scenario.type}
                            />
                            <button
                              onClick={() =>
                                router.push(`/franchise/campaigns/automation/${scenario.type}?storeId=${selectedStoreId}`)
                              }
                              className="ad-press rounded-[8px] p-1.5 text-[color:var(--ad-faint)] transition-colors hover:bg-[color:var(--ad-bg-alt)] hover:text-[color:var(--ad-ink-2)]"
                            >
                              <ChevronRight className="h-5 w-5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* 과금 안내 */}
      {selectedStoreId && (
        <div className="mt-4 flex items-start gap-2 rounded-[12px] bg-[color:var(--ad-bg-alt)] px-4 py-3 text-[13px] text-[color:var(--ad-muted)]">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
          <p>
            자동 마케팅은 건당 50원이 과금됩니다. 월 30건까지 무료 크레딧이 적용됩니다.
            비용은 각 가맹점의 충전금에서 차감됩니다.
          </p>
        </div>
      )}
    </div>
  );
}
