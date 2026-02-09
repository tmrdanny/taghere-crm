'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Stamp, Gift, Plus, X, Dice5 } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

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
    <div className="space-y-3 p-4 bg-neutral-50 rounded-lg border border-neutral-200">
      {/* Tier Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
            <span className="text-sm font-bold text-amber-700">{tier}</span>
          </div>
          <label className="text-sm font-medium text-neutral-700">
            스탬프 {tier}개 보상
          </label>
          {isMultiple && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
              <Dice5 className="w-3 h-3" />
              랜덤
            </span>
          )}
        </div>
        <button
          onClick={onRemove}
          disabled={disabled}
          className="p-1.5 text-neutral-400 hover:text-red-500 transition-colors"
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
          className="w-full py-2.5 border border-dashed border-neutral-300 rounded-lg text-sm text-neutral-500 hover:border-neutral-400 hover:text-neutral-600 transition-colors"
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
                className="flex-1"
              />
              {isMultiple && (
                <div className="flex items-center gap-1 shrink-0">
                  <Input
                    type="number"
                    value={opt.probability || ''}
                    onChange={(e) => updateOption(idx, 'probability', e.target.value)}
                    disabled={disabled}
                    className="w-20 text-right"
                    step="0.1"
                    min="0"
                    max="100"
                    placeholder="0"
                  />
                  <span className="text-sm text-neutral-500">%</span>
                </div>
              )}
              <button
                onClick={() => removeOption(idx)}
                disabled={disabled}
                className="p-1.5 text-neutral-400 hover:text-red-500 transition-colors shrink-0"
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
              className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              {isMultiple ? '랜덤 보상 추가' : '랜덤 보상 추가 (확률 설정)'}
            </button>
            {isMultiple && (
              <span className={`text-xs font-medium ${isValid ? 'text-emerald-600' : 'text-red-500'}`}>
                합계: {totalProbability.toFixed(1)}%{isValid ? ' ✓' : ' (100% 필요)'}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function StampSettingsPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const { showToast, ToastComponent } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Settings state
  const [enabled, setEnabled] = useState(true);
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
        const res = await fetch(`${apiUrl}/api/stamp-settings`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          setEnabled(data.enabled);

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
  }, [apiUrl]);

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

      const res = await fetch(`${apiUrl}/api/stamp-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled, rewards }),
      });

      if (res.ok) {
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
    setEnabled(newEnabled);
    try {
      const token = localStorage.getItem('token');
      await fetch(`${apiUrl}/api/stamp-settings`, {
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

  const handleNewTierKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const num = parseInt(newTierInput);
      if (!isNaN(num)) addTier(num);
    }
  };

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

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-neutral-900">스탬프 설정</h1>
        <p className="text-neutral-500 mt-1">
          스탬프 적립 기능과 보상을 설정합니다.
        </p>
      </div>

      <div className="space-y-6">
        {/* 사용 안내 카드 */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">스탬프 사용 안내</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 text-sm text-neutral-600">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-neutral-100 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-medium">1</span>
                </div>
                <p>
                  고객이 태그히어를 통해 로그인하면 스탬프가 적립됩니다.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-neutral-100 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-medium">2</span>
                </div>
                <p>
                  스탬프는 <strong>하루 1개씩 적립</strong>되며, 설정한 개수에 도달하면 보상을 사용할 수 있습니다.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-neutral-100 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-medium">3</span>
                </div>
                <p>
                  고객이 보상을 요청하면, <strong>고객 리스트</strong>에서 해당 고객을 찾아 해당 단계의 &quot;사용&quot; 버튼을 눌러주세요.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-amber-50 flex items-center justify-center shrink-0 mt-0.5">
                  <Dice5 className="w-3.5 h-3.5 text-amber-600" />
                </div>
                <p>
                  각 단계에 <strong>여러 보상을 등록</strong>하면 랜덤으로 하나가 추첨됩니다. 확률(%)을 설정하여 보상별 당첨 확률을 조절할 수 있습니다.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 스탬프 기능 활성화 카드 */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <Stamp className="w-5 h-5 text-neutral-600" />
              <CardTitle className="text-lg">스탬프 기능</CardTitle>
            </div>
            <p className="text-sm text-neutral-500 mt-1">
              스탬프 적립 기능을 켜거나 끕니다.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-neutral-900">스탬프 적립 활성화</p>
                <p className="text-sm text-neutral-500 mt-1">
                  토글 ON 하시면 고객이 태그히어를 통해 포인트 대신 스탬프를 적립할 수 있습니다.
                </p>
              </div>
              <Switch
                checked={enabled}
                onCheckedChange={handleToggleEnabled}
              />
            </div>
          </CardContent>
        </Card>

        {/* 보상 설정 카드 */}
        <Card className={!enabled ? 'opacity-50 pointer-events-none' : ''}>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-neutral-600" />
              <CardTitle className="text-lg">보상 설정</CardTitle>
            </div>
            <p className="text-sm text-neutral-500 mt-1">
              보상을 줄 스탬프 개수를 추가하고, 각 단계별 보상을 설정하세요.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 보상 단계 추가 */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-neutral-700">보상 단계 추가</label>
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
                  className="w-48"
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!enabled || !newTierInput}
                  onClick={() => {
                    const num = parseInt(newTierInput);
                    if (!isNaN(num)) addTier(num);
                  }}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  추가
                </Button>
              </div>
              {/* 선택된 티어 뱃지 */}
              {selectedTiers.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedTiers.map(tier => (
                    <span
                      key={tier}
                      className="inline-flex items-center gap-1 text-sm bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full border border-amber-200"
                    >
                      {tier}개
                      <button
                        onClick={() => removeTier(tier)}
                        className="ml-0.5 hover:text-red-500 transition-colors"
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
              <div className="text-center py-8 text-neutral-400 text-sm">
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
              <Button onClick={handleSave} disabled={isSaving || !enabled}>
                {isSaving ? '저장 중...' : '보상 저장하기'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
