'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { Plus, Users, Clock, Settings, RefreshCw, AlertCircle, ExternalLink, Tablet } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatNumber } from '@/lib/utils';

type StatusFilter = 'WAITING' | 'SEATED' | 'CANCELLED';

export default function WaitingPage() {
  const router = useRouter();
  const { showToast, ToastComponent } = useToast();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  // Data states
  const [settings, setSettings] = useState<WaitingSetting | null>(null);
  const [types, setTypes] = useState<WaitingType[]>([]);
  const [allItems, setAllItems] = useState<WaitingItem[]>([]); // 전체 데이터 캐시
  const [stats, setStats] = useState<WaitingStats | null>(null);
  const [storeSlug, setStoreSlug] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);

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

  // 초기 데이터 로드 (설정, 타입, 통계, 스토어, 전체 목록)
  const fetchInitialData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      // Fetch settings, types, today's stats, store info, wallet, and ALL items in parallel
      const [settingsRes, typesRes, statsRes, storeRes, walletRes, itemsRes] = await Promise.all([
        fetch(`${apiUrl}/api/waiting/settings`, { headers }),
        fetch(`${apiUrl}/api/waiting/types`, { headers }),
        fetch(`${apiUrl}/api/waiting/stats/today`, { headers }),
        fetch(`${apiUrl}/api/settings/store`, { headers }),
        fetch(`${apiUrl}/api/wallet`, { headers }),
        // 전체 상태 조회 (클라이언트 사이드 필터링용)
        fetch(`${apiUrl}/api/waiting?status=WAITING,CALLED,SEATED,CANCELLED,NO_SHOW&limit=500`, { headers }),
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

      if (walletRes.ok) {
        const walletData = await walletRes.json();
        setWalletBalance(walletData.balance ?? 0);
      }

      if (itemsRes.ok) {
        const itemsData = await itemsRes.json();
        setAllItems(itemsData.waitings || []);
      }
    } catch (error) {
      console.error('Failed to fetch waiting data:', error);
      showToast('데이터를 불러오는데 실패했습니다.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl, showToast]);

  // 폴링용 - 목록과 통계만 갱신 (설정, 타입, 스토어는 갱신 안함)
  const refreshData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      const [statsRes, itemsRes] = await Promise.all([
        fetch(`${apiUrl}/api/waiting/stats/today`, { headers }),
        fetch(`${apiUrl}/api/waiting?status=WAITING,CALLED,SEATED,CANCELLED,NO_SHOW&limit=500`, { headers }),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      if (itemsRes.ok) {
        const itemsData = await itemsRes.json();
        setAllItems(itemsData.waitings || []);
      }
    } catch (error) {
      console.error('Failed to refresh waiting data:', error);
    }
  }, [apiUrl]);

  // 수동 새로고침
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refreshData();
    setIsRefreshing(false);
  }, [refreshData]);

  // 클라이언트 사이드 필터링 (탭 전환 시 API 호출 없이 즉시 반영)
  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      // 상태 필터
      if (selectedStatus === 'WAITING') {
        if (!['WAITING', 'CALLED'].includes(item.status)) return false;
      } else if (selectedStatus === 'CANCELLED') {
        if (!['CANCELLED', 'NO_SHOW'].includes(item.status)) return false;
      } else if (item.status !== selectedStatus) {
        return false;
      }
      // 타입 필터
      if (selectedTypeId && item.waitingTypeId !== selectedTypeId) return false;
      return true;
    });
  }, [allItems, selectedStatus, selectedTypeId]);

  // 초기 로드 (1회만)
  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // 폴링 - 5초마다 목록과 통계만 갱신
  useEffect(() => {
    const interval = setInterval(() => {
      refreshData();
    }, 5000);

    return () => clearInterval(interval);
  }, [refreshData]);

  // Handle operation status change
  const handleOperationStatusChange = async (newStatus: WaitingOperationStatus) => {
    // 접수 중으로 변경 시 웨이팅 유형이 있는지 확인
    if (newStatus === 'ACCEPTING') {
      const activeTypes = types.filter((t) => t.isActive);
      if (activeTypes.length === 0) {
        showToast('웨이팅 설정 페이지에서 웨이팅 유형을 1개 이상 추가해주세요.', 'error');
        router.push('/waiting/settings');
        return;
      }
    }

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
        const data = await res.json().catch(() => null);
        if (res.status === 401) {
          showToast('로그인이 만료되었습니다. 다시 로그인해주세요.', 'error');
          localStorage.removeItem('token');
          router.push('/login');
          return;
        }
        throw new Error(data?.error || 'Failed to change operation status');
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
        refreshData();
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
        refreshData();
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
        refreshData();
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
        refreshData();
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
    const item = allItems.find((i) => i.id === id);
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
        refreshData();
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
        refreshData();
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

  // 충전금 0원이면 웨이팅 서비스 사용 불가
  if (walletBalance !== null && walletBalance <= 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-neutral-900 mb-2">웨이팅 서비스 이용 불가</h1>
          <p className="text-neutral-600 mb-6">
            웨이팅 서비스는 충전금이 10,000원 이상일 때 사용 가능합니다.
            <br />
            현재 잔액: <span className="font-semibold text-red-500">0원</span>
          </p>
          <Link href="/billing">
            <Button>
              충전하러 가기
            </Button>
          </Link>
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
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
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

      {/* CTA: 웨이팅 화면 켜기 */}
      {storeSlug && (
        <div className="mb-6 p-5 bg-gradient-to-r from-brand-800 to-brand-700 rounded-xl shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                <Tablet className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-white font-bold text-lg">태블릿에서 웨이팅 화면 켜기</h3>
                <p className="text-white/80 text-sm mt-0.5">
                  고객이 직접 웨이팅을 등록할 수 있는 화면을 태블릿에서 띄워주세요
                </p>
              </div>
            </div>
            <Button
              onClick={() => window.open(`/w/${storeSlug}/tablet`, '_blank')}
              className="bg-white text-brand-800 hover:bg-white/90 font-semibold px-6 h-11 shadow-md"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              웨이팅 화면 열기
            </Button>
          </div>
        </div>
      )}

      {/* Warning if wallet balance is low */}
      {walletBalance !== null && walletBalance > 0 && walletBalance < 10000 && (
        <div className="flex items-center justify-between gap-3 p-4 mb-6 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <div>
              <p className="font-medium text-red-800">
                충전금이 부족합니다
              </p>
              <p className="text-sm text-red-700 mt-0.5">
                웨이팅 서비스는 충전금이 10,000원 이상일 때 사용 가능합니다. (현재 잔액: {formatNumber(walletBalance)}원)
              </p>
            </div>
          </div>
          <Link href="/billing">
            <Button variant="outline" size="sm" className="border-red-300 text-red-700 hover:bg-red-100">
              충전하기
            </Button>
          </Link>
        </div>
      )}

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
          items={filteredItems}
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
