'use client';

import { API_BASE } from '@/lib/api-config';
import { useEffect, useState } from 'react';
import { trackEvent } from '@/lib/analytics';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Stamp, Gift, Plus, X, Dice5, Tablet, Lock, Check } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

interface RewardOption {
  description: string;
  probability: number;
}

interface RewardEntry {
  tier: number;
  description: string;
  options: RewardOption[] | null;
}

function RewardTierEditor({
  tier,
  options,
  onChange,
  onRemove,
  disabled,
}: {
  tier: number;
  options: RewardOption[];
  onChange: (options: RewardOption[]) => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const totalProbability = options.reduce((sum, opt) => sum + opt.probability, 0);
  const isValid = options.length === 0 || Math.abs(totalProbability - 100) <= 0.1;
  const isMultiple = options.length > 1;

  const addOption = () => {
    if (options.length === 0) {
      onChange([{ description: '', probability: 100 }]);
    } else {
      onChange([...options, { description: '', probability: 0 }]);
    }
  };

  const removeOption = (index: number) => {
    const newOptions = options.filter((_, i) => i !== index);
    if (newOptions.length === 1) {
      newOptions[0].probability = 100;
    }
    onChange(newOptions);
  };

  const updateOption = (index: number, field: keyof RewardOption, value: string | number) => {
    const newOptions = [...options];
    if (field === 'probability') {
      newOptions[index] = { ...newOptions[index], probability: Number(value) || 0 };
    } else {
      newOptions[index] = { ...newOptions[index], description: String(value) };
    }
    onChange(newOptions);
  };

  return (
    <div className="space-y-3 p-4 bg-[color:var(--ad-bg-alt)] rounded-[12px] border border-[color:var(--ad-line)]">
      {/* Tier Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-white shadow-[inset_0_0_0_1px_var(--ad-line)] flex items-center justify-center">
            <span className="text-[13px] font-medium ad-tnum text-[color:var(--ad-ink-2)]">{tier}</span>
          </div>
          <label className="text-[13.5px] font-semibold text-[color:var(--ad-ink)]">
            스탬프 {tier}개 보상
          </label>
          {isMultiple && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">
              <Dice5 className="w-3 h-3" />
              랜덤
            </span>
          )}
        </div>
        <button
          onClick={onRemove}
          disabled={disabled}
          className="ad-press p-1.5 rounded-[8px] text-[color:var(--ad-faint)] hover:text-[color:var(--ad-neg)] transition-colors"
          title="이 보상 단계 삭제"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Options */}
      {options.length === 0 ? (
        <button
          onClick={addOption}
          disabled={disabled}
          className="ad-press w-full h-10 border border-dashed border-[color:var(--ad-line-strong)] rounded-[10px] bg-white text-[13px] text-[color:var(--ad-muted)] hover:border-[color:var(--ad-ink)] hover:text-[color:var(--ad-ink)] transition-colors"
        >
          + 보상 추가
        </button>
      ) : (
        <div className="space-y-2">
          {options.map((opt, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input
                value={opt.description}
                onChange={(e) => updateOption(idx, 'description', e.target.value)}
                placeholder="보상 내용 입력 (예: 아메리카노 1잔 무료)"
                disabled={disabled}
                className="flex-1 bg-white rounded-[10px] border-[color:var(--ad-line-strong)] text-[13.5px] focus-visible:ring-0 focus:border-[color:var(--ad-navy)]"
              />
              {isMultiple && (
                <div className="flex items-center gap-1 shrink-0">
                  <Input
                    type="number"
                    value={opt.probability || ''}
                    onChange={(e) => updateOption(idx, 'probability', e.target.value)}
                    disabled={disabled}
                    className="w-20 text-right bg-white ad-tnum rounded-[10px] border-[color:var(--ad-line-strong)] text-[13.5px] focus-visible:ring-0 focus:border-[color:var(--ad-navy)]"
                    step="0.1"
                    min="0"
                    max="100"
                    placeholder="0"
                  />
                  <span className="text-[13px] text-[color:var(--ad-muted)]">%</span>
                </div>
              )}
              <button
                onClick={() => removeOption(idx)}
                disabled={disabled}
                className="ad-press p-1.5 rounded-[8px] text-[color:var(--ad-faint)] hover:text-[color:var(--ad-neg)] transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}

          {/* Add + Validation */}
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={addOption}
              disabled={disabled}
              className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[color:var(--ad-link)] hover:underline"
            >
              <Plus className="w-3.5 h-3.5" />
              {isMultiple ? '랜덤 보상 추가' : '랜덤 보상 추가 (확률 설정)'}
            </button>
            {isMultiple && (
              <span className={`inline-flex items-center gap-1 text-[12px] font-medium ad-tnum ${isValid ? 'text-[color:var(--ad-pos)]' : 'text-[color:var(--ad-neg)]'}`}>
                합계: {totalProbability.toFixed(1)}%{isValid ? <Check className="h-3.5 w-3.5" strokeWidth={2.2} /> : ' (100% 필요)'}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function StampSettingsPage() {
  const { showToast, ToastComponent } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  // 본사(프랜차이즈)에서 스탬프 설정을 잠근 경우 점주는 수정 불가
  const [locked, setLocked] = useState(false);

  // Settings state
  const [enabled, setEnabled] = useState(true);
  const [firstStampBonus, setFirstStampBonus] = useState(1);
  const [isSavingBonus, setIsSavingBonus] = useState(false);
  const [manualStampCountEnabled, setManualStampCountEnabled] = useState(false);
  const [selectedTiers, setSelectedTiers] = useState<number[]>([]);
  const [rewardOptions, setRewardOptions] = useState<Record<number, RewardOption[]>>({});

  // 새 티어 추가 input
  const [newTierInput, setNewTierInput] = useState('');

  const setTierOptions = (tier: number, options: RewardOption[]) => {
    setRewardOptions(prev => ({ ...prev, [tier]: options }));
  };

  const addTier = (tier: number) => {
    if (tier < 1 || tier > 50) {
      showToast('1~50 사이의 숫자를 입력해주세요.', 'error');
      return;
    }
    if (selectedTiers.includes(tier)) {
      showToast(`${tier}개 보상은 이미 추가되어 있습니다.`, 'error');
      return;
    }
    setSelectedTiers(prev => [...prev, tier].sort((a, b) => a - b));
    setRewardOptions(prev => ({ ...prev, [tier]: [] }));
    setNewTierInput('');
  };

  const removeTier = (tier: number) => {
    setSelectedTiers(prev => prev.filter(t => t !== tier));
    setRewardOptions(prev => {
      const next = { ...prev };
      delete next[tier];
      return next;
    });
  };

  // Fetch stamp settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE}/api/stamp-settings`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          setLocked(data.locked ?? false);
          setEnabled(data.enabled);
          setFirstStampBonus(data.firstStampBonus && data.firstStampBonus >= 1 ? data.firstStampBonus : 1);
          setManualStampCountEnabled(!!data.manualStampCountEnabled);

          // rewards JSON 기반으로 로드
          const rewards: RewardEntry[] = data.rewards || [];
          const tiers: number[] = [];
          const opts: Record<number, RewardOption[]> = {};

          for (const entry of rewards) {
            tiers.push(entry.tier);
            if (entry.options && Array.isArray(entry.options) && entry.options.length > 0) {
              opts[entry.tier] = entry.options;
            } else if (entry.description) {
              opts[entry.tier] = [{ description: entry.description, probability: 100 }];
            } else {
              opts[entry.tier] = [];
            }
          }

          setSelectedTiers(tiers.sort((a, b) => a - b));
          setRewardOptions(opts);
        }
      } catch (error) {
        console.error('Failed to fetch stamp settings:', error);
        showToast('설정을 불러오는데 실패했습니다.', 'error');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, []);

  // 저장 전 유효성 검증
  const validateBeforeSave = (): string | null => {
    for (const tier of selectedTiers) {
      const opts = rewardOptions[tier] || [];
      if (opts.length === 0) continue;

      for (const opt of opts) {
        if (!opt.description.trim()) {
          return `${tier}개 보상에 빈 항목이 있습니다. 내용을 입력하거나 삭제해주세요.`;
        }
      }

      if (opts.length > 1) {
        const total = opts.reduce((sum, opt) => sum + opt.probability, 0);
        if (Math.abs(total - 100) > 0.1) {
          return `${tier}개 보상의 확률 합이 ${total.toFixed(1)}%입니다. 100%가 되어야 합니다.`;
        }
        for (const opt of opts) {
          if (opt.probability <= 0) {
            return `${tier}개 보상에 확률이 0% 이하인 항목이 있습니다.`;
          }
        }
      }
    }
    return null;
  };

  const handleSave = async () => {
    if (locked) {
      showToast('본사에서 스탬프 설정을 관리하고 있어 수정할 수 없습니다.', 'error');
      return;
    }

    const validationError = validateBeforeSave();
    if (validationError) {
      showToast(validationError, 'error');
      return;
    }

    setIsSaving(true);
    try {
      const token = localStorage.getItem('token');

      // rewards JSON 배열 구성
      const rewards: RewardEntry[] = selectedTiers
        .filter(tier => {
          const opts = rewardOptions[tier] || [];
          return opts.length > 0 && opts.some(o => o.description.trim());
        })
        .map(tier => {
          const opts = rewardOptions[tier];
          const isMultiple = opts.length > 1;
          return {
            tier,
            description: opts[0]?.description || '',
            options: isMultiple ? opts : null,
          };
        });

      const res = await fetch(`${API_BASE}/api/stamp-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled, rewards, firstStampBonus }),
      });

      if (res.ok) {
        trackEvent('owner_stamp_rewards_save', { tier_count: rewards.length });
        showToast('스탬프 설정이 저장되었습니다.', 'success');
      } else {
        const error = await res.json();
        showToast(error.error || '저장 중 오류가 발생했습니다.', 'error');
      }
    } catch (error) {
      console.error('Failed to save stamp settings:', error);
      showToast('저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleEnabled = async (newEnabled: boolean) => {
    if (locked) {
      showToast('본사에서 스탬프 설정을 관리하고 있어 수정할 수 없습니다.', 'error');
      return;
    }
    setEnabled(newEnabled);
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_BASE}/api/stamp-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          enabled: newEnabled,
        }),
      });
      showToast(newEnabled ? '스탬프 기능이 활성화되었습니다.' : '스탬프 기능이 비활성화되었습니다.', 'success');
    } catch (error) {
      console.error('Failed to toggle stamp enabled:', error);
      setEnabled(!newEnabled);
    }
  };

  const handleToggleManualCount = async (newValue: boolean) => {
    if (locked) {
      showToast('본사에서 스탬프 설정을 관리하고 있어 수정할 수 없습니다.', 'error');
      return;
    }
    setManualStampCountEnabled(newValue);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/stamp-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ manualStampCountEnabled: newValue }),
      });
      if (res.ok) {
        showToast(
          newValue
            ? '매번 적립 개수 직접 입력이 켜졌습니다.'
            : '매번 적립 개수 직접 입력이 꺼졌습니다.',
          'success'
        );
      } else {
        setManualStampCountEnabled(!newValue);
        showToast('저장 중 오류가 발생했습니다.', 'error');
      }
    } catch (error) {
      console.error('Failed to toggle manual stamp count:', error);
      setManualStampCountEnabled(!newValue);
      showToast('저장 중 오류가 발생했습니다.', 'error');
    }
  };

  const handleNewTierKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const num = parseInt(newTierInput);
      if (!isNaN(num)) addTier(num);
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 sm:px-8 lg:pt-8">
        <div className="text-center py-12 text-[13px] text-[color:var(--ad-faint)]">불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 sm:px-8 lg:pt-8">
      {ToastComponent}

      {/* Header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-[color:var(--ad-ink)]">스탬프 설정</h1>
          <p className="mt-1 text-[13px] text-[color:var(--ad-muted)]">
            스탬프 적립 기능과 보상을 설정합니다.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => window.open('/stamp-tablet', '_blank')}
          className="ad-press inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] border-0 bg-white px-3.5 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] shrink-0"
        >
          <Tablet className="h-4 w-4" strokeWidth={1.8} />
          태블릿 모드
        </Button>
      </div>

      {/* 본사 잠금 안내 배너 */}
      {locked && (
        <div className="mb-5 flex items-start gap-2.5 rounded-[12px] bg-[color:var(--ad-bg-alt)] px-4 py-3 text-[13px] text-[color:var(--ad-muted)]">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
          <div>
            <p className="font-medium text-[color:var(--ad-ink-2)]">본사에서 관리하는 설정입니다</p>
            <p className="mt-0.5">
              스탬프 보상 및 설정이 프랜차이즈 본사에 의해 잠겨 있어 매장에서 수정할 수 없습니다. 변경이 필요하면 본사에 문의해주세요.
            </p>
          </div>
        </div>
      )}

      <div className={cn('space-y-4', locked && 'opacity-60 pointer-events-none select-none')}>
        {/* 사용 안내 카드 */}
        <div className="ad-card">
          <div className="px-5 pt-5 pb-4">
            <h2 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">스탬프 사용 안내</h2>
          </div>
          <div className="px-5 pb-5 space-y-4">
            <div className="space-y-3 text-[13px] text-[color:var(--ad-ink-2)]">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)] flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[11.5px] font-semibold ad-tnum">1</span>
                </div>
                <p>
                  고객이 태그히어를 통해 로그인하면 스탬프가 적립됩니다.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)] flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[11.5px] font-semibold ad-tnum">2</span>
                </div>
                <p>
                  스탬프는 <strong>하루 1개씩 적립</strong>되며, 설정한 개수에 도달하면 보상을 사용할 수 있습니다.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)] flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[11.5px] font-semibold ad-tnum">3</span>
                </div>
                <p>
                  고객이 보상을 요청하면, <strong>고객 리스트</strong>에서 해당 고객을 찾아 해당 단계의 &quot;사용&quot; 버튼을 눌러주세요.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)] flex items-center justify-center shrink-0 mt-0.5">
                  <Dice5 className="w-3.5 h-3.5" strokeWidth={1.8} />
                </div>
                <p>
                  각 단계에 <strong>여러 보상을 등록</strong>하면 랜덤으로 하나가 추첨됩니다. 확률(%)을 설정하여 보상별 당첨 확률을 조절할 수 있습니다.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 스탬프 기능 활성화 카드 */}
        <div className="ad-card">
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-center gap-2">
              <Stamp className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
              <h2 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">스탬프 기능</h2>
            </div>
            <p className="mt-1 text-[12px] text-[color:var(--ad-faint)]">
              스탬프 적립 기능을 켜거나 끕니다.
            </p>
          </div>
          <div className="px-5 pb-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">스탬프 적립 활성화</p>
                <p className="mt-1 text-[12.5px] text-[color:var(--ad-muted)]">
                  토글 ON 하시면 고객이 태그히어를 통해 포인트 대신 스탬프를 적립할 수 있습니다.
                </p>
              </div>
              <Switch
                checked={enabled}
                onCheckedChange={handleToggleEnabled}
              />
            </div>
          </div>
        </div>

        {/* 첫 적립 스탬프 개수 */}
        <div className={cn('ad-card', !enabled && 'opacity-50 pointer-events-none')}>
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-center gap-2">
              <Gift className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
              <h2 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">첫 적립 스탬프 개수</h2>
            </div>
            <p className="mt-1 text-[12px] text-[color:var(--ad-faint)]">
              첫 방문 고객이 받을 스탬프 개수를 설정합니다.
            </p>
          </div>
          <div className="px-5 pb-5">
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-[color:var(--ad-ink-2)]">첫 적립 시</span>
              <Input
                type="number"
                value={firstStampBonus}
                onChange={(e) => setFirstStampBonus(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                min={1}
                max={10}
                disabled={!enabled}
                className="w-20 text-center ad-tnum rounded-[10px] border-[color:var(--ad-line-strong)] text-[13.5px] focus-visible:ring-0 focus:border-[color:var(--ad-navy)]"
              />
              <span className="text-[13px] text-[color:var(--ad-ink-2)]">개 적립</span>
            </div>
            <p className="mt-2 text-[12px] text-[color:var(--ad-faint)]">
              {firstStampBonus > 1
                ? `첫 방문 고객은 ${firstStampBonus}개의 스탬프가 한번에 적립됩니다. (2회차부터 1개씩 적립)`
                : '기본값: 첫 방문 포함 모든 방문에서 1개씩 적립됩니다.'}
            </p>
            <div className="mt-4 flex justify-end">
              <Button
                size="sm"
                className="ad-press inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] border-0 bg-white px-3.5 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] disabled:opacity-40"
                disabled={!enabled || isSavingBonus}
                onClick={async () => {
                  setIsSavingBonus(true);
                  try {
                    const token = localStorage.getItem('token');
                    const res = await fetch(`${API_BASE}/api/stamp-settings`, {
                      method: 'PUT',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                      },
                      body: JSON.stringify({ firstStampBonus }),
                    });
                    if (res.ok) {
                      showToast('첫 적립 스탬프 개수가 저장되었습니다.', 'success');
                    } else {
                      showToast('저장 중 오류가 발생했습니다.', 'error');
                    }
                  } catch {
                    showToast('저장 중 오류가 발생했습니다.', 'error');
                  } finally {
                    setIsSavingBonus(false);
                  }
                }}
              >
                {isSavingBonus ? '저장 중...' : '저장'}
              </Button>
            </div>
          </div>
        </div>

        {/* 매번 적립 개수 직접 입력 카드 */}
        <div className={cn('ad-card', !enabled && 'opacity-50 pointer-events-none')}>
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-center gap-2">
              <Stamp className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
              <h2 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">매번 적립 개수 직접 입력</h2>
            </div>
            <p className="mt-1 text-[12px] text-[color:var(--ad-faint)]">
              카페 음료 개수처럼, 적립할 때마다 스탬프 개수를 직접 입력합니다.
            </p>
          </div>
          <div className="px-5 pb-5">
            <div className="flex items-center justify-between">
              <div className="pr-4">
                <p className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">적립 개수 직접 입력</p>
                <p className="mt-1 text-[12.5px] text-[color:var(--ad-muted)]">
                  토글 ON 하시면 스탬프 적립 시 개수 입력 팝업이 뜹니다. <strong>하루 1회 적립 제한이 해제되고</strong>,
                  첫 방문 보너스 대신 입력한 개수만 적립됩니다. CRM 수동 적립 시에도 고객에게 적립 알림톡이 발송됩니다.
                </p>
              </div>
              <Switch
                checked={manualStampCountEnabled}
                onCheckedChange={handleToggleManualCount}
                disabled={!enabled}
              />
            </div>
          </div>
        </div>

        {/* 보상 설정 카드 */}
        <div className={cn('ad-card', !enabled && 'opacity-50 pointer-events-none')}>
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-center gap-2">
              <Gift className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
              <h2 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">보상 설정</h2>
            </div>
            <p className="mt-1 text-[12px] text-[color:var(--ad-faint)]">
              보상을 줄 스탬프 개수를 추가하고, 각 단계별 보상을 설정하세요.
            </p>
          </div>
          <div className="px-5 pb-5 space-y-5">
            {/* 보상 단계 추가 */}
            <div className="space-y-3">
              <label className="block text-[13px] font-medium text-[color:var(--ad-ink-2)]">보상 단계 추가</label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={newTierInput}
                  onChange={(e) => setNewTierInput(e.target.value)}
                  onKeyDown={handleNewTierKeyDown}
                  placeholder="스탬프 개수 (1~50)"
                  min={1}
                  max={50}
                  disabled={!enabled}
                  className="w-48 rounded-[10px] border-[color:var(--ad-line-strong)] text-[13.5px] focus-visible:ring-0 focus:border-[color:var(--ad-navy)]"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="ad-press inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] border-0 bg-white px-3.5 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] disabled:opacity-40"
                  disabled={!enabled || !newTierInput}
                  onClick={() => {
                    const num = parseInt(newTierInput);
                    if (!isNaN(num)) addTier(num);
                  }}
                >
                  <Plus className="h-4 w-4" strokeWidth={1.8} />
                  추가
                </Button>
              </div>
              {/* 선택된 티어 뱃지 */}
              {selectedTiers.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedTiers.map(tier => (
                    <span
                      key={tier}
                      className="inline-flex items-center gap-1 rounded-full bg-[color:var(--ad-bg)] px-2.5 py-1 text-[12px] font-medium ad-tnum text-[color:var(--ad-ink-2)]"
                    >
                      {tier}개
                      <button
                        onClick={() => removeTier(tier)}
                        className="ml-0.5 hover:text-[color:var(--ad-neg)] transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 각 티어별 보상 에디터 */}
            {selectedTiers.length === 0 ? (
              <div className="text-center py-8 text-[13px] text-[color:var(--ad-faint)]">
                보상을 줄 스탬프 개수를 추가해주세요.
              </div>
            ) : (
              <div className="space-y-4">
                {selectedTiers.map((tier) => (
                  <RewardTierEditor
                    key={tier}
                    tier={tier}
                    options={rewardOptions[tier] || []}
                    onChange={(opts) => setTierOptions(tier, opts)}
                    onRemove={() => removeTier(tier)}
                    disabled={!enabled}
                  />
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button onClick={handleSave} disabled={isSaving || !enabled} className="ad-press inline-flex h-10 items-center justify-center gap-1.5 rounded-[12px] bg-[color:var(--ad-ink)] px-4 text-[13.5px] font-semibold text-white hover:bg-[#383c40] disabled:opacity-40">
                {isSaving ? '저장 중...' : '보상 저장하기'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
