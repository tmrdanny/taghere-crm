'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
} from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils';
import { CreditCard, Loader2, Wallet, AlertCircle } from 'lucide-react';
import { loadTossPayments, TossPaymentsWidgets } from '@tosspayments/tosspayments-sdk';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const TOSS_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || '';

// 충전 금액 프리셋 및 보너스율
const AMOUNT_PRESETS = [
  { amount: 100000, bonusRate: 0 },
  { amount: 200000, bonusRate: 3 },
  { amount: 500000, bonusRate: 5 },
  { amount: 1000000, bonusRate: 7 },
];

// 금액에 따른 보너스율 계산
const getBonusRate = (amount: number): number => {
  if (amount >= 1000000) return 7;
  if (amount >= 500000) return 5;
  if (amount >= 200000) return 3;
  return 0;
};

// 보너스 포함 충전 금액 계산
const getChargeAmountWithBonus = (amount: number): number => {
  const bonusRate = getBonusRate(amount);
  return Math.floor(amount * (1 + bonusRate / 100));
};

interface ChargeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (newBalance: number) => void;
  currentBalance: number;
  requiredAmount?: number;
  successRedirectPath: string;
}

export function ChargeModal({
  isOpen,
  onClose,
  onSuccess,
  currentBalance,
  requiredAmount,
  successRedirectPath,
}: ChargeModalProps) {
  const [amount, setAmount] = useState<number>(requiredAmount ? Math.max(100000, Math.ceil((requiredAmount - currentBalance) / 10000) * 10000) : 100000);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [widgets, setWidgets] = useState<TossPaymentsWidgets | null>(null);
  const [isPaymentReady, setIsPaymentReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [widgetKey, setWidgetKey] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const paymentMethodsWidgetRef = useRef<any>(null);
  const agreementWidgetRef = useRef<any>(null);
  const isInitializingRef = useRef<boolean>(false);

  const totalAmount = amount;

  const getAuthToken = () => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('token') || '';
  };

  // 숫자에 콤마 추가
  const formatWithComma = (num: number) => {
    return num.toLocaleString('ko-KR');
  };

  // 초기 금액 설정
  useEffect(() => {
    if (isOpen) {
      const initialAmount = requiredAmount
        ? Math.max(100000, Math.ceil((requiredAmount - currentBalance) / 10000) * 10000)
        : 100000;
      setAmount(initialAmount);
      setCustomAmount(formatWithComma(initialAmount));
      setError(null);
    }
  }, [isOpen, requiredAmount, currentBalance]);

  // 토스페이먼츠 위젯 초기화
  useEffect(() => {
    if (!isOpen || isInitializingRef.current || !TOSS_CLIENT_KEY) {
      return;
    }

    const initAndRenderWidgets = async () => {
      isInitializingRef.current = true;

      try {
        // DOM 요소가 존재할 때까지 대기
        let paymentMethodsEl = document.getElementById('charge-modal-payment-methods');
        let agreementEl = document.getElementById('charge-modal-agreement');

        let retries = 0;
        while ((!paymentMethodsEl || !agreementEl) && retries < 20) {
          await new Promise(resolve => setTimeout(resolve, 100));
          paymentMethodsEl = document.getElementById('charge-modal-payment-methods');
          agreementEl = document.getElementById('charge-modal-agreement');
          retries++;
        }

        if (!paymentMethodsEl || !agreementEl) {
          console.error('ChargeModal: DOM elements not found');
          isInitializingRef.current = false;
          return;
        }

        // DOM 컨테이너 정리
        paymentMethodsEl.innerHTML = '';
        agreementEl.innerHTML = '';

        await new Promise(resolve => setTimeout(resolve, 100));

        const tossPayments = await loadTossPayments(TOSS_CLIENT_KEY);
        const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
        const customerKey = `TH_${uniqueId}`;
        const widgetsInstance = tossPayments.widgets({ customerKey });

        await widgetsInstance.setAmount({
          currency: 'KRW',
          value: totalAmount,
        });

        paymentMethodsWidgetRef.current = await widgetsInstance.renderPaymentMethods({
          selector: '#charge-modal-payment-methods',
          variantKey: 'DEFAULT',
        });

        agreementWidgetRef.current = await widgetsInstance.renderAgreement({
          selector: '#charge-modal-agreement',
          variantKey: 'AGREEMENT',
        });

        setWidgets(widgetsInstance);
        setIsPaymentReady(true);
      } catch (error) {
        console.error('ChargeModal: Failed to initialize TossPayments:', error);
        isInitializingRef.current = false;
        setIsPaymentReady(false);
      }
    };

    initAndRenderWidgets();
  }, [isOpen, widgetKey]);

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

  // 모달 닫힐 때 정리
  useEffect(() => {
    if (!isOpen) {
      setWidgets(null);
      setIsPaymentReady(false);
      paymentMethodsWidgetRef.current = null;
      agreementWidgetRef.current = null;
      isInitializingRef.current = false;
    }
  }, [isOpen]);

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

  // 위젯 재초기화
  const reinitializeWidgets = () => {
    setWidgets(null);
    setIsPaymentReady(false);
    paymentMethodsWidgetRef.current = null;
    agreementWidgetRef.current = null;
    isInitializingRef.current = false;
    setWidgetKey(prev => prev + 1);
  };

  // 결제 처리
  const handlePayment = async () => {
    if (!widgets || !isPaymentReady) {
      setError('결제 위젯이 준비되지 않았습니다. 잠시 후 다시 시도해주세요.');
      return;
    }

    if (amount < 1000) {
      setError('최소 충전 금액은 1,000원입니다.');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const timestamp = Date.now();
      const randomStr1 = Math.random().toString(36).substring(2, 11);
      const randomStr2 = Math.random().toString(36).substring(2, 6);
      const orderId = `TH${timestamp}${randomStr1}${randomStr2}`;

      await widgets.requestPayment({
        orderId,
        orderName: '태그히어 CRM 충전',
        successUrl: `${window.location.origin}${successRedirectPath}`,
        failUrl: `${window.location.origin}${successRedirectPath}?paymentFailed=true`,
        customerEmail: '',
        customerName: '',
      });
    } catch (error: any) {
      if (error.code === 'USER_CANCEL') {
        // 사용자 취소
      } else if (error.code === 'S008') {
        reinitializeWidgets();
      } else {
        console.error('Payment error:', error);
        setError('결제 처리 중 오류가 발생했습니다. 다시 시도해주세요.');
        reinitializeWidgets();
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const shortfall = requiredAmount ? requiredAmount - currentBalance : 0;

  return (
    <Modal open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <ModalContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <ModalHeader>
          <ModalTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-brand-600" />
            충전하기
          </ModalTitle>
          <ModalDescription>
            충전금을 충전하여 메시지를 발송하세요.
          </ModalDescription>
        </ModalHeader>

        <div className="space-y-4 py-2">
          {/* 현재 잔액 및 부족 금액 안내 */}
          <div className="p-3 bg-neutral-50 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-neutral-600">현재 잔액</span>
              <span className="font-medium text-neutral-900">{formatCurrency(currentBalance)}</span>
            </div>
            {shortfall > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  부족 금액
                </span>
                <span className="font-medium text-red-600">{formatCurrency(shortfall)}</span>
              </div>
            )}
          </div>

          {/* 충전 금액 입력 */}
          <div>
            <label className="text-sm font-medium text-neutral-700 block mb-2">
              충전 금액
            </label>
            <Input
              type="text"
              value={customAmount}
              onChange={(e) => handleAmountChange(e.target.value)}
              className="text-right text-lg font-bold h-12"
              placeholder="0"
            />
          </div>

          {/* 금액 프리셋 버튼 */}
          <div className="flex flex-wrap gap-2">
            {AMOUNT_PRESETS.map((preset) => (
              <button
                key={preset.amount}
                onClick={() => handlePresetClick(preset.amount)}
                className={`relative px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  amount === preset.amount
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white text-neutral-700 border-neutral-300 hover:border-brand-500'
                }`}
              >
                {preset.amount >= 10000 ? `${preset.amount / 10000}만` : formatCurrency(preset.amount)}
                {preset.bonusRate > 0 && (
                  <span className={`ml-1 text-xs font-bold ${
                    amount === preset.amount ? 'text-yellow-300' : 'text-green-600'
                  }`}>
                    +{preset.bonusRate}%
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* 결제 예정 금액 */}
          <div className="border-t border-neutral-200 pt-3 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-neutral-500">결제 금액</span>
              <span className="text-base font-medium text-neutral-700">
                {formatCurrency(totalAmount)}
              </span>
            </div>
            {getBonusRate(amount) > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-green-600">보너스 (+{getBonusRate(amount)}%)</span>
                <span className="text-base font-medium text-green-600">
                  +{formatCurrency(getChargeAmountWithBonus(amount) - amount)}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center pt-2 border-t border-neutral-100">
              <span className="text-sm font-semibold text-neutral-900">실제 충전 금액</span>
              <span className="text-lg font-bold text-brand-600">
                {formatCurrency(getChargeAmountWithBonus(amount))}
              </span>
            </div>
          </div>

          {/* 에러 메시지 */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 토스페이먼츠 결제 위젯 */}
          <div className="border-t border-neutral-200 pt-4" key={`charge-widget-${widgetKey}`}>
            <div id="charge-modal-payment-methods" className="mb-3" />
            <div id="charge-modal-agreement" className="mb-3" />
          </div>

          {/* 충전하기 버튼 */}
          <Button
            onClick={handlePayment}
            disabled={!isPaymentReady || isProcessing || amount < 1000}
            className="w-full h-11 text-base"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                결제 처리 중...
              </>
            ) : !isPaymentReady ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                결제 위젯 로딩 중...
              </>
            ) : (
              <>
                <CreditCard className="w-4 h-4 mr-2" />
                {formatCurrency(totalAmount)} 결제하기
              </>
            )}
          </Button>
        </div>
      </ModalContent>
    </Modal>
  );
}
