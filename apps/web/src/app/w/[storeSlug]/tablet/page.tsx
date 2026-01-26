'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  TabletModeSelector,
  TabletWaitingForm,
  WalkInScreen,
  PausedOverlay,
  ClosedScreen,
} from '@/components/waiting';
import { useToast, Toast } from '@/components/ui/toast';
import { Loader2, CheckCircle2 } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

type TabletMode = 'register' | 'manage';

interface WaitingType {
  id: string;
  name: string;
  description: string | null;
  avgWaitTimePerTeam: number;
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
  const [registrationResult, setRegistrationResult] = useState<RegistrationResult | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [registeredPhone, setRegisteredPhone] = useState<string>('');
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [formResetKey, setFormResetKey] = useState(0);

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
    if (!storeSlug || registrationResult) return;

    const interval = setInterval(fetchStoreInfo, 3000);
    return () => clearInterval(interval);
  }, [storeSlug, registrationResult, fetchStoreInfo]);

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
  }) => {
    if (!storeInfo) return;

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
      };
      setRegistrationResult(result);
      setRegisteredPhone(data.phone);

      // Show success popup with auto-dismiss
      setShowSuccessPopup(true);

      // Auto reset after 5 seconds
      setTimeout(() => {
        setShowSuccessPopup(false);
        resetForm();
      }, 5000);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '등록 중 오류가 발생했습니다.', 'error');
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle cancellation
  const handleCancel = async () => {
    if (!registrationResult || !registeredPhone) return;

    setIsCancelling(true);

    try {
      const res = await fetch(`${API_BASE}/api/public/waiting/${storeSlug}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: registeredPhone,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || '취소에 실패했습니다.');
      }

      showToast('웨이팅이 취소되었습니다.', 'success');
      resetForm();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '취소 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsCancelling(false);
    }
  };

  // Reset form
  const resetForm = () => {
    setRegistrationResult(null);
    setRegisteredPhone('');
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
      return <WalkInScreen storeName={storeInfo.name} />;

    case 'PAUSED':
      return (
        <PausedOverlay
          totalWaiting={storeInfo.totalWaiting}
          pauseMessage={storeInfo.pauseMessage}
          onCheckWaiting={handleCheckWaiting}
        />
      );

    case 'CLOSED':
      return <ClosedScreen storeName={storeInfo.name} />;

    case 'ACCEPTING':
    default:
      return (
        <>
          {ToastComponent}

          {/* Success Popup - 인라인 렌더링 */}
          {showSuccessPopup && registrationResult && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <div className="bg-white rounded-3xl p-10 shadow-2xl max-w-sm w-full mx-6 text-center animate-in fade-in zoom-in duration-300">
                {/* Success Icon */}
                <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                </div>

                {/* Message */}
                <h2 className="text-2xl font-bold text-neutral-900 mb-2">
                  웨이팅 등록이 완료되었어요
                </h2>

                {/* Waiting Number */}
                <div className="mt-6 mb-6">
                  <p className="text-sm text-neutral-500 mb-1">대기번호</p>
                  <p className="text-5xl font-bold text-neutral-900">
                    #{registrationResult.waitingNumber}
                  </p>
                </div>

                {/* Info */}
                <div className="flex justify-center gap-6 text-sm text-neutral-500 mb-6">
                  <div>
                    <span className="font-medium text-neutral-700">{registrationResult.position}번째</span>
                    <span className="ml-1">순서</span>
                  </div>
                  <div>
                    <span className="font-medium text-neutral-700">약 {registrationResult.estimatedMinutes}분</span>
                    <span className="ml-1">예상</span>
                  </div>
                </div>

                {/* Kakao Info */}
                <p className="text-sm text-neutral-500 mb-6">
                  카카오톡으로 호출 알림을 보내드릴게요
                </p>

                {/* Progress Bar - CSS 애니메이션 */}
                <div className="h-1 bg-neutral-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500"
                    style={{
                      width: '100%',
                      animation: 'shrink-width 5s linear forwards'
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          <TabletWaitingForm
            key={formResetKey}
            storeName={storeInfo.name}
            storeLogo={storeInfo.logo}
            totalWaiting={storeInfo.totalWaiting}
            estimatedMinutes={storeInfo.estimatedMinutes}
            waitingTypes={storeInfo.waitingTypes}
            onSubmit={handleSubmit}
            onViewWaitingList={handleViewWaitingList}
            isSubmitting={isSubmitting}
          />
        </>
      );
  }
}
