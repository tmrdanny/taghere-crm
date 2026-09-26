'use client';

import { API_BASE } from '@/lib/api-config';
import { useEffect, useState, useCallback } from 'react';
import { trackEvent } from '@/lib/analytics';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { MapPin, GripVertical, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

interface VisitSourceOption {
  id: string;
  label: string;
  order: number;
  enabled: boolean;
}

interface VisitSourceSettings {
  enabled: boolean;
  options: VisitSourceOption[];
}

// 최대 항목 개수
const MAX_OPTIONS = 12;

export default function VisitSourcePage() {
  const { showToast, ToastComponent } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Settings state
  const [enabled, setEnabled] = useState(false);
  const [options, setOptions] = useState<VisitSourceOption[]>([]);

  // New option input
  const [newOptionLabel, setNewOptionLabel] = useState('');

  // Drag and drop state
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Fetch settings
  const fetchSettings = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/visit-source-settings`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data: VisitSourceSettings = await res.json();
        setEnabled(data.enabled);
        setOptions(data.options);
      }
    } catch (error) {
      console.error('Failed to fetch visit source settings:', error);
      showToast('설정을 불러오는데 실패했습니다.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleToggleEnabled = async (newEnabled: boolean) => {
    setEnabled(newEnabled);
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_BASE}/api/visit-source-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled: newEnabled }),
      });
      showToast(
        newEnabled ? '방문 경로 추적이 활성화되었습니다.' : '방문 경로 추적이 비활성화되었습니다.',
        'success'
      );
    } catch (error) {
      console.error('Failed to toggle visit source enabled:', error);
      setEnabled(!newEnabled);
    }
  };

  const handleToggleOption = async (optionId: string) => {
    const newOptions = options.map((opt) =>
      opt.id === optionId ? { ...opt, enabled: !opt.enabled } : opt
    );
    setOptions(newOptions);

    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_BASE}/api/visit-source-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ options: newOptions }),
      });
    } catch (error) {
      console.error('Failed to toggle option:', error);
      // 롤백
      setOptions(options);
    }
  };

  const handleAddOption = async () => {
    if (!newOptionLabel.trim()) {
      showToast('항목 이름을 입력해주세요.', 'error');
      return;
    }

    // 최대 개수 체크
    if (options.length >= MAX_OPTIONS) {
      showToast(`항목은 최대 ${MAX_OPTIONS}개까지만 추가할 수 있습니다.`, 'error');
      return;
    }

    // 새 ID 생성 (custom_로 시작하는 고유 ID)
    const newId = `custom_${Date.now()}`;
    const newOption: VisitSourceOption = {
      id: newId,
      label: newOptionLabel.trim(),
      order: options.length + 1,
      enabled: true,
    };

    const newOptions = [...options, newOption];
    setOptions(newOptions);
    setNewOptionLabel('');

    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_BASE}/api/visit-source-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ options: newOptions }),
      });
      showToast('항목이 추가되었습니다.', 'success');
    } catch (error) {
      console.error('Failed to add option:', error);
      setOptions(options);
      showToast('항목 추가에 실패했습니다.', 'error');
    }
  };

  const handleDeleteOption = async (optionId: string) => {
    const newOptions = options.filter((opt) => opt.id !== optionId);
    setOptions(newOptions);

    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_BASE}/api/visit-source-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ options: newOptions }),
      });
      showToast('항목이 삭제되었습니다.', 'success');
    } catch (error) {
      console.error('Failed to delete option:', error);
      setOptions(options);
      showToast('항목 삭제에 실패했습니다.', 'error');
    }
  };

  const handleUpdateLabel = async (optionId: string, newLabel: string) => {
    const newOptions = options.map((opt) =>
      opt.id === optionId ? { ...opt, label: newLabel } : opt
    );
    setOptions(newOptions);
  };

  const handleSaveLabels = async () => {
    setIsSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/visit-source-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ options }),
      });

      if (res.ok) {
        trackEvent('owner_visit_source_save', { option_count: options.length });
        showToast('설정이 저장되었습니다.', 'success');
      } else {
        const error = await res.json();
        showToast(error.error || '저장 중 오류가 발생했습니다.', 'error');
      }
    } catch (error) {
      console.error('Failed to save labels:', error);
      showToast('저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (id !== draggedId) {
      setDragOverId(id);
    }
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }

    const draggedIndex = options.findIndex((o) => o.id === draggedId);
    const targetIndex = options.findIndex((o) => o.id === targetId);

    const newOptions = [...options];
    const [removed] = newOptions.splice(draggedIndex, 1);
    newOptions.splice(targetIndex, 0, removed);

    // order 필드 업데이트
    const reorderedOptions = newOptions.map((opt, idx) => ({
      ...opt,
      order: idx + 1,
    }));

    setOptions(reorderedOptions);
    setDraggedId(null);
    setDragOverId(null);

    // API에 저장
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_BASE}/api/visit-source-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ options: reorderedOptions }),
      });
    } catch (error) {
      console.error('Failed to save reordered options:', error);
    }
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

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

      <div className="flex flex-col gap-8 lg:flex-row">
        {/* Left Panel - Settings */}
        <div className="flex-1 lg:max-w-3xl">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-[color:var(--ad-ink)]">방문 경로 추적</h1>
            <p className="mt-1 text-[13px] text-[color:var(--ad-muted)]">
              고객이 매장을 어떻게 알게 되었는지 추적하여 마케팅 효과를 분석합니다.
            </p>
          </div>

          <div className="space-y-4">
        {/* 사용 안내 카드 */}
        <div className="ad-card">
          <div className="border-b border-[color:var(--ad-line)] px-5 py-4">
            <h3 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">방문 경로 추적 안내</h3>
          </div>
          <div className="space-y-4 p-5">
            <div className="space-y-3 text-[13px] text-[color:var(--ad-ink-2)]">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)]">
                  <span className="ad-tnum text-[11.5px] font-medium">1</span>
                </div>
                <p>
                  기능을 활성화하면 고객이 포인트/스탬프 적립 시 &quot;저희 매장을 어떻게 알게 되셨나요?&quot; 질문이 표시됩니다.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)]">
                  <span className="ad-tnum text-[11.5px] font-medium">2</span>
                </div>
                <p>
                  고객이 선택한 방문 경로는 <strong>고객 리스트</strong>에서 확인할 수 있습니다.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)]">
                  <span className="ad-tnum text-[11.5px] font-medium">3</span>
                </div>
                <p>
                  아래에서 고객에게 보여줄 방문 경로 옵션을 추가/삭제하거나 이름을 수정할 수 있습니다.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 기능 활성화 카드 */}
        <div className="ad-card">
          <div className="border-b border-[color:var(--ad-line)] px-5 py-4">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
              <h3 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">방문 경로 추적 기능</h3>
            </div>
            <p className="mt-1 text-[12px] text-[color:var(--ad-faint)]">
              방문 경로 추적 기능을 켜거나 끕니다.
            </p>
          </div>
          <div className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[14px] font-medium text-[color:var(--ad-ink)]">방문 경로 추적 활성화</p>
                <p className="text-[13px] text-[color:var(--ad-muted)] mt-1">
                  토글 ON 하시면 고객 등록 시 방문 경로를 선택할 수 있습니다.
                </p>
              </div>
              <Switch checked={enabled} onCheckedChange={handleToggleEnabled} />
            </div>
          </div>
        </div>

        {/* 항목 관리 카드 */}
        <div className={`ad-card ${!enabled ? 'opacity-50 pointer-events-none' : ''}`}>
          <div className="border-b border-[color:var(--ad-line)] px-5 py-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">항목 관리</h3>
              <span className="ad-tnum text-[12.5px] text-[color:var(--ad-muted)]">
                {options.length} / {MAX_OPTIONS}
              </span>
            </div>
            <p className="mt-1 text-[12px] text-[color:var(--ad-faint)]">
              고객에게 보여줄 방문 경로 옵션을 관리합니다. 각 항목의 표시 여부를 설정할 수 있습니다.
            </p>
          </div>
          <div className="space-y-4 p-5">
            {/* 항목 목록 */}
            <div className="space-y-2">
              {options.map((option) => (
                <div
                  key={option.id}
                  draggable={enabled}
                  onDragStart={(e) => handleDragStart(e, option.id)}
                  onDragOver={(e) => handleDragOver(e, option.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, option.id)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-3 rounded-[12px] border border-[color:var(--ad-line)] bg-[color:var(--ad-bg-alt)] p-3 transition-all
                    ${draggedId === option.id ? 'opacity-50' : ''}
                    ${dragOverId === option.id ? 'border-2 border-dashed border-[color:var(--ad-ink)]' : ''}`}
                >
                  <GripVertical className={`w-4 h-4 text-[color:var(--ad-faint)] ${enabled ? 'cursor-grab active:cursor-grabbing' : ''}`} />
                  <Input
                    value={option.label}
                    onChange={(e) => handleUpdateLabel(option.id, e.target.value)}
                    className="h-10 flex-1 rounded-[10px] border-[color:var(--ad-line-strong)] bg-white text-[13.5px] focus:border-[color:var(--ad-ink)]"
                    disabled={!enabled}
                  />
                  <Switch
                    checked={option.enabled}
                    onCheckedChange={() => handleToggleOption(option.id)}
                    disabled={!enabled}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteOption(option.id)}
                    disabled={!enabled}
                    className="text-[color:var(--ad-faint)] hover:text-[color:var(--ad-neg)]"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>

            {/* 새 항목 추가 */}
            <div className="flex items-center gap-2 pt-2">
              <Input
                value={newOptionLabel}
                onChange={(e) => setNewOptionLabel(e.target.value)}
                placeholder="새 항목 이름 입력"
                className="h-10 rounded-[10px] border-[color:var(--ad-line-strong)] bg-white text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-ink)]"
                disabled={!enabled || options.length >= MAX_OPTIONS}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddOption();
                  }
                }}
              />
              <Button
                onClick={handleAddOption}
                disabled={!enabled || options.length >= MAX_OPTIONS}
                variant="outline"
                className="ad-press h-10 shrink-0 rounded-[10px] border-0 bg-white px-3.5 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
              >
                <Plus className="w-3.5 h-3.5 mr-1" strokeWidth={1.8} />
                추가
              </Button>
            </div>
            {options.length >= MAX_OPTIONS && (
              <p className="text-[12.5px] text-[color:var(--ad-muted)]">
                최대 {MAX_OPTIONS}개까지만 추가할 수 있습니다.
              </p>
            )}

            {/* 저장 버튼 */}
            <div className="flex justify-end border-t border-[color:var(--ad-line)] pt-4">
              <Button onClick={handleSaveLabels} disabled={isSaving || !enabled} className="ad-press inline-flex h-10 items-center justify-center gap-1.5 rounded-[12px] bg-[color:var(--ad-ink)] px-4 text-[13.5px] font-semibold text-white hover:bg-[#383c40] disabled:opacity-40">
                {isSaving ? '저장 중...' : '변경사항 저장'}
              </Button>
            </div>
          </div>
        </div>
          </div>
        </div>

        {/* Right Panel - Preview Image */}
        <div className="hidden lg:block flex-none w-[300px] sticky top-8 self-start">
          <div className="flex flex-col items-center gap-2">
            <img
              src="/images/방문경로.png"
              alt="방문 경로 미리보기"
              className="w-full shadow-[0_24px_60px_-20px_rgba(29,32,34,0.3)]"
              style={{ borderRadius: 20 }}
            />
            <p className="text-[12px] text-[color:var(--ad-faint)]">미리보기</p>
          </div>
        </div>
      </div>
    </div>
  );
}
