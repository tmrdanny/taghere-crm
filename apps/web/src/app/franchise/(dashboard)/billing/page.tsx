'use client';

import { API_BASE } from '@/lib/api-config';
import { getFranchiseToken } from '@/lib/auth-token';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Wallet,
  CreditCard,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { loadTossPayments, TossPaymentsWidgets } from '@tosspayments/tosspayments-sdk';

const TOSS_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || '';

// Amount presets with bonus rates (Franchise-specific higher amounts)
const AMOUNT_PRESETS = [
  { amount: 1000000, bonusRate: 0, label: '100만원' },
  { amount: 3000000, bonusRate: 3, label: '300만원' },
  { amount: 5000000, bonusRate: 4, label: '500만원' },
  { amount: 10000000, bonusRate: 5, label: '1,000만원' },
];

// Get bonus rate by amount
const getBonusRate = (amount: number): number => {
  if (amount >= 10000000) return 5;
  if (amount >= 5000000) return 4;
  if (amount >= 3000000) return 3;
  return 0;
};

// Calculate charge amount with bonus
const getChargeAmountWithBonus = (amount: number): number => {
  const bonusRate = getBonusRate(amount);
  return Math.floor(amount * (1 + bonusRate / 100));
};

interface Transaction {
  id: string;
  amount: number;
  bonusAmount?: number;
  type: string;
  status: string;
  description?: string;
  createdAt: string;
}

