'use client';

import { API_BASE } from '@/lib/api-config';
import { useState, useEffect, useCallback, useRef } from 'react';
import { trackEvent } from '@/lib/analytics';
import { useSearchParams, useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils';
import {
  Info,
  Loader2,
  Wallet,
  CreditCard,
} from 'lucide-react';
import { loadTossPayments, TossPaymentsWidgets } from '@tosspayments/tosspayments-sdk';
import { useToast } from '@/components/ui/toast';


// 토스페이먼츠 클라이언트 키
const TOSS_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || '';

// 충전 금액 프리셋 및 보너스율
const AMOUNT_PRESETS = [
  { amount: 50000, bonusRate: 0 },
  { amount: 100000, bonusRate: 3 },
  { amount: 200000, bonusRate: 5 },
  { amount: 500000, bonusRate: 7 },
  { amount: 1000000, bonusRate: 10 },
];

// 금액에 따른 보너스율 계산
const getBonusRate = (amount: number): number => {
  if (amount >= 1000000) return 10;
  if (amount >= 500000) return 7;
  if (amount >= 200000) return 5;
  if (amount >= 100000) return 3;
  return 0;
};

// 보너스 포함 충전 금액 계산
const getChargeAmountWithBonus = (amount: number): number => {
  const bonusRate = getBonusRate(amount);
  return Math.floor(amount * (1 + bonusRate / 100));
};

interface Transaction {
  id: string;
  amount: number;
  type: string;
  status: string;
  createdAt: string;
  meta?: {
    description?: string;
  };
}

export default function BillingPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { showToast, ToastComponent } = useToast();
  const [amount, setAmount] = useState<number>(50000);
  const [customAmount, setCustomAmount] = useState<string>('50,000');
  const [balance, setBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);

  // 토스페이먼츠 관련 상태
  const [widgets, setWidgets] = useState<TossPaymentsWidgets | null>(null);
  const [isPaymentReady, setIsPaymentReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [widgetKey, setWidgetKey] = useState<number>(0);
  const paymentMethodsWidgetRef = useRef<any>(null);
  const agreementWidgetRef = useRef<any>(null);
  const isInitializingRef = useRef<boolean>(false);
  const billingChargeTrackedRef = useRef<boolean>(false); // 충전 완료 이벤트 1회만 발사(StrictMode/콜백 재실행 방지)

  // 결제 금액 (부가세 없음)
  const totalAmount = amount;

  const getAuthToken = () => {
    if (typeof window === 'undefined') return 'dev-token';
    return localStorage.getItem('token') || 'dev-token';
  };

  // 잔액 및 거래내역 조회
  const fetchData = useCallback(async () => {
    try {
      const token = getAuthToken();

      // 잔액 조회
      const balanceRes = await fetch(`${API_BASE}/api/wallet`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (balanceRes.ok) {
        const data = await balanceRes.json();
        setBalance(data.balance || 0);
      }

      // 거래내역 조회
      const txRes = await fetch(`${API_BASE}/api/wallet/transactions?limit=10`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (txRes.ok) {
        const data = await txRes.json();
        setTransactions(data.transactions || []);
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // URL 파라미터에서 결제 정보 확인 및 처리
  useEffect(() => {
    const paymentKey = searchParams.get('paymentKey');
    const orderId = searchParams.get('orderId');
    const amountParam = searchParams.get('amount');

    if (paymentKey && orderId && amountParam) {
      const confirmPayment = async () => {
        setIsConfirmingPayment(true);
        try {
          const token = getAuthToken();
          const res = await fetch(`${API_BASE}/api/payments/confirm`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              paymentKey,
              orderId,
              amount: parseInt(amountParam),
            }),
          });

          if (res.ok) {
            if (!billingChargeTrackedRef.current) {
              billingChargeTrackedRef.current = true;
              trackEvent('owner_billing_charge', { amount: parseInt(amountParam) });
            }
            // 결제 성공 - 데이터 새로고침
            await fetchData();
          }
        } catch (err) {
          console.error('Payment confirmation error:', err);
        } finally {
          setIsConfirmingPayment(false);
          // URL 파라미터 제거
          router.replace('/billing');
        }
      };

      confirmPayment();
    }
  }, [searchParams, router, fetchData]);

  // 토스페이먼츠 위젯 초기화 및 렌더링
  useEffect(() => {
    // 이미 초기화 중이면 중복 실행 방지
    if (isInitializingRef.current) {
      return;
    }

    // 클라이언트 키가 없으면 초기화하지 않음
    if (!TOSS_CLIENT_KEY) {
      console.error('TossPayments client key is not set');
      return;
    }

    const initAndRenderWidgets = async () => {
      isInitializingRef.current = true;

      try {
        // DOM 요소가 존재할 때까지 대기 (최대 2초)
        let paymentMethodsEl = document.getElementById('payment-methods');
        let agreementEl = document.getElementById('agreement');

        let retries = 0;
        while ((!paymentMethodsEl || !agreementEl) && retries < 20) {
          await new Promise(resolve => setTimeout(resolve, 100));
          paymentMethodsEl = document.getElementById('payment-methods');
          agreementEl = document.getElementById('agreement');
          retries++;
        }

        if (!paymentMethodsEl || !agreementEl) {
          console.error('TossPayments: DOM elements not found after waiting');
          isInitializingRef.current = false;
          return;
        }

        // DOM 컨테이너 정리
        paymentMethodsEl.innerHTML = '';
        agreementEl.innerHTML = '';

        // 잠시 대기하여 DOM이 정리될 시간 확보
        await new Promise(resolve => setTimeout(resolve, 100));

        // 매번 새로운 customerKey 생성 (UUID 형식으로 더 고유하게)
        const tossPayments = await loadTossPayments(TOSS_CLIENT_KEY);
        const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}-${Math.random().toString(36).substring(2, 15)}`;
        const customerKey = `TH_${uniqueId}`;
        const widgetsInstance = tossPayments.widgets({ customerKey });

        // 금액 설정
        await widgetsInstance.setAmount({
          currency: 'KRW',
          value: totalAmount,
        });

        // 결제 수단 위젯 렌더링
        paymentMethodsWidgetRef.current = await widgetsInstance.renderPaymentMethods({
          selector: '#payment-methods',
          variantKey: 'DEFAULT',
        });

        // 약관 동의 위젯 렌더링
        agreementWidgetRef.current = await widgetsInstance.renderAgreement({
          selector: '#agreement',
          variantKey: 'AGREEMENT',
        });

        setWidgets(widgetsInstance);
        setIsPaymentReady(true);
      } catch (error) {
        console.error('Failed to initialize TossPayments:', error);
        // 에러 발생 시 재시도 가능하도록 플래그 리셋
        isInitializingRef.current = false;
        setIsPaymentReady(false);
      }
    };

    initAndRenderWidgets();
  }, [widgetKey]);

  // 금액 변경 시 위젯 금액 업데이트
  useEffect(() => {
    if (!widgets || !isPaymentReady) return;

    const updateAmount = async () => {
      try {
        await widgets.setAmount({
          currency: 'KRW',
          value: totalAmount,
        });
      } catch (error) {
        console.error('Failed to update amount:', error);
      }
    };

    updateAmount();
  }, [widgets, totalAmount, isPaymentReady]);

  // 숫자에 콤마 추가
  const formatWithComma = (num: number) => {
    return num.toLocaleString('ko-KR');
  };

  // 금액 프리셋 선택
  const handlePresetClick = (preset: number) => {
    setAmount(preset);
    setCustomAmount(formatWithComma(preset));
  };

  // 금액 직접 입력
  const handleAmountChange = (value: string) => {
    const numValue = parseInt(value.replace(/[^0-9]/g, '')) || 0;
    setCustomAmount(formatWithComma(numValue));
    setAmount(numValue);
  };

  // 위젯 재초기화 함수
  const reinitializeWidgets = () => {
    setWidgets(null);
    setIsPaymentReady(false);
    paymentMethodsWidgetRef.current = null;
    agreementWidgetRef.current = null;
    isInitializingRef.current = false;
    setWidgetKey(prev => prev + 1);
  };

  // 카드 결제 처리
  const handleCardPayment = async () => {
    if (!widgets || !isPaymentReady) {
      showToast('결제 위젯이 준비되지 않았습니다. 잠시 후 다시 시도해주세요.', 'error');
      return;
    }

    if (amount < 1000) {
      showToast('최소 충전 금액은 1,000원입니다.', 'error');
      return;
    }

    setIsProcessing(true);

    try {
      // 고유한 orderId 생성 (타임스탬프 + 랜덤 문자열 조합으로 더 고유하게)
      const timestamp = Date.now();
      const randomStr1 = Math.random().toString(36).substring(2, 11);
      const randomStr2 = Math.random().toString(36).substring(2, 6);
      const orderId = `TH${timestamp}${randomStr1}${randomStr2}`;

      await widgets.requestPayment({
        orderId,
        orderName: '태그히어 CRM',
        successUrl: `${window.location.origin}/billing`,
        failUrl: `${window.location.origin}/billing/fail`,
        customerEmail: '',
        customerName: '',
      });
    } catch (error: any) {
      // 사용자가 결제를 취소한 경우
      if (error.code === 'USER_CANCEL') {
        console.log('사용자가 결제를 취소했습니다.');
      } else if (error.code === 'S008') {
        // 기존 요청 처리 중 에러 - 위젯 재초기화
        console.log('기존 요청 처리 중 - 위젯 재초기화');
        reinitializeWidgets();
      } else {
        console.error('Payment error:', error);
        showToast('결제 처리 중 오류가 발생했습니다. 다시 시도해주세요.', 'error');
        // 에러 발생 시 위젯 재초기화
        reinitializeWidgets();
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // 거래일시 포맷
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 거래 타입 라벨
  const getTransactionLabel = (type: string) => {
    switch (type) {
      case 'TOPUP':
        return '충전';
      case 'SUBSCRIPTION':
        return '구독료';
      case 'REFUND':
        return '환불';
      default:
        return type;
    }
  };

  // 거래 상태 배지
  const getStatusBadge = (status: string) => {
    const base = 'inline-flex rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium';
    switch (status) {
      case 'SUCCESS':
        return <span className={`${base} text-[color:var(--ad-muted)]`}>완료</span>;
      case 'PENDING':
        return <span className={`${base} text-[color:var(--ad-muted)]`}>대기중</span>;
      case 'FAILED':
        return <span className={`${base} text-[color:var(--ad-neg)]`}>실패</span>;
      default:
        return <span className={`${base} text-[color:var(--ad-muted)]`}>{status}</span>;
    }
  };

  if (isLoading || isConfirmingPayment) {
    return (
      <div className="flex h-[calc(100vh-4rem)] flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[color:var(--ad-faint)]" />
        {isConfirmingPayment && (
          <p className="mt-4 text-[13px] text-[color:var(--ad-muted)]">결제 처리 중...</p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 sm:px-8 lg:pt-8">
      {ToastComponent}
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-[color:var(--ad-ink)]">충전 관리</h1>
        <p className="mt-1 text-[13px] text-[color:var(--ad-muted)]">
          알림톡 발송을 위한 충전금을 관리합니다.
        </p>
      </div>

      {/* 현재 잔액 */}
      <div className="ad-card mb-5 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="mb-1 text-[12px] text-[color:var(--ad-muted)]">현재 보유 충전금</p>
            <p className="ad-tnum text-[24px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">
              {formatCurrency(balance)}
            </p>
            <p className="ad-tnum mt-1 text-[12px] text-[color:var(--ad-faint)]">
              약 {Math.floor(balance / 50)}건 발송 가능
            </p>
          </div>
          <Wallet className="h-5 w-5 text-[color:var(--ad-faint)]" strokeWidth={1.7} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* 충전 섹션 */}
        <div className="ad-card p-5">
          <h2 className="mb-4 text-[14px] font-semibold text-[color:var(--ad-ink)]">충전</h2>
          <div className="space-y-4">
            {/* 충전 금액 입력 */}
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">
                충전 금액 입력
              </label>
              <div className="relative">
                <Input
                  type="text"
                  value={customAmount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  className="ad-tnum h-12 rounded-[10px] border-[color:var(--ad-line-strong)] pr-4 text-right text-[20px] font-medium text-[color:var(--ad-ink)] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-ink)]"
                  placeholder="0"
                />
              </div>
            </div>

            {/* 금액 프리셋 버튼 */}
            <div className="flex flex-wrap gap-2">
              {AMOUNT_PRESETS.map((preset) => (
                <button
                  key={preset.amount}
                  onClick={() => handlePresetClick(preset.amount)}
                  className={`ad-press relative h-9 rounded-[10px] px-3 text-[13px] font-medium transition-colors ${
                    amount === preset.amount
                      ? 'bg-[color:var(--ad-ink)] text-white'
                      : 'bg-white text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]'
                  }`}
                >
                  {preset.amount >= 10000 ? `${preset.amount / 10000}만` : formatCurrency(preset.amount)}
                  {preset.bonusRate > 0 && (
                    <span className={`ml-1 text-[11px] font-medium ${
                      amount === preset.amount ? 'text-white/70' : 'text-[color:var(--ad-muted)]'
                    }`}>
                      +{preset.bonusRate}%
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* 결제 예정 금액 */}
            <div className="border-t border-[color:var(--ad-line)] pt-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-[color:var(--ad-muted)]">결제 금액</span>
                <span className="ad-tnum text-[14px] font-medium text-[color:var(--ad-ink-2)]">
                  {formatCurrency(totalAmount)}
                </span>
              </div>
              {getBonusRate(amount) > 0 && (
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[13px] text-[color:var(--ad-pos)]">보너스 충전 (+{getBonusRate(amount)}%)</span>
                  <span className="ad-tnum text-[14px] font-medium text-[color:var(--ad-pos)]">
                    +{formatCurrency(getChargeAmountWithBonus(amount) - amount)}
                  </span>
                </div>
              )}
              <div className="mt-2 flex items-center justify-between border-t border-[color:var(--ad-line)] pt-2">
                <span className="text-[13px] font-semibold text-[color:var(--ad-ink)]">
                  실제 충전 금액
                </span>
                <span className="ad-tnum text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">
                  {formatCurrency(getChargeAmountWithBonus(amount))}
                </span>
              </div>
            </div>

            {/* 토스페이먼츠 결제 위젯 */}
            <div className="border-t border-[color:var(--ad-line)] pt-4" key={`widget-container-${widgetKey}`}>
              <div id="payment-methods" className="mb-3" />
              <div id="agreement" className="mb-3" />
            </div>

            {/* 충전하기 버튼 */}
            <button
              type="button"
              onClick={handleCardPayment}
              disabled={!isPaymentReady || isProcessing || amount < 1000}
              className="ad-press inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-[12px] bg-[color:var(--ad-ink)] px-4 text-[13.5px] font-semibold text-white hover:bg-[#383c40] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  결제 처리 중...
                </>
              ) : (
                <>
                  <CreditCard className="h-4 w-4" />
                  {formatCurrency(totalAmount)} 결제하고 {formatCurrency(getChargeAmountWithBonus(amount))} 충전하기
                </>
              )}
            </button>
          </div>
        </div>

        {/* 충전 내역 */}
        <div className="ad-card flex flex-col overflow-hidden lg:max-h-[calc(100vh-20rem)]">
          <div className="flex-shrink-0 border-b border-[color:var(--ad-line)] px-5 py-4">
            <h2 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">충전 내역</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            {transactions.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-[color:var(--ad-faint)]">
                충전 내역이 없습니다
              </p>
            ) : (
              <div className="divide-y divide-[color:var(--ad-line)]">
                {transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="px-5 py-3 transition-colors hover:bg-[color:var(--ad-bg-alt)]"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-[13px] font-medium text-[color:var(--ad-ink)]">
                          {getTransactionLabel(tx.type)}
                        </p>
                        <p className="ad-tnum mt-0.5 text-[12px] text-[color:var(--ad-muted)]">
                          {formatDate(tx.createdAt)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`ad-tnum text-[14px] font-medium ${
                          tx.type === 'TOPUP'
                            ? 'text-[color:var(--ad-ink)]'
                            : 'text-[color:var(--ad-neg)]'
                        }`}>
                          {tx.type === 'TOPUP' ? '+' : '-'}
                          {formatCurrency(tx.amount)}
                        </p>
                        <div className="mt-1">
                          {getStatusBadge(tx.status)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
