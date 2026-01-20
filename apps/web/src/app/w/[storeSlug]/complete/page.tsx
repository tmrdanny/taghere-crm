'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { WaitingComplete } from '@/components/waiting';
import { useToast } from '@/components/ui/toast';
import { Loader2, AlertCircle } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface WaitingStatus {
  waitingId: string;
  waitingNumber: number;
  position: number;
  estimatedMinutes: number;
  totalWaiting: number;
  typeName: string;
  storeName: string;
  status: 'WAITING' | 'CALLED' | 'SEATED' | 'CANCELLED' | 'NO_SHOW';
}

export default function WaitingCompletePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const storeSlug = params.storeSlug as string;

  // Get data from URL params or fetch from API
  const waitingId = searchParams.get('waitingId');
  const waitingNumberParam = searchParams.get('waitingNumber');
  const positionParam = searchParams.get('position');
  const estimatedMinutesParam = searchParams.get('estimatedMinutes');
  const typeNameParam = searchParams.get('typeName');
  const phoneParam = searchParams.get('phone');

  const [waitingStatus, setWaitingStatus] = useState<WaitingStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCancelled, setIsCancelled] = useState(false);

  const { showToast, ToastComponent } = useToast();

  // If we have all params from URL, use them directly
  useEffect(() => {
    if (waitingNumberParam && positionParam && estimatedMinutesParam) {
      setWaitingStatus({
        waitingId: waitingId || '',
        waitingNumber: parseInt(waitingNumberParam),
        position: parseInt(positionParam),
        estimatedMinutes: parseInt(estimatedMinutesParam),
        totalWaiting: parseInt(positionParam), // Approximate
        typeName: typeNameParam || '',
        storeName: '', // Will be fetched
        status: 'WAITING',
      });
      setIsLoading(false);
    } else if (phoneParam) {
      // Fetch status by phone
      fetchWaitingStatus(phoneParam);
    } else {
      setError('웨이팅 정보를 찾을 수 없습니다.');
      setIsLoading(false);
    }
  }, [waitingNumberParam, positionParam, estimatedMinutesParam, phoneParam]);

  // Fetch waiting status by phone
  const fetchWaitingStatus = async (phone: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const res = await fetch(`${API_BASE}/api/public/waiting/${storeSlug}/status/${phone}`);

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('웨이팅 정보를 찾을 수 없습니다.');
        }
        throw new Error('상태 조회에 실패했습니다.');
      }

      const data = await res.json();

      if (data.status === 'CANCELLED' || data.status === 'NO_SHOW') {
        setIsCancelled(true);
      }

      setWaitingStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle cancellation
  const handleCancel = async () => {
    const phone = phoneParam || '';

    if (!phone) {
      showToast('전화번호 정보가 없습니다.', 'error');
      return;
    }

    setIsCancelling(true);

    try {
      const res = await fetch(`${API_BASE}/api/public/waiting/${storeSlug}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phone }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || '취소에 실패했습니다.');
      }

      showToast('웨이팅이 취소되었습니다.', 'success');
      setIsCancelled(true);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '취소 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsCancelling(false);
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
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-6">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-error-light rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-error" />
          </div>
          <h1 className="text-xl font-bold text-neutral-900 mb-2">
            {error}
          </h1>
          <p className="text-neutral-500 mb-6">
            등록하신 전화번호를 다시 확인해주세요.
          </p>
          <a
            href={`/w/${storeSlug}`}
            className="inline-block px-6 py-3 bg-brand-800 text-white rounded-lg font-medium hover:bg-brand-900 transition-colors"
          >
            웨이팅 등록하기
          </a>
        </div>
      </div>
    );
  }

  // Cancelled state
  if (isCancelled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-6">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-neutral-200 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl text-neutral-500">X</span>
          </div>
          <h1 className="text-xl font-bold text-neutral-900 mb-2">
            웨이팅이 취소되었습니다
          </h1>
          <p className="text-neutral-500 mb-6">
            다음에 또 방문해주세요!
          </p>
          <a
            href={`/w/${storeSlug}`}
            className="inline-block px-6 py-3 bg-brand-800 text-white rounded-lg font-medium hover:bg-brand-900 transition-colors"
          >
            다시 웨이팅 등록하기
          </a>
        </div>
      </div>
    );
  }

  // No waiting status
  if (!waitingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-6">
        <div className="text-center max-w-md">
          <h1 className="text-xl font-bold text-neutral-900 mb-2">
            웨이팅 정보를 찾을 수 없습니다
          </h1>
          <p className="text-neutral-500 mb-6">
            등록하신 전화번호를 확인해주세요.
          </p>
          <a
            href={`/w/${storeSlug}`}
            className="inline-block px-6 py-3 bg-brand-800 text-white rounded-lg font-medium hover:bg-brand-900 transition-colors"
          >
            웨이팅 등록하기
          </a>
        </div>
      </div>
    );
  }

  return (
    <>
      {ToastComponent}
      <WaitingComplete
        waitingNumber={waitingStatus.waitingNumber}
        position={waitingStatus.position}
        estimatedMinutes={waitingStatus.estimatedMinutes}
        totalWaiting={waitingStatus.totalWaiting}
        typeName={waitingStatus.typeName}
        storeName={waitingStatus.storeName}
        onCancel={phoneParam ? handleCancel : undefined}
        isCancelling={isCancelling}
        showKakaoInfo={true}
      />
    </>
  );
}
