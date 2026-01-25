'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import {
  WaitingOperationStatusSelector,
  WaitingTypeCards,
  WaitingTypeTabs,
  WaitingStatusTabs,
  WaitingTable,
  AddWaitingModal,
  CancelReasonModal,
  WaitingOperationStatus,
  type WaitingType,
  type WaitingItem,
  type WaitingSetting,
  type WaitingStats,
  type CancelReason,
} from '@/components/waiting';
import { Plus, Users, Clock, Settings, RefreshCw, AlertCircle, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { formatNumber } from '@/lib/utils';

type StatusFilter = 'WAITING' | 'SEATED' | 'CANCELLED';

export default function WaitingPage() {
  const { showToast, ToastComponent } = useToast();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  // Data states
  const [settings, setSettings] = useState<WaitingSetting | null>(null);
  const [types, setTypes] = useState<WaitingType[]>([]);
  const [items, setItems] = useState<WaitingItem[]>([]);
  const [stats, setStats] = useState<WaitingStats | null>(null);
  const [storeSlug, setStoreSlug] = useState<string | null>(null);

  // Filter states
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>('WAITING');

  // UI states
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isStatusChanging, setIsStatusChanging] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [preSelectedTypeId, setPreSelectedTypeId] = useState<string | null>(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [cancelTargetNumber, setCancelTargetNumber] = useState<number | undefined>(undefined);
  const [isAddingWaiting, setIsAddingWaiting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // Action loading states
  const [loadingStates, setLoadingStates] = useState<{
    call: string | null;
    seat: string | null;
    cancel: string | null;
    restore: string | null;
  }>({
    call: null,
    seat: null,
    cancel: null,
    restore: null,
  });

  // Fetch data
  const fetchData = useCallback(async (showLoadingIndicator = false) => {
    if (showLoadingIndicator) {
      setIsRefreshing(true);
    }

    try {
      const token = localStorage.getItem('token');
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      // Fetch settings, types, today's stats, and store info in parallel
      const [settingsRes, typesRes, statsRes, storeRes] = await Promise.all([
        fetch(`${apiUrl}/api/waiting/settings`, { headers }),
        fetch(`${apiUrl}/api/waiting/types`, { headers }),
        fetch(`${apiUrl}/api/waiting/stats/today`, { headers }),
        fetch(`${apiUrl}/api/settings/store`, { headers }),
      ]);

      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        setSettings(settingsData.setting || settingsData);
      }

      if (typesRes.ok) {
        const typesData = await typesRes.json();
        setTypes(typesData.types || []);
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      if (storeRes.ok) {
        const storeData = await storeRes.json();
        if (storeData.slug) {
          setStoreSlug(storeData.slug);
        }
      }

      // Fetch waiting list with filters
      const params = new URLSearchParams();
      if (selectedTypeId) {
        params.append('typeId', selectedTypeId);
      }
      // WAITING 필터는 WAITING + CALLED 상태 모두 포함 (호출된 고객도 리스트에 표시)
      if (selectedStatus === 'WAITING') {
        params.append('status', 'WAITING,CALLED');
      } else {
        params.append('status', selectedStatus);
      }

      const itemsRes = await fetch(`${apiUrl}/api/waiting?${params.toString()}`, { headers });
      if (itemsRes.ok) {
        const itemsData = await itemsRes.json();
        setItems(itemsData.waitings || []);
      }
    } catch (error) {
      console.error('Failed to fetch waiting data:', error);
      showToast('데이터를 불러오는데 실패했습니다.', 'error');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [apiUrl, selectedTypeId, selectedStatus, showToast]);

  // Initial load
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Polling for real-time updates (every 5 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData(false);
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchData]);

  // Refetch when filters change
  useEffect(() => {
    fetchData();
  }, [selectedTypeId, selectedStatus, fetchData]);

  // Handle operation status change
  const handleOperationStatusChange = async (newStatus: WaitingOperationStatus) => {
    setIsStatusChanging(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${apiUrl}/api/waiting/settings/status`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ operationStatus: newStatus }),
      });

      if (res.ok) {
        setSettings((prev) => prev ? { ...prev, operationStatus: newStatus } : null);
        showToast('운영 상태가 변경되었습니다.', 'success');
      } else {
        throw new Error('Failed to change operation status');
      }
    } catch (error) {
      console.error('Failed to change operation status:', error);
      showToast('운영 상태 변경에 실패했습니다.', 'error');
    } finally {
      setIsStatusChanging(false);
    }
  };

  // Handle add waiting
  const handleAddWaiting = async (data: {
    waitingTypeId: string;
    phone: string | null;
    name: string | null;
    partySize: number;
    consentService: boolean;
    consentPrivacy: boolean;
    consentThirdParty: boolean;
  }) => {
    setIsAddingWaiting(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${apiUrl}/api/waiting`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          waitingTypeId: data.waitingTypeId,
          phone: data.phone,
          name: data.name,
          partySize: data.partySize,
          source: 'MANUAL',
        }),
      });

      if (res.ok) {
        showToast('웨이팅이 등록되었습니다.', 'success');
        setAddModalOpen(false);
        fetchData();
      } else {
        const error = await res.json();
        throw new Error(error.message || 'Failed to add waiting');
      }
    } catch (error: any) {
      console.error('Failed to add waiting:', error);
      showToast(error.message || '웨이팅 등록에 실패했습니다.', 'error');
    } finally {
      setIsAddingWaiting(false);
    }
  };

  // Handle call
  const handleCall = async (id: string) => {
    setLoadingStates((prev) => ({ ...prev, call: id }));
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${apiUrl}/api/waiting/${id}/call`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (res.ok) {
        showToast('호출되었습니다.', 'success');
        fetchData();
      } else {
        throw new Error('Failed to call');
      }
    } catch (error) {
      console.error('Failed to call:', error);
      showToast('호출에 실패했습니다.', 'error');
    } finally {
      setLoadingStates((prev) => ({ ...prev, call: null }));
    }
  };

  // Handle recall
  const handleRecall = async (id: string) => {
    setLoadingStates((prev) => ({ ...prev, call: id }));
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${apiUrl}/api/waiting/${id}/recall`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (res.ok) {
        showToast('재호출되었습니다.', 'success');
        fetchData();
      } else {
        throw new Error('Failed to recall');
      }
    } catch (error) {
      console.error('Failed to recall:', error);
      showToast('재호출에 실패했습니다.', 'error');
    } finally {
      setLoadingStates((prev) => ({ ...prev, call: null }));
    }
  };

  // Handle seat
  const handleSeat = async (id: string) => {
    setLoadingStates((prev) => ({ ...prev, seat: id }));
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${apiUrl}/api/waiting/${id}/seat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (res.ok) {
        showToast('착석 처리되었습니다.', 'success');
        fetchData();
      } else {
        throw new Error('Failed to seat');
      }
    } catch (error) {
      console.error('Failed to seat:', error);
      showToast('착석 처리에 실패했습니다.', 'error');
    } finally {
      setLoadingStates((prev) => ({ ...prev, seat: null }));
    }
  };

  // Handle cancel - open modal
  const handleCancelClick = (id: string) => {
    const item = items.find((i) => i.id === id);
    setCancelTargetId(id);
    setCancelTargetNumber(item?.waitingNumber);
    setCancelModalOpen(true);
  };

  // Handle cancel - confirm with reason
  const handleCancelConfirm = async (reason: CancelReason) => {
    if (!cancelTargetId) return;

    setIsCancelling(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${apiUrl}/api/waiting/${cancelTargetId}/cancel`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason }),
      });

      if (res.ok) {
        showToast('취소 처리되었습니다.', 'success');
        setCancelModalOpen(false);
        setCancelTargetId(null);
        setCancelTargetNumber(undefined);
        fetchData();
      } else {
        throw new Error('Failed to cancel');
      }
    } catch (error) {
      console.error('Failed to cancel:', error);
      showToast('취소 처리에 실패했습니다.', 'error');
    } finally {
      setIsCancelling(false);
    }
  };

  // Handle restore
  const handleRestore = async (id: string) => {
    setLoadingStates((prev) => ({ ...prev, restore: id }));
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${apiUrl}/api/waiting/${id}/restore`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (res.ok) {
        showToast('되돌리기 처리되었습니다.', 'success');
        fetchData();
      } else {
        throw new Error('Failed to restore');
      }
    } catch (error) {
      console.error('Failed to restore:', error);
      showToast('되돌리기 처리에 실패했습니다.', 'error');
    } finally {
      setLoadingStates((prev) => ({ ...prev, restore: null }));
    }
  };

  // Handle add from type card click
  const handleAddFromTypeCard = (typeId: string) => {
    setPreSelectedTypeId(typeId);
    setAddModalOpen(true);
  };

  // Calculate type counts for tabs
  const typeCounts: Record<string, number> = {};
  stats?.byType?.forEach((t) => {
    typeCounts[t.typeId] = t.teams;
  });

  // Get empty message based on status filter
  const getEmptyMessage = () => {
    switch (selectedStatus) {
      case 'WAITING':
        return '대기 중인 웨이팅이 없습니다.';
      case 'SEATED':
        return '착석 내역이 없습니다.';
      case 'CANCELLED':
        return '취소 내역이 없습니다.';
      default:
        return '웨이팅 내역이 없습니다.';
    }
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
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {ToastComponent}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <WaitingOperationStatusSelector
            status={settings?.operationStatus || 'CLOSED'}
            onChange={handleOperationStatusChange}
            isLoading={isStatusChanging}
          />

          {/* Stats */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2 text-neutral-600">
              <Users className="w-4 h-4" />
              <span>
                총 웨이팅{' '}
                <span className="font-semibold text-neutral-900">
                  {stats?.totalTeams || 0}팀
                </span>
                {' / '}
                <span className="font-semibold text-neutral-900">
                  {stats?.totalGuests || 0}명
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2 text-neutral-600">
              <Clock className="w-4 h-4" />
              <span>
                예상시간{' '}
                <span className="font-semibold text-neutral-900">
                  {stats?.estimatedMinutes || 0}분
                </span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true)}
            disabled={isRefreshing}
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
          {storeSlug && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`/w/${storeSlug}/tablet`, '_blank')}
            >
              <ExternalLink className="w-4 h-4 mr-1" />
              웨이팅 화면 켜기
            </Button>
          )}
          <Link href="/waiting/settings">
            <Button variant="outline" size="sm">
              <Settings className="w-4 h-4 mr-1" />
              설정
            </Button>
          </Link>
          <Button
            onClick={() => {
              setPreSelectedTypeId(null);
              setAddModalOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1" />
            웨이팅 등록
          </Button>
        </div>
      </div>

      {/* Warning if operation is not accepting */}
      {settings?.operationStatus !== 'ACCEPTING' && (
        <div className="flex items-center gap-3 p-4 mb-6 bg-warning-light border border-warning rounded-lg">
          <AlertCircle className="w-5 h-5 text-warning flex-shrink-0" />
          <div>
            <p className="font-medium text-amber-800">
              현재 웨이팅 접수가{' '}
              {settings?.operationStatus === 'WALK_IN'
                ? '바로입장 상태'
                : settings?.operationStatus === 'PAUSED'
                ? '일시정지 상태'
                : '운영종료 상태'}
              입니다.
            </p>
            <p className="text-sm text-amber-700 mt-0.5">
              새로운 웨이팅을 받으려면 운영 상태를 '접수중'으로 변경해주세요.
            </p>
          </div>
        </div>
      )}

      {/* Type Cards */}
      <div className="mb-6">
        <WaitingTypeCards
          types={types}
          stats={stats?.byType || []}
          onAddClick={handleAddFromTypeCard}
        />
      </div>

      {/* Filters */}
      <Card className="mb-6">
        {/* Type Tabs */}
        <div className="p-4 border-b border-neutral-100">
          <WaitingTypeTabs
            types={types}
            selectedTypeId={selectedTypeId}
            counts={typeCounts}
            totalCount={stats?.totalTeams || 0}
            onSelect={setSelectedTypeId}
          />
        </div>

        {/* Status Tabs */}
        <WaitingStatusTabs
          selectedStatus={selectedStatus}
          counts={stats?.byStatus || { waiting: 0, seated: 0, cancelled: 0 }}
          onSelect={setSelectedStatus}
        />

        {/* Table */}
        <WaitingTable
          items={items}
          onCall={handleCall}
          onRecall={handleRecall}
          onSeat={handleSeat}
          onCancel={handleCancelClick}
          onRestore={handleRestore}
          loadingStates={loadingStates}
          maxCallCount={settings?.maxCallCount || 2}
          callTimeoutMinutes={settings?.callTimeoutMinutes || 3}
          emptyMessage={getEmptyMessage()}
        />
      </Card>

      {/* Add Waiting Modal */}
      <AddWaitingModal
        open={addModalOpen}
        onOpenChange={(open) => {
          setAddModalOpen(open);
          if (!open) {
            setPreSelectedTypeId(null);
          }
        }}
        types={types}
        preSelectedTypeId={preSelectedTypeId}
        onSubmit={handleAddWaiting}
        isLoading={isAddingWaiting}
      />

      {/* Cancel Reason Modal */}
      <CancelReasonModal
        open={cancelModalOpen}
        onOpenChange={(open) => {
          setCancelModalOpen(open);
          if (!open) {
            setCancelTargetId(null);
            setCancelTargetNumber(undefined);
          }
        }}
        onConfirm={handleCancelConfirm}
        isLoading={isCancelling}
        waitingNumber={cancelTargetNumber}
      />
    </div>
  );
}