export default function FranchiseBillingPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [amount, setAmount] = useState<number>(1000000);
  const [customAmount, setCustomAmount] = useState<string>('1,000,000');
  const [balance, setBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);

  // TossPayments states
  const [widgets, setWidgets] = useState<TossPaymentsWidgets | null>(null);
  const [isPaymentReady, setIsPaymentReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [widgetKey, setWidgetKey] = useState<number>(0);
  const paymentMethodsWidgetRef = useRef<any>(null);
  const agreementWidgetRef = useRef<any>(null);
  const isInitializingRef = useRef<boolean>(false);

  const totalAmount = amount;

  // Auth token helper
  // Fetch balance and transactions
  const fetchData = useCallback(async () => {
    try {
      const token = getFranchiseToken();

      const balanceRes = await fetch(`${API_BASE}/api/franchise/wallet`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (balanceRes.ok) {
        const data = await balanceRes.json();
        setBalance(data.balance || 0);
      }

      const txRes = await fetch(`${API_BASE}/api/franchise/wallet/transactions?limit=10`, {
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

  // Handle payment success callback
  useEffect(() => {
    const paymentKey = searchParams.get('paymentKey');
    const orderId = searchParams.get('orderId');
    const amountParam = searchParams.get('amount');

    if (paymentKey && orderId && amountParam) {
      const confirmPayment = async () => {
        setIsConfirmingPayment(true);
        try {
          const token = getFranchiseToken();
          const res = await fetch(`${API_BASE}/api/franchise/payments/confirm`, {
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
            await fetchData();
          }
        } catch (err) {
          console.error('Payment confirmation error:', err);
        } finally {
          setIsConfirmingPayment(false);
          router.replace('/franchise/billing');
        }
      };

      confirmPayment();
    }
  }, [searchParams, router, fetchData]);

  // Initialize TossPayments widgets
  useEffect(() => {
    if (isInitializingRef.current) return;
    if (!TOSS_CLIENT_KEY) {
      console.error('TossPayments client key is not set');
      return;
    }

    const initAndRenderWidgets = async () => {
      isInitializingRef.current = true;

      try {
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
          console.error('TossPayments: DOM elements not found');
          isInitializingRef.current = false;
          return;
        }

        paymentMethodsEl.innerHTML = '';
        agreementEl.innerHTML = '';
        await new Promise(resolve => setTimeout(resolve, 100));

        const tossPayments = await loadTossPayments(TOSS_CLIENT_KEY);
        const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
        const customerKey = `FC_${uniqueId}`;
        const widgetsInstance = tossPayments.widgets({ customerKey });

        await widgetsInstance.setAmount({
          currency: 'KRW',
          value: totalAmount,
        });

        paymentMethodsWidgetRef.current = await widgetsInstance.renderPaymentMethods({
          selector: '#payment-methods',
          variantKey: 'DEFAULT',
        });

        agreementWidgetRef.current = await widgetsInstance.renderAgreement({
          selector: '#agreement',
          variantKey: 'AGREEMENT',
        });

        setWidgets(widgetsInstance);
        setIsPaymentReady(true);
      } catch (error) {
        console.error('Failed to initialize TossPayments:', error);
        isInitializingRef.current = false;
        setIsPaymentReady(false);
      }
    };

    initAndRenderWidgets();
  }, [widgetKey]);

  // Update amount in widgets
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

  // Format with comma
  const formatWithComma = (num: number) => {
    return num.toLocaleString('ko-KR');
  };

  // Handle preset click
  const handlePresetClick = (preset: number) => {
    setAmount(preset);
    setCustomAmount(formatWithComma(preset));
  };

  // Handle amount change
  const handleAmountChange = (value: string) => {
    const numValue = parseInt(value.replace(/[^0-9]/g, '')) || 0;
    setCustomAmount(formatWithComma(numValue));
    setAmount(numValue);
  };

  // Reinitialize widgets
  const reinitializeWidgets = () => {
    setWidgets(null);
    setIsPaymentReady(false);
    paymentMethodsWidgetRef.current = null;
    agreementWidgetRef.current = null;
    isInitializingRef.current = false;
    setWidgetKey(prev => prev + 1);
  };

  // Handle payment
  const handlePayment = async () => {
    if (!widgets || !isPaymentReady) {
      return;
    }

    if (amount < 100000) {
      return;
    }

    setIsProcessing(true);

    try {
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 11);
      const orderId = `FC${timestamp}${randomStr}`;

      await widgets.requestPayment({
        orderId,
        orderName: '태그히어 프랜차이즈 CRM',
        successUrl: `${window.location.origin}/franchise/billing`,
        failUrl: `${window.location.origin}/franchise/billing?fail=true`,
        customerEmail: '',
        customerName: '',
      });
    } catch (error: any) {
      if (error.code === 'USER_CANCEL') {
        console.log('User cancelled payment');
      } else if (error.code === 'S008') {
        reinitializeWidgets();
      } else {
        console.error('Payment error:', error);
        reinitializeWidgets();
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Format date
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

  // Get transaction type label
  const getTransactionLabel = (type: string) => {
    switch (type) {
      case 'TOPUP': return '충전';
      case 'CAMPAIGN': return '캠페인 발송';
      case 'REFUND': return '환불';
      default: return type;
    }
  };

  // Get status badge
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
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-[color:var(--ad-ink)]">충전</h1>
        <p className="mt-1 text-[13px] text-[color:var(--ad-muted)]">
          캠페인 발송을 위한 충전금을 관리합니다
        </p>
      </div>

      {/* Balance Card */}
      <div className="ad-card mb-5 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="mb-1 text-[12px] text-[color:var(--ad-muted)]">현재 보유 충전금</p>
            <p className="ad-tnum text-[24px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">
              {formatWithComma(balance)}원
            </p>
            <p className="ad-tnum mt-1 text-[12px] text-[color:var(--ad-faint)]">
              약 {Math.floor(balance / 150).toLocaleString()}건 SMS 발송 가능
            </p>
          </div>
          <Wallet className="h-5 w-5 text-[color:var(--ad-faint)]" strokeWidth={1.7} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Charge Section */}
        <div className="ad-card p-5">
          <h2 className="mb-4 text-[14px] font-semibold text-[color:var(--ad-ink)]">충전하기</h2>
          <div className="space-y-4">
            {/* Amount Input */}
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">
                충전 금액
              </label>
              <input
                type="text"
                value={customAmount}
                onChange={(e) => handleAmountChange(e.target.value)}
                className="ad-tnum h-12 w-full rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-4 text-right text-[20px] font-medium text-[color:var(--ad-ink)] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-ink)] focus:outline-none"
                placeholder="0"
              />
            </div>

            {/* Presets */}
            <div className="flex flex-wrap gap-2">
              {AMOUNT_PRESETS.map((preset) => (
                <button
                  key={preset.amount}
                  onClick={() => handlePresetClick(preset.amount)}
                  className={cn(
                    'ad-press relative h-9 rounded-[10px] px-3 text-[13px] font-medium transition-colors',
                    amount === preset.amount
                      ? 'bg-[color:var(--ad-ink)] text-white'
                      : 'bg-white text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]'
                  )}
                >
                  {preset.label}
                  {preset.bonusRate > 0 && (
                    <span className={cn(
                      'ml-1 text-[11px] font-medium',
                      amount === preset.amount ? 'text-white/70' : 'text-[color:var(--ad-muted)]'
                    )}>
                      +{preset.bonusRate}%
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Summary */}
            <div className="border-t border-[color:var(--ad-line)] pt-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-[color:var(--ad-muted)]">결제 금액</span>
                <span className="ad-tnum text-[14px] font-medium text-[color:var(--ad-ink-2)]">
                  {formatWithComma(totalAmount)}원
                </span>
              </div>
              {getBonusRate(amount) > 0 && (
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[13px] text-[color:var(--ad-pos)]">
                    보너스 충전 (+{getBonusRate(amount)}%)
                  </span>
                  <span className="ad-tnum text-[14px] font-medium text-[color:var(--ad-pos)]">
                    +{formatWithComma(getChargeAmountWithBonus(amount) - amount)}원
                  </span>
                </div>
              )}
              <div className="mt-2 flex items-center justify-between border-t border-[color:var(--ad-line)] pt-2">
                <span className="text-[13px] font-semibold text-[color:var(--ad-ink)]">실제 충전 금액</span>
                <span className="ad-tnum text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">
                  {formatWithComma(getChargeAmountWithBonus(amount))}원
                </span>
              </div>
            </div>

            {/* TossPayments Widgets */}
            <div className="border-t border-[color:var(--ad-line)] pt-4" key={`widget-container-${widgetKey}`}>
              <div id="payment-methods" className="mb-4" />
              <div id="agreement" className="mb-4" />
            </div>

            {/* Pay Button */}
            <button
              onClick={handlePayment}
              disabled={!isPaymentReady || isProcessing || amount < 100000}
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
                  {formatWithComma(totalAmount)}원 결제
                </>
              )}
            </button>
            <p className="text-center text-[12px] text-[color:var(--ad-faint)]">
              최소 충전 금액: 100,000원
            </p>
          </div>
        </div>

        {/* Transaction History */}
        <div className="ad-card flex flex-col overflow-hidden lg:max-h-[calc(100vh-20rem)]">
          <div className="flex-shrink-0 border-b border-[color:var(--ad-line)] px-5 py-4">
            <h2 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">거래 내역</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="divide-y divide-[color:var(--ad-line)]">
              {transactions.length === 0 ? (
                <p className="py-10 text-center text-[13px] text-[color:var(--ad-faint)]">
                  거래 내역이 없습니다
                </p>
              ) : (
                transactions.map((tx) => (
                  <div key={tx.id} className="px-5 py-3 transition-colors hover:bg-[color:var(--ad-bg-alt)]">
                    <div className="mb-1 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-[color:var(--ad-ink)]">
                          {getTransactionLabel(tx.type)}
                        </span>
                        {tx.bonusAmount && (
                          <span className="ad-tnum inline-flex rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">
                            +{formatWithComma(tx.bonusAmount)} 보너스
                          </span>
                        )}
                      </div>
                      {getStatusBadge(tx.status)}
                    </div>
                    {tx.description && (
                      <p className="mb-1 text-[12px] text-[color:var(--ad-muted)]">{tx.description}</p>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="ad-tnum text-[12px] text-[color:var(--ad-faint)]">{formatDate(tx.createdAt)}</span>
                      <span className={cn(
                        'ad-tnum text-[14px] font-medium',
                        tx.type === 'TOPUP' ? 'text-[color:var(--ad-ink)]' : 'text-[color:var(--ad-neg)]'
                      )}>
                        {tx.type === 'TOPUP' ? '+' : '-'}{formatWithComma(tx.amount)}원
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
