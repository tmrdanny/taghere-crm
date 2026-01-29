'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  TabletModeSelector,
  TabletWaitingForm,
  WalkInScreen,
  PausedOverlay,
  ClosedScreen,
} from '@/components/waiting';
import { useToast } from '@/components/ui/toast';
import { Loader2 } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

type TabletMode = 'register' | 'manage';

interface WaitingType {
  id: string;
  name: string;
  description: string | null;
  avgWaitTimePerTeam: number;
  minPartySize?: number;
  maxPartySize?: number;
  waitingCount: number;
  estimatedMinutes: number;
}

interface StoreInfo {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  operationStatus: 'ACCEPTING' | 'WALK_IN' | 'PAUSED' | 'CLOSED';
  pauseMessage: string | null;
  totalWaiting: number;
  estimatedMinutes: number;
  waitingTypes: WaitingType[];
}

interface RegistrationResult {
  waitingId: string;
  waitingNumber: number;
  position: number;
  estimatedMinutes: number;
  typeName: string;
  totalWaiting: number;
}

export default function TabletWaitingPage() {
  const params = useParams();
  const router = useRouter();
  const storeSlug = params.storeSlug as string;

  const [mode, setMode] = useState<TabletMode | null>(null);
  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formResetKey, setFormResetKey] = useState(0);
  const registeredPhoneRef = useRef<string>('');

  const { showToast, ToastComponent } = useToast();

  // Check saved mode from localStorage
  useEffect(() => {
    const savedMode = localStorage.getItem('tabletMode') as TabletMode | null;
    if (savedMode) {
      setMode(savedMode);
    }
  }, []);

  // Fetch store waiting info
  const fetchStoreInfo = useCallback(async () => {
    try {
      setError(null);

      const res = await fetch(`${API_BASE}/api/public/waiting/${storeSlug}/info`);

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('매장을 찾을 수 없습니다.');
        }
        throw new Error('매장 정보를 불러올 수 없습니다.');
      }

      const data = await res.json();

      // API 응답 구조를 프론트엔드 형식으로 변환
      const transformedData: StoreInfo = {
        id: data.store?.id || '',
        name: data.store?.name || '',
        slug: data.store?.slug || storeSlug,
        logo: data.store?.logo || null,
        operationStatus: data.operationStatus || 'CLOSED',
        pauseMessage: data.pauseMessage || null,
        totalWaiting: data.stats?.totalWaiting || 0,
        estimatedMinutes: data.stats?.estimatedMinutes || 0,
        waitingTypes: (data.types || []).map((type: any) => ({
          id: type.id,
          name: type.name,
          description: type.description,
          avgWaitTimePerTeam: type.avgWaitTimePerTeam || 5,
          minPartySize: type.minPartySize || 0,
          maxPartySize: type.maxPartySize || 20,
          waitingCount: type.currentWaitingCount || 0,
          estimatedMinutes: type.estimatedMinutes || 0,
        })),
      };

      setStoreInfo(transformedData);
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [storeSlug]);

  useEffect(() => {
    if (storeSlug) {
      fetchStoreInfo();
    }
  }, [storeSlug, fetchStoreInfo]);

  // Poll for updates (every 3 seconds for real-time feel)
  useEffect(() => {
    if (!storeSlug) return;

    const interval = setInterval(fetchStoreInfo, 3000);
    return () => clearInterval(interval);
  }, [storeSlug, fetchStoreInfo]);

  // Handle mode selection
  const handleSelectMode = (selectedMode: TabletMode) => {
    setMode(selectedMode);
    if (selectedMode === 'manage') {
      // Redirect to admin waiting page
      router.push('/waiting');
    }
  };

  // Handle registration
  const handleSubmit = async (data: {
    phone: string;
    waitingTypeId: string;
    partySize: number;
    marketingConsent?: boolean;
  }): Promise<RegistrationResult> => {
    if (!storeInfo) {
      throw new Error('매장 정보가 없습니다.');
    }

    setIsSubmitting(true);

    try {
      const res = await fetch(`${API_BASE}/api/public/waiting/${storeSlug}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: data.phone,
          waitingTypeId: data.waitingTypeId,
          partySize: data.partySize,
          marketingConsent: data.marketingConsent,
          source: 'TABLET',
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || '웨이팅 등록에 실패했습니다.');
      }

      const apiResult = await res.json();
      // API 응답을 프론트엔드 형식으로 변환
      const result: RegistrationResult = {
        waitingId: apiResult.waitingId,
        waitingNumber: apiResult.waitingNumber,
        position: apiResult.position,
        estimatedMinutes: apiResult.estimatedMinutes,
        typeName: apiResult.waitingTypeName || apiResult.typeName || '',
        totalWaiting: storeInfo.totalWaiting,
      };

      // 취소 시 사용할 전화번호 저장
      registeredPhoneRef.current = data.phone;

      return result;
    } catch (err) {
      showToast(err instanceof Error ? err.message : '등록 중 오류가 발생했습니다.', 'error');
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle cancellation
  const handleCancel = async (): Promise<void> => {
    const phone = registeredPhoneRef.current;
    if (!phone) {
      throw new Error('전화번호 정보가 없습니다.');
    }

    const res = await fetch(`${API_BASE}/api/public/waiting/${storeSlug}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || '취소에 실패했습니다.');
    }

    showToast('웨이팅이 취소되었습니다.', 'success');
    resetForm();
  };

  // Reset form
  const resetForm = () => {
    registeredPhoneRef.current = '';
    setFormResetKey(prev => prev + 1); // 폼 컴포넌트 강제 리마운트
    fetchStoreInfo();
  };

  // Handle view waiting list
  const handleViewWaitingList = () => {
    // For tablet, could open a modal or navigate to a list view
    const phone = window.prompt('등록하신 전화번호를 입력해주세요 (예: 01012345678)');
    if (phone) {
      const cleanPhone = phone.replace(/\D/g, '');
      // Could fetch and show status here
      router.push(`/w/${storeSlug}/complete?phone=${cleanPhone}`);
    }
  };

  // Handle check waiting in paused state
  const handleCheckWaiting = () => {
    handleViewWaitingList();
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-100">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-brand-800 animate-spin mx-auto mb-4" />
          <p className="text-neutral-500 text-lg">로딩 중...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !storeInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-100 p-8">
        <div className="text-center max-w-lg">
          <div className="w-20 h-20 bg-error-light rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl">!</span>
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 mb-3">
            {error || '매장 정보를 불러올 수 없습니다.'}
          </h1>
          <p className="text-neutral-500 mb-8 text-lg">
            잠시 후 다시 시도해주세요.
          </p>
          <button
            onClick={fetchStoreInfo}
            className="px-8 py-4 bg-brand-800 text-white rounded-xl text-lg font-medium hover:bg-brand-900 transition-colors"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  // Mode selection (first time)
  if (!mode) {
    return <TabletModeSelector onSelectMode={handleSelectMode} />;
  }

  // Render based on operation status
  switch (storeInfo.operationStatus) {
    case 'WALK_IN':
      return <WalkInScreen storeName={storeInfo.name} storeLogo={storeInfo.logo} />;

    case 'PAUSED':
      return (
        <PausedOverlay
          storeName={storeInfo.name}
          storeLogo={storeInfo.logo}
          totalWaiting={storeInfo.totalWaiting}
          pauseMessage={storeInfo.pauseMessage}
          onCheckWaiting={handleCheckWaiting}
        />
      );

    case 'CLOSED':
      return <ClosedScreen storeName={storeInfo.name} storeLogo={storeInfo.logo} />;

    case 'ACCEPTING':
    default:
      return (
        <>
          {ToastComponent}

          <TabletWaitingForm
            key={formResetKey}
            storeName={storeInfo.name}
            storeLogo={storeInfo.logo}
            totalWaiting={storeInfo.totalWaiting}
            estimatedMinutes={storeInfo.estimatedMinutes}
            waitingTypes={storeInfo.waitingTypes}
            onSubmit={handleSubmit}
            onViewWaitingList={handleViewWaitingList}
            onCancel={handleCancel}
            isSubmitting={isSubmitting}
          />
        </>
      );
  }
}
