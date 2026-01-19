'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Wallet,
  CreditCard,
  Info,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  Gift,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { loadTossPayments, TossPaymentsWidgets } from '@tosspayments/tosspayments-sdk';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
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
  const getAuthToken = () => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('franchiseToken') || '';
  };

  // Fetch balance and transactions
  const fetchData = useCallback(async () => {
    try {
      const token = getAuthToken();

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
          const token = getAuthToken();
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
        orderName: '태그히어 프랜차이즈 CRM 충전',
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
    switch (status) {
      case 'SUCCESS':
        return (
          <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 text-xs font-medium rounded-full flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            완료
          </span>
        );
      case 'PENDING':
        return (
          <span className="bg-amber-50 text-amber-700 px-2 py-0.5 text-xs font-medium rounded-full flex items-center gap-1">
            <Clock className="w-3 h-3" />
            대기중
          </span>
        );
      case 'FAILED':
        return (
          <span className="bg-red-50 text-red-700 px-2 py-0.5 text-xs font-medium rounded-full flex items-center gap-1">
            <XCircle className="w-3 h-3" />
            실패
          </span>
        );
      default:
        return (
          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 text-xs font-medium rounded-full">
            {status}
          </span>
        );
    }
  };

  if (isLoading || isConfirmingPayment) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-franchise-600" />
        {isConfirmingPayment && (
          <p className="mt-4 text-sm text-slate-500">결제 처리 중...</p>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">충전</h1>
          <p className="text-sm text-slate-500 mt-1">
            캠페인 발송을 위한 충전금을 관리합니다
          </p>
        </div>

        {/* Balance Card */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 mb-1">현재 보유 충전금</p>
              <p className="text-3xl font-bold text-slate-900">
                {formatWithComma(balance)}원
              </p>
              <p className="text-xs text-slate-400 mt-1">
                약 {Math.floor(balance / 150).toLocaleString()}건 SMS 발송 가능
              </p>
            </div>
            <div className="p-4 bg-franchise-100 rounded-xl">
              <Wallet className="w-8 h-8 text-franchise-600" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Charge Section */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">충전하기</h2>
            </div>
            <div className="p-6 space-y-6">
              {/* Amount Input */}
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-2">
                  충전 금액
                </label>
                <input
                  type="text"
                  value={customAmount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  className="w-full text-right text-2xl font-bold px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-franchise-600 focus:border-transparent"
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
                      'relative px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors',
                      amount === preset.amount
                        ? 'bg-franchise-500 text-white border-franchise-600'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-franchise-300'
                    )}
                  >
                    {preset.label}
                    {preset.bonusRate > 0 && (
                      <span className={cn(
                        'ml-1.5 text-xs font-bold',
                        amount === preset.amount ? 'text-yellow-300' : 'text-emerald-600'
                      )}>
                        +{preset.bonusRate}%
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Summary */}
              <div className="border-t border-slate-200 pt-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-500">결제 금액</span>
                  <span className="text-lg font-medium text-slate-700">
                    {formatWithComma(totalAmount)}원
                  </span>
                </div>
                {getBonusRate(amount) > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-emerald-600 flex items-center gap-1">
                      <Gift className="w-4 h-4" />
                      보너스 충전 (+{getBonusRate(amount)}%)
                    </span>
                    <span className="text-lg font-medium text-emerald-600">
                      +{formatWithComma(getChargeAmountWithBonus(amount) - amount)}원
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                  <span className="text-sm font-semibold text-slate-900">실제 충전 금액</span>
                  <span className="text-2xl font-bold text-franchise-600">
                    {formatWithComma(getChargeAmountWithBonus(amount))}원
                  </span>
                </div>
              </div>

              {/* TossPayments Widgets */}
              <div className="border-t border-slate-200 pt-6" key={`widget-container-${widgetKey}`}>
                <div id="payment-methods" className="mb-4" />
                <div id="agreement" className="mb-4" />
              </div>

              {/* Pay Button */}
              <button
                onClick={handlePayment}
                disabled={!isPaymentReady || isProcessing || amount < 100000}
                className={cn(
                  'w-full py-3 rounded-xl text-white font-semibold flex items-center justify-center gap-2 transition-colors',
                  !isPaymentReady || isProcessing || amount < 100000
                    ? 'bg-slate-300 cursor-not-allowed'
                    : 'bg-franchise-500 hover:bg-franchise-700'
                )}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    결제 처리 중...
                  </>
                ) : (
                  <>
                    <CreditCard className="w-5 h-5" />
                    {formatWithComma(totalAmount)}원 결제
                  </>
                )}
              </button>
              <p className="text-xs text-slate-400 text-center">
                최소 충전 금액: 100,000원
              </p>
            </div>
          </div>

          {/* Transaction History */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">거래 내역</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {transactions.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  거래 내역이 없습니다
                </div>
              ) : (
                transactions.map((tx) => (
                  <div key={tx.id} className="px-6 py-4">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-900">
                          {getTransactionLabel(tx.type)}
                        </span>
                        {tx.bonusAmount && (
                          <span className="text-xs text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                            +{formatWithComma(tx.bonusAmount)} 보너스
                          </span>
                        )}
                      </div>
                      {getStatusBadge(tx.status)}
                    </div>
                    {tx.description && (
                      <p className="text-xs text-slate-500 mb-1">{tx.description}</p>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">{formatDate(tx.createdAt)}</span>
                      <span className={cn(
                        'text-sm font-medium',
                        tx.type === 'TOPUP' ? 'text-emerald-600' : 'text-red-600'
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
