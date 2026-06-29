'use client';

import { API_BASE } from '@/lib/api-config';
import { useEffect, useState, useCallback } from 'react';
import { trackEvent } from '@/lib/analytics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  const apiUrl = API_BASE;
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
      const res = await fetch(`${apiUrl}/api/visit-source-settings`, {
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
  }, [apiUrl, showToast]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleToggleEnabled = async (newEnabled: boolean) => {
    setEnabled(newEnabled);
    try {
      const token = localStorage.getItem('token');
      await fetch(`${apiUrl}/api/visit-source-settings`, {
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
      await fetch(`${apiUrl}/api/visit-source-settings`, {
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
      await fetch(`${apiUrl}/api/visit-source-settings`, {
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
      await fetch(`${apiUrl}/api/visit-source-settings`, {
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
      const res = await fetch(`${apiUrl}/api/visit-source-settings`, {
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
      await fetch(`${apiUrl}/api/visit-source-settings`, {
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
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        <div className="text-center py-12 text-neutral-500">불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      {ToastComponent}

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Left Panel - Settings */}
        <div className="flex-1 lg:max-w-3xl">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-neutral-900">방문 경로 추적</h1>
            <p className="text-neutral-500 mt-1">
              고객이 매장을 어떻게 알게 되었는지 추적하여 마케팅 효과를 분석합니다.
            </p>
          </div>

          <div className="space-y-6">
        {/* 사용 안내 카드 */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">💡 방문 경로 추적 안내</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 text-sm text-neutral-600">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-neutral-100 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-medium">1</span>
                </div>
                <p>
                  기능을 활성화하면 고객이 포인트/스탬프 적립 시 &quot;저희 매장을 어떻게 알게 되셨나요?&quot; 질문이 표시됩니다.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-neutral-100 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-medium">2</span>
                </div>
                <p>
                  고객이 선택한 방문 경로는 <strong>고객 리스트</strong>에서 확인할 수 있습니다.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-neutral-100 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-medium">3</span>
                </div>
                <p>
                  아래에서 고객에게 보여줄 방문 경로 옵션을 추가/삭제하거나 이름을 수정할 수 있습니다.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 기능 활성화 카드 */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-neutral-600" />
              <CardTitle className="text-lg">방문 경로 추적 기능</CardTitle>
            </div>
            <p className="text-sm text-neutral-500 mt-1">
              방문 경로 추적 기능을 켜거나 끕니다.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-neutral-900">방문 경로 추적 활성화</p>
                <p className="text-sm text-neutral-500 mt-1">
                  토글 ON 하시면 고객 등록 시 방문 경로를 선택할 수 있습니다.
                </p>
              </div>
              <Switch checked={enabled} onCheckedChange={handleToggleEnabled} />
            </div>
          </CardContent>
        </Card>

        {/* 항목 관리 카드 */}
        <Card className={!enabled ? 'opacity-50 pointer-events-none' : ''}>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">항목 관리</CardTitle>
              <span className="text-sm text-neutral-500">
                {options.length} / {MAX_OPTIONS}
              </span>
            </div>
            <p className="text-sm text-neutral-500 mt-1">
              고객에게 보여줄 방문 경로 옵션을 관리합니다. 각 항목의 표시 여부를 설정할 수 있습니다.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
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
                  className={`flex items-center gap-3 p-3 bg-neutral-50 rounded-lg transition-all
                    ${draggedId === option.id ? 'opacity-50' : ''}
                    ${dragOverId === option.id ? 'border-2 border-primary border-dashed' : ''}`}
                >
                  <GripVertical className={`w-4 h-4 text-neutral-400 ${enabled ? 'cursor-grab active:cursor-grabbing' : ''}`} />
                  <Input
                    value={option.label}
                    onChange={(e) => handleUpdateLabel(option.id, e.target.value)}
                    className="flex-1 bg-white"
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
                    className="text-neutral-400 hover:text-red-500"
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
              >
                <Plus className="w-4 h-4 mr-1" />
                추가
              </Button>
            </div>
            {options.length >= MAX_OPTIONS && (
              <p className="text-sm text-amber-600">
                최대 {MAX_OPTIONS}개까지만 추가할 수 있습니다.
              </p>
            )}

            {/* 저장 버튼 */}
            <div className="flex justify-end pt-4">
              <Button onClick={handleSaveLabels} disabled={isSaving || !enabled}>
                {isSaving ? '저장 중...' : '변경사항 저장'}
              </Button>
            </div>
          </CardContent>
        </Card>
          </div>
        </div>

        {/* Right Panel - Preview Image */}
        <div className="hidden lg:block flex-none w-[300px] sticky top-8 self-start">
          <div className="flex flex-col items-center gap-2">
            <img
              src="/images/방문경로.png"
              alt="방문 경로 미리보기"
              className="w-full shadow-lg"
              style={{ borderRadius: 20 }}
            />
            <p className="text-xs text-neutral-400">미리보기</p>
          </div>
        </div>
      </div>
    </div>
  );
}
