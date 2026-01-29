'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  WaitingTypeManager,
  WaitingTypeEditModal,
  WaitingCallSettings,
  WaitingType,
  WaitingSetting,
} from '@/components/waiting';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import Link from 'next/link';

export default function WaitingSettingsPage() {
  const router = useRouter();
  const { showToast, ToastComponent } = useToast();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  // Data states
  const [settings, setSettings] = useState<Partial<WaitingSetting>>({});
  const [types, setTypes] = useState<WaitingType[]>([]);
  const [originalSettings, setOriginalSettings] = useState<Partial<WaitingSetting>>({});

  // UI states
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<WaitingType | null>(null);
  const [isTypeSaving, setIsTypeSaving] = useState(false);
  const [isTypeDeleting, setIsTypeDeleting] = useState(false);

  // Check if settings have changed
  const hasChanges = JSON.stringify(settings) !== JSON.stringify(originalSettings);

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      const [settingsRes, typesRes] = await Promise.all([
        fetch(`${apiUrl}/api/waiting/settings`, { headers }),
        fetch(`${apiUrl}/api/waiting/types`, { headers }),
      ]);

      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        setSettings(settingsData.setting || {});
        setOriginalSettings(settingsData.setting || {});
      }

      if (typesRes.ok) {
        const typesData = await typesRes.json();
        setTypes(typesData.types || []);
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
      showToast('설정을 불러오는데 실패했습니다.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl, showToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle settings change
  const handleSettingsChange = (key: keyof WaitingSetting, value: any) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  // Save settings
  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${apiUrl}/api/waiting/settings`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          callTimeoutMinutes: settings.callTimeoutMinutes,
          maxCallCount: settings.maxCallCount,
          autoCancel: settings.autoCancel,
          maxWaitingCount: settings.maxWaitingCount,
          showEstimatedTime: settings.showEstimatedTime,
          waitingNote: settings.waitingNote,
          waitingCallNote: settings.waitingCallNote,
        }),
      });

      if (res.ok) {
        const updatedSettings = await res.json();
        setSettings(updatedSettings);
        setOriginalSettings(updatedSettings);
        showToast('설정이 저장되었습니다.', 'success');
      } else {
        throw new Error('Failed to save settings');
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      showToast('설정 저장에 실패했습니다.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle type add
  const handleAddType = () => {
    setEditingType(null);
    setEditModalOpen(true);
  };

  // Handle type edit
  const handleEditType = (type: WaitingType) => {
    setEditingType(type);
    setEditModalOpen(true);
  };

  // Handle type save
  const handleSaveType = async (data: {
    id?: string;
    name: string;
    avgWaitTimePerTeam: number;
    minPartySize: number;
    maxPartySize: number;
    description: string | null;
    isActive: boolean;
  }) => {
    setIsTypeSaving(true);
    try {
      const token = localStorage.getItem('token');
      const isNew = !data.id;
      const url = isNew
        ? `${apiUrl}/api/waiting/types`
        : `${apiUrl}/api/waiting/types/${data.id}`;
      const method = isNew ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: data.name,
          avgWaitTimePerTeam: data.avgWaitTimePerTeam,
          minPartySize: data.minPartySize,
          maxPartySize: data.maxPartySize,
          description: data.description,
          isActive: data.isActive,
        }),
      });

      if (res.ok) {
        showToast(isNew ? '유형이 추가되었습니다.' : '유형이 수정되었습니다.', 'success');
        setEditModalOpen(false);
        setEditingType(null);
        fetchData();
      } else {
        const error = await res.json();
        throw new Error(error.message || 'Failed to save type');
      }
    } catch (error: any) {
      console.error('Failed to save type:', error);
      showToast(error.message || '유형 저장에 실패했습니다.', 'error');
    } finally {
      setIsTypeSaving(false);
    }
  };

  // Handle type delete
  const handleDeleteType = async (id: string) => {
    setIsTypeDeleting(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${apiUrl}/api/waiting/types/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (res.ok) {
        showToast('유형이 삭제되었습니다.', 'success');
        setEditModalOpen(false);
        setEditingType(null);
        fetchData();
      } else {
        const error = await res.json();
        throw new Error(error.message || 'Failed to delete type');
      }
    } catch (error: any) {
      console.error('Failed to delete type:', error);
      showToast(error.message || '유형 삭제에 실패했습니다.', 'error');
    } finally {
      setIsTypeDeleting(false);
    }
  };

  // Handle type reorder
  const handleReorderTypes = async (orderedIds: string[]) => {
    setIsReordering(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${apiUrl}/api/waiting/types/reorder`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderedIds }),
      });

      if (res.ok) {
        showToast('순서가 변경되었습니다.', 'success');
        fetchData();
      } else {
        throw new Error('Failed to reorder types');
      }
    } catch (error) {
      console.error('Failed to reorder types:', error);
      showToast('순서 변경에 실패했습니다.', 'error');
    } finally {
      setIsReordering(false);
    }
  };

  // Check if can delete type (need at least one active type)
  const canDeleteType = () => {
    const activeCount = types.filter((t) => t.isActive).length;
    if (!editingType) return true;
    if (!editingType.isActive) return true;
    return activeCount > 1;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-brand-800 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-neutral-500">로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      {ToastComponent}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/waiting">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">웨이팅 설정</h1>
            <p className="text-sm text-neutral-500 mt-0.5">
              웨이팅 서비스의 기본 설정을 관리합니다.
            </p>
          </div>
        </div>

        <Button
          onClick={handleSaveSettings}
          disabled={isSaving || !hasChanges}
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              저장 중...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              설정 저장
            </>
          )}
        </Button>
      </div>

      <div className="space-y-8">
        {/* Type Manager */}
        <WaitingTypeManager
          types={types}
          onAdd={handleAddType}
          onEdit={handleEditType}
          onReorder={handleReorderTypes}
          isReordering={isReordering}
        />

        {/* Call & Other Settings */}
        <WaitingCallSettings
          settings={settings}
          onChange={handleSettingsChange}
        />
      </div>

      {/* Type Edit Modal */}
      <WaitingTypeEditModal
        open={editModalOpen}
        onOpenChange={(open) => {
          setEditModalOpen(open);
          if (!open) {
            setEditingType(null);
          }
        }}
        type={editingType}
        onSave={handleSaveType}
        onDelete={handleDeleteType}
        isSaving={isTypeSaving}
        isDeleting={isTypeDeleting}
        canDelete={canDeleteType()}
      />
    </div>
  );
}
