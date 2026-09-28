'use client';

import { API_BASE } from '@/lib/api-config';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { XCircle, Loader2 } from 'lucide-react';


function BillingFailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  const errorCode = searchParams.get('code');
  const errorMessage = searchParams.get('message');
  const orderId = searchParams.get('orderId');
  const paymentKey = searchParams.get('paymentKey');
  const amount = searchParams.get('amount');

  // S008 에러인 경우 실제 결제 상태 확인
  useEffect(() => {
    const checkPaymentStatus = async () => {
      // S008 에러이고 paymentKey가 있는 경우, 실제로 결제가 성공했을 수 있음
      if (errorCode === 'S008' && paymentKey) {
        try {
          const token = localStorage.getItem('token') || 'dev-token';

          // 토스페이먼츠에 결제 상태 확인
          const res = await fetch(`${API_BASE}/api/payments/${paymentKey}`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (res.ok) {
            const paymentData = await res.json();

            // 결제가 실제로 성공한 경우 (DONE 상태)
            if (paymentData.status === 'DONE') {
              // 이미 충전이 완료되었는지 확인하기 위해 confirm API 호출
              // (이미 처리된 경우 DB에서 중복 처리 방지됨)
              const confirmRes = await fetch(`${API_BASE}/api/payments/confirm`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  paymentKey,
                  orderId: orderId || paymentData.orderId,
                  amount: parseInt(amount || paymentData.totalAmount),
                }),
              });

              // 결제 성공 시 바로 충전 관리 페이지로 이동
              router.replace('/billing');
              return;
            }
          }
        } catch (err) {
          console.error('Payment status check error:', err);
        }
      }

      setIsChecking(false);
    };

    checkPaymentStatus();
  }, [errorCode, paymentKey, orderId, amount, router]);

  const getErrorMessage = () => {
    if (errorMessage) return decodeURIComponent(errorMessage);

    switch (errorCode) {
      case 'PAY_PROCESS_CANCELED':
        return '결제가 취소되었습니다.';
      case 'PAY_PROCESS_ABORTED':
        return '결제가 중단되었습니다.';
      case 'REJECT_CARD_COMPANY':
        return '카드사에서 결제를 거절했습니다.';
      case 'S008':
        return '기존 요청을 처리중입니다.';
      default:
        return '결제 처리 중 오류가 발생했습니다.';
    }
  };

  // 확인 중
  if (isChecking) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-6">
        <div className="ad-card w-full max-w-md p-8 text-center">
          <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-[color:var(--ad-faint)]" />
          <h2 className="mb-1.5 text-[17px] font-semibold text-[color:var(--ad-ink)]">
            결제 상태 확인 중...
          </h2>
          <p className="text-[13px] text-[color:var(--ad-muted)]">
            잠시만 기다려주세요.
          </p>
        </div>
      </div>
    );
  }

  // 실제 실패인 경우
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-6">
      <div className="ad-card w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--ad-bg)]">
          <XCircle className="h-6 w-6 text-[color:var(--ad-neg)]" strokeWidth={1.7} />
        </div>
        <h2 className="mb-1.5 text-[17px] font-semibold text-[color:var(--ad-ink)]">
          결제 실패
        </h2>
        <p className="mb-2 text-[13px] text-[color:var(--ad-muted)]">
          {getErrorMessage()}
        </p>
        {errorCode && (
          <p className="mb-6 text-[12px] text-[color:var(--ad-faint)]">
            오류 코드: {errorCode}
          </p>
        )}
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => router.push('/billing')}
            className="ad-press inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-[12px] bg-[color:var(--ad-ink)] px-4 text-[13.5px] font-semibold text-white hover:bg-[#383c40] disabled:opacity-40"
          >
            충전 페이지로 돌아가기
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BillingFailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[color:var(--ad-faint)]" />
        </div>
      }
    >
      <BillingFailContent />
    </Suspense>
  );
}
