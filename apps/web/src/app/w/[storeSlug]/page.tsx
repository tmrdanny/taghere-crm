'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  CustomerWaitingForm,
  WalkInScreen,
  PausedOverlay,
  ClosedScreen,
} from '@/components/waiting';
import { useToast, Toast } from '@/components/ui/toast';
import { Loader2 } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface WaitingType {
  id: string;
  name: string;
  description: string | null;
  avgWaitTimePerTeam: number;
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
}

export default function WaitingQRPage() {
  const params = useParams();
  const router = useRouter();
  const storeSlug = params.storeSlug as string;

  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { showToast, ToastComponent } = useToast();

  // Fetch store waiting info
  const fetchStoreInfo = async () => {
    try {
      setIsLoading(true);
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
  };

  useEffect(() => {
    if (storeSlug) {
      fetchStoreInfo();
    }
  }, [storeSlug]);

  // Handle form submission
  const handleSubmit = async (data: {
    phone: string;
    waitingTypeId: string;
    partySize: number;
    memo?: string;
    consentPrivacy: boolean;
    consentMarketing: boolean;
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
          memo: data.memo,
          consentMarketing: data.consentMarketing,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || '웨이팅 등록에 실패했습니다.');
      }

      const result: RegistrationResult = await res.json();

      // Navigate to complete page with result data
      const searchParams = new URLSearchParams({
        waitingId: result.waitingId,
        waitingNumber: result.waitingNumber.toString(),
        position: result.position.toString(),
        estimatedMinutes: result.estimatedMinutes.toString(),
        typeName: result.typeName,
        phone: data.phone,
      });

      router.push(`/w/${storeSlug}/complete?${searchParams.toString()}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '등록 중 오류가 발생했습니다.', 'error');
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle view waiting list (check existing waiting)
  const handleCheckWaiting = () => {
    // For now, show a prompt to enter phone number
    const phone = window.prompt('등록하신 전화번호를 입력해주세요 (예: 01012345678)');
    if (phone) {
      const cleanPhone = phone.replace(/\D/g, '');
      router.push(`/w/${storeSlug}/complete?phone=${cleanPhone}`);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-brand-800 animate-spin mx-auto mb-4" />
          <p className="text-neutral-500">로딩 중...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !storeInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-6">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-error-light rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">!</span>
          </div>
          <h1 className="text-xl font-bold text-neutral-900 mb-2">
            {error || '매장 정보를 불러올 수 없습니다.'}
          </h1>
          <p className="text-neutral-500 mb-6">
            잠시 후 다시 시도해주세요.
          </p>
          <button
            onClick={fetchStoreInfo}
            className="px-6 py-3 bg-brand-800 text-white rounded-lg font-medium hover:bg-brand-900 transition-colors"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
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
          <CustomerWaitingForm
            storeName={storeInfo.name}
            storeLogo={storeInfo.logo}
            totalWaiting={storeInfo.totalWaiting}
            estimatedMinutes={storeInfo.estimatedMinutes}
            waitingTypes={storeInfo.waitingTypes}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
          />
        </>
      );
  }
}
