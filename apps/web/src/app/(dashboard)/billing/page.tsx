'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import {
  Info,
  Loader2,
  Wallet,
  CreditCard,
} from 'lucide-react';
import { loadTossPayments, TossPaymentsWidgets } from '@tosspayments/tosspayments-sdk';
import { useToast } from '@/components/ui/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// 토스페이먼츠 클라이언트 키
const TOSS_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || '';

// 충전 금액 프리셋
const AMOUNT_PRESETS = [50000, 100000, 500000, 1000000];

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

  // +5만원 추가
  const handleAddAmount = () => {
    const newAmount = amount + 50000;
    setAmount(newAmount);
    setCustomAmount(formatWithComma(newAmount));
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
    switch (status) {
      case 'SUCCESS':
        return <Badge variant="success">완료</Badge>;
      case 'PENDING':
        return <Badge variant="warning">대기중</Badge>;
      case 'FAILED':
        return <Badge variant="error">실패</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  if (isLoading || isConfirmingPayment) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)]">
        <Loader2 className="w-8 h-8 animate-spin text-brand-800" />
        {isConfirmingPayment && (
          <p className="mt-4 text-sm text-neutral-500">결제 처리 중...</p>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      {ToastComponent}
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-neutral-900">충전 관리</h1>
        <p className="text-neutral-500 mt-1">
          알림톡 발송을 위한 충전금을 관리합니다.
        </p>
      </div>

      {/* 안내 콜아웃 */}
      <Card className="mb-6 bg-blue-50 border-blue-200">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="text-blue-800">
                포인트 적립 시, 고객에게 알림톡이 발송됩니다.
              </p>
              <p className="text-blue-600 mt-1">
                적립/사용 알림톡 1건 발송 시 20원이 차감됩니다. 비용이 없을경우 알림톡은 자동으로 발송 중지 됩니다.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 현재 잔액 */}
      <Card className="mb-6 border-brand-200 bg-brand-50/30">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-neutral-500 mb-1">현재 보유 충전금</p>
              <p className="text-3xl font-bold text-neutral-900">
                {formatCurrency(balance)}
              </p>
              <p className="text-xs text-neutral-400 mt-1">
                약 {Math.floor(balance / 50)}건 발송 가능
              </p>
            </div>
            <div className="p-3 bg-brand-100 rounded-lg">
              <Wallet className="w-6 h-6 text-brand-800" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {/* 충전 섹션 */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">충전</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 충전 금액 입력 */}
            <div>
              <label className="text-sm font-medium text-neutral-700 block mb-2">
                충전 금액 입력
              </label>
              <div className="relative">
                <Input
                  type="text"
                  value={customAmount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  className="text-right text-2xl font-bold pr-4 h-16"
                  placeholder="0"
                />
              </div>
            </div>

            {/* 금액 프리셋 버튼 */}
            <div className="flex flex-wrap gap-2">
              {AMOUNT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  onClick={() => handlePresetClick(preset)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    amount === preset
                      ? 'bg-brand-800 text-white border-brand-800'
                      : 'bg-white text-neutral-700 border-neutral-300 hover:border-brand-800'
                  }`}
                >
                  {preset >= 1000000
                    ? `${preset / 10000}만`
                    : `${preset / 10000}만`}
                </button>
              ))}
              <button
                onClick={handleAddAmount}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-neutral-300 bg-white text-neutral-700 hover:border-brand-800 transition-colors"
              >
                +5만원
              </button>
            </div>

            {/* 결제 예정 금액 */}
            <div className="border-t border-neutral-200 pt-4">
              <div className="flex justify-end items-center gap-2">
                <span className="text-sm font-medium text-neutral-700">
                  결제 예정 금액
                </span>
              </div>
              <div className="text-right mt-1">
                <span className="text-3xl font-bold text-brand-800">
                  {formatCurrency(totalAmount)}
                </span>
              </div>
            </div>

            {/* 토스페이먼츠 결제 위젯 */}
            <div className="border-t border-neutral-200 pt-6" key={`widget-container-${widgetKey}`}>
              <div id="payment-methods" className="mb-4" />
              <div id="agreement" className="mb-4" />
            </div>

            {/* 충전하기 버튼 */}
            <Button
              onClick={handleCardPayment}
              disabled={!isPaymentReady || isProcessing || amount < 1000}
              className="w-full h-12 text-base"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  결제 처리 중...
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4 mr-2" />
                  {formatCurrency(totalAmount)} 충전하기
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* 충전 내역 */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">충전 내역</CardTitle>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 ? (
              <p className="text-center text-neutral-400 py-8">
                충전 내역이 없습니다
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-neutral-200">
                      <th className="pb-3 text-left text-sm font-medium text-neutral-500">
                        일시
                      </th>
                      <th className="pb-3 text-left text-sm font-medium text-neutral-500">
                        구분
                      </th>
                      <th className="pb-3 text-right text-sm font-medium text-neutral-500">
                        금액
                      </th>
                      <th className="pb-3 text-center text-sm font-medium text-neutral-500">
                        상태
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx) => (
                      <tr
                        key={tx.id}
                        className="border-b border-neutral-100 last:border-0"
                      >
                        <td className="py-4 text-sm text-neutral-600">
                          {formatDate(tx.createdAt)}
                        </td>
                        <td className="py-4 text-sm text-neutral-900">
                          {getTransactionLabel(tx.type)}
                        </td>
                        <td className="py-4 text-sm font-medium text-right">
                          <span
                            className={
                              tx.type === 'TOPUP'
                                ? 'text-green-600'
                                : 'text-red-600'
                            }
                          >
                            {tx.type === 'TOPUP' ? '+' : '-'}
                            {formatCurrency(tx.amount)}
                          </span>
                        </td>
                        <td className="py-4 text-center">
                          {getStatusBadge(tx.status)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
