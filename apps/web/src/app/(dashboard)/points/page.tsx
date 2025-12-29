'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalFooter,
} from '@/components/ui/modal';
import { formatNumber, formatPhone, getRelativeTime } from '@/lib/utils';
import { Delete, Loader2, UserPlus, RefreshCw, AlertCircle, CheckCircle2, Calculator, Keyboard } from 'lucide-react';
import { Input } from '@/components/ui/input';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Types
interface Customer {
  id: string;
  name: string | null;
  phone: string | null;
  totalPoints: number;
  visitCount: number;
  lastVisitAt?: string | null;
  isVip: boolean;
  isNew?: boolean;
}

interface RecentTransaction {
  id: string;
  customerId: string;
  customerName: string | null;
  phone: string | null;
  points: number;
  createdAt: string;
  isVip: boolean;
  isNew: boolean;
}

interface StoreSettings {
  pointRateEnabled: boolean;
  pointRatePercent: number;
}

// Preset point amounts
const POINT_PRESETS = [500, 1000, 2000, 5000];

// Payment amount presets
const PAYMENT_PRESETS = [10000, 20000, 30000, 50000];

export default function PointsPage() {
  // Input states
  const [phoneInput, setPhoneInput] = useState('');
  const [pointsInput, setPointsInput] = useState('');
  const [paymentInput, setPaymentInput] = useState('');

  // Customer states
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  // Recent transactions
  const [recentTransactions, setRecentTransactions] = useState<RecentTransaction[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(true);

  // Point input method modal (after phone complete)
  const [showInputMethodModal, setShowInputMethodModal] = useState(false);
  const [inputMethod, setInputMethod] = useState<'payment' | 'direct' | null>(null);

  // Store settings (for point rate)
  const [storeSettings, setStoreSettings] = useState<StoreSettings>({
    pointRateEnabled: false,
    pointRatePercent: 5,
  });

  // Confirmation modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Success modal
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successData, setSuccessData] = useState<{
    customerName: string | null;
    points: number;
    totalPoints: number;
  } | null>(null);

  // API states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const paymentInputRef = useRef<HTMLInputElement>(null);
  const pointsInputRef = useRef<HTMLInputElement>(null);

  // Get auth token from localStorage (fallback to dev-token for MVP)
  const getAuthToken = () => {
    if (typeof window === 'undefined') return 'dev-token';
    return localStorage.getItem('token') || 'dev-token';
  };

  // Fetch recent transactions
  const fetchRecentTransactions = useCallback(async () => {
    try {
      const token = getAuthToken();
      if (!token) return;

      const res = await fetch(`${API_BASE}/api/points/recent?limit=10`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setRecentTransactions(data.transactions || []);
      }
    } catch (err) {
      console.error('Failed to fetch recent transactions:', err);
    } finally {
      setIsLoadingRecent(false);
    }
  }, []);

  // Fetch store settings (point rate)
  const fetchStoreSettings = useCallback(async () => {
    try {
      const token = getAuthToken();
      if (!token) return;

      const res = await fetch(`${API_BASE}/api/settings/point-rate`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setStoreSettings({
          pointRateEnabled: data.pointRateEnabled ?? false,
          pointRatePercent: data.pointRatePercent ?? 5,
        });
      }
    } catch (err) {
      console.error('Failed to fetch store settings:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchRecentTransactions();
    fetchStoreSettings();
    // Auto focus on mount
    setTimeout(() => {
      hiddenInputRef.current?.focus();
    }, 100);
  }, [fetchRecentTransactions, fetchStoreSettings]);

  // Calculate points from payment amount
  const calculatePointsFromPayment = (amount: number) => {
    if (!storeSettings.pointRateEnabled) return 0;
    return Math.floor(amount * storeSettings.pointRatePercent / 100);
  };

  // Search customer by phone
  const searchCustomer = useCallback(async (digits: string) => {
    if (digits.length !== 8) return;

    setIsSearching(true);
    setError(null);

    try {
      const token = getAuthToken();
      if (!token) {
        setError('로그인이 필요합니다.');
        return;
      }

      const res = await fetch(`${API_BASE}/api/customers/search/phone/${digits}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error('고객 검색 중 오류가 발생했습니다.');
      }

      const data = await res.json();

      if (data.found && data.customer) {
        setCustomer(data.customer);
        setIsNewCustomer(false);
      } else {
        setCustomer(null);
        setIsNewCustomer(true);
      }

      // 팝업 모달 표시
      setShowInputMethodModal(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '고객 검색 실패');
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Format phone number for display
  const formatPhoneDisplay = (value: string) => {
    const part1 = value.slice(0, 4).padEnd(4, '_');
    const part2 = value.slice(4, 8).padEnd(4, '_');
    return { part1, part2 };
  };

  // Handle phone input complete
  const handlePhoneComplete = useCallback((digits: string) => {
    if (digits.length === 8) {
      searchCustomer(digits);
    }
  }, [searchCustomer]);

  // Handle keypad press (phone only now)
  const handleKeypadPress = (key: string) => {
    if (phoneInput.length < 8) {
      const newValue = phoneInput + key;
      setPhoneInput(newValue);
    }
  };

  const handleKeypadDelete = () => {
    setPhoneInput(phoneInput.slice(0, -1));
  };

  const handleKeypadClear = () => {
    setPhoneInput('');
    setPointsInput('');
    setPaymentInput('');
    setCustomer(null);
    setIsNewCustomer(false);
    setError(null);
    setInputMethod(null);
    setTimeout(() => {
      hiddenInputRef.current?.focus();
    }, 100);
  };

  // Handle preset selection
  const handlePresetSelect = (amount: number) => {
    setPointsInput(amount.toString());
  };

  // Handle keyboard input (phone only now)
  const handleHiddenInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    if (value.length <= 8) {
      setPhoneInput(value);
    }
  };

  const handleHiddenInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && phoneInput.length === 8) {
      handlePhoneComplete(phoneInput);
    }
  };

  // Reset all inputs
  const handleReset = () => {
    setPhoneInput('');
    setPointsInput('');
    setPaymentInput('');
    setCustomer(null);
    setIsNewCustomer(false);
    setError(null);
    setInputMethod(null);
    setTimeout(() => {
      hiddenInputRef.current?.focus();
    }, 100);
  };

  // Handle input method selection
  const handleSelectInputMethod = (method: 'payment' | 'direct') => {
    setInputMethod(method);
    setPaymentInput('');
    setPointsInput('');
    // 포커스를 해당 입력 필드로
    setTimeout(() => {
      if (method === 'payment') {
        paymentInputRef.current?.focus();
      } else {
        pointsInputRef.current?.focus();
      }
    }, 100);
  };

  // Handle confirm from input method modal
  const handleInputMethodConfirm = () => {
    let finalPoints = 0;

    if (inputMethod === 'payment') {
      const paymentAmount = parseInt(paymentInput) || 0;
      finalPoints = calculatePointsFromPayment(paymentAmount);
    } else {
      finalPoints = parseInt(pointsInput) || 0;
    }

    if (finalPoints <= 0) {
      setError('적립할 포인트가 0보다 커야 합니다.');
      return;
    }

    // 포인트 설정 후 확인 모달 표시
    setPointsInput(finalPoints.toString());
    setShowInputMethodModal(false);
    setShowConfirmModal(true);
  };

  // Submit points earn
  const handleSubmitEarn = async () => {
    const points = parseInt(pointsInput);
    if (!points || points <= 0) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const token = getAuthToken();
      if (!token) {
        setError('로그인이 필요합니다.');
        return;
      }

      const res = await fetch(`${API_BASE}/api/points/earn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          phone: `010${phoneInput}`,
          points,
          customerId: customer?.id,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || '적립 중 오류가 발생했습니다.');
      }

      const data = await res.json();

      // Success - close confirm modal and show success modal
      setShowConfirmModal(false);
      setSuccessData({
        customerName: customer?.name || (isNewCustomer ? '신규 고객' : null),
        points: points,
        totalPoints: data.customer?.totalPoints || (customer ? customer.totalPoints + points : points),
      });
      setShowSuccessModal(true);

      // Refresh recent transactions
      fetchRecentTransactions();

    } catch (err) {
      setError(err instanceof Error ? err.message : '적립 실패');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Format time for display
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) return '방금 전';
    if (diffMins < 60) return `${diffMins}분 전`;

    const hours = date.getHours().toString().padStart(2, '0');
    const mins = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${mins}`;
  };

  const { part1, part2 } = formatPhoneDisplay(phoneInput);
  const currentPoints = parseInt(pointsInput) || 0;

  return (
    <div className="min-h-screen bg-neutral-100 p-4 lg:p-6 flex items-center justify-center">
      {/* Hidden input for keyboard typing */}
      <input
        ref={hiddenInputRef}
        type="text"
        inputMode="numeric"
        value={phoneInput}
        onChange={handleHiddenInputChange}
        onKeyDown={handleHiddenInputKeyDown}
        className="absolute opacity-0 pointer-events-none"
        autoFocus
      />

      <div className="w-full max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6">

          {/* Left Panel - Recent Transactions */}
          <div className="lg:col-span-4 order-2 lg:order-1">
            <Card className="h-full bg-white shadow-sm">
              <div className="p-4 border-b border-neutral-100">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-neutral-900">
                    최근 적립 내역
                  </h2>
                  <button
                    onClick={fetchRecentTransactions}
                    className="p-2 rounded-lg hover:bg-neutral-100 transition-colors"
                    title="새로고침"
                  >
                    <RefreshCw className="w-4 h-4 text-neutral-500" />
                  </button>
                </div>
              </div>

              <div className="p-2 max-h-[calc(100vh-12rem)] overflow-y-auto">
                {isLoadingRecent ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
                  </div>
                ) : recentTransactions.length === 0 ? (
                  <p className="text-center text-sm text-neutral-400 py-12">
                    적립 내역이 없습니다
                  </p>
                ) : (
                  <div className="space-y-1">
                    {recentTransactions.map((tx) => (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between p-3 rounded-lg hover:bg-neutral-50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-neutral-900 truncate">
                              {tx.customerName || (tx.phone ? formatPhone(tx.phone) : '알 수 없음')}
                            </span>
                            {tx.isVip && <Badge variant="vip">VIP</Badge>}
                            {tx.isNew && <Badge variant="new">신규</Badge>}
                          </div>
                          <span className="text-xs text-neutral-500">
                            {formatTime(tx.createdAt)}
                          </span>
                        </div>
                        <span className="text-sm font-bold text-green-600 ml-2">
                          +{formatNumber(tx.points)}P
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Right Panel - Point Input */}
          <div className="lg:col-span-8 order-1 lg:order-2">
            <Card className="bg-white shadow-sm">
              {/* Header */}
              <div className="p-4 lg:p-6 border-b border-neutral-100">
                <h1 className="text-xl font-bold text-neutral-900">
                  포인트 적립
                </h1>
                <p className="text-sm text-neutral-500 mt-1">
                  전화번호를 입력하고 적립할 포인트를 선택하세요
                </p>
              </div>

              <div className="p-4 lg:p-6">
                {/* Error message */}
                {error && (
                  <div className="flex items-center gap-2 bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <span className="text-sm">{error}</span>
                    <button
                      onClick={() => setError(null)}
                      className="ml-auto text-red-500 hover:text-red-700 p-1"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Two Column Layout for inputs */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">

                  {/* Left Column - Phone & Points Input */}
                  <div className="space-y-4">
                    {/* Phone Input */}
                    <div>
                      <label className="text-sm font-medium text-neutral-700 block mb-2">
                        전화번호
                      </label>
                      <div
                        className="flex items-center justify-center px-4 py-4 border-2 rounded-xl bg-white cursor-text transition-colors border-brand-800 ring-2 ring-brand-100"
                        onClick={() => {
                          hiddenInputRef.current?.focus();
                        }}
                      >
                        <span className="text-2xl font-semibold text-neutral-900">010</span>
                        <span className="text-2xl font-semibold text-neutral-300 mx-1">-</span>
                        <span className="text-2xl font-semibold tracking-wider">
                          {part1.split('').map((char, i) => (
                            <span key={i} className={char === '_' ? 'text-neutral-300' : 'text-neutral-900'}>
                              {char}
                            </span>
                          ))}
                        </span>
                        <span className="text-2xl font-semibold text-neutral-300 mx-1">-</span>
                        <span className="text-2xl font-semibold tracking-wider">
                          {part2.split('').map((char, i) => (
                            <span key={i} className={char === '_' ? 'text-neutral-300' : 'text-neutral-900'}>
                              {char}
                            </span>
                          ))}
                        </span>
                      </div>
                    </div>

                    {/* Customer Search Status */}
                    {isSearching && (
                      <div className="flex items-center justify-center py-4 bg-neutral-50 rounded-xl">
                        <Loader2 className="w-5 h-5 animate-spin text-neutral-400 mr-2" />
                        <span className="text-sm text-neutral-500">고객 검색 중...</span>
                      </div>
                    )}

                    {/* Submit Button - Desktop */}
                    <Button
                      onClick={() => {
                        if (phoneInput.length === 8) {
                          handlePhoneComplete(phoneInput);
                        }
                      }}
                      disabled={phoneInput.length !== 8 || isSearching}
                      className="w-full py-4 text-base font-semibold rounded-xl hidden lg:flex"
                      size="lg"
                    >
                      다음
                    </Button>
                  </div>

                  {/* Right Column - Keypad */}
                  <div className="bg-neutral-50 rounded-2xl p-4">
                    <div className="grid grid-cols-3 gap-2">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                        <button
                          key={num}
                          onClick={() => handleKeypadPress(num.toString())}
                          className="aspect-square flex items-center justify-center text-2xl font-semibold text-neutral-900 bg-white rounded-xl hover:bg-neutral-100 active:bg-neutral-200 transition-colors shadow-sm"
                        >
                          {num}
                        </button>
                      ))}
                      <button
                        onClick={handleKeypadClear}
                        className="aspect-square flex items-center justify-center text-sm font-semibold text-neutral-600 bg-red-50 rounded-xl hover:bg-red-100 active:bg-red-200 transition-colors"
                      >
                        초기화
                      </button>
                      <button
                        onClick={() => handleKeypadPress('0')}
                        className="aspect-square flex items-center justify-center text-2xl font-semibold text-neutral-900 bg-white rounded-xl hover:bg-neutral-100 active:bg-neutral-200 transition-colors shadow-sm"
                      >
                        0
                      </button>
                      <button
                        onClick={handleKeypadDelete}
                        className="aspect-square flex items-center justify-center text-neutral-600 bg-neutral-200 rounded-xl hover:bg-neutral-300 active:bg-neutral-400 transition-colors"
                      >
                        <Delete className="w-6 h-6" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Submit Button - Mobile */}
                <Button
                  onClick={() => {
                    if (phoneInput.length === 8) {
                      handlePhoneComplete(phoneInput);
                    }
                  }}
                  disabled={phoneInput.length !== 8 || isSearching}
                  className="w-full py-4 text-base font-semibold rounded-xl mt-4 lg:hidden"
                  size="lg"
                >
                  다음
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Input Method Modal */}
      <Modal
        open={showInputMethodModal}
        onOpenChange={(open) => {
          setShowInputMethodModal(open);
          if (!open) {
            setInputMethod(null);
            setPaymentInput('');
          }
        }}
      >
        <ModalContent className="max-w-2xl">
          <ModalHeader>
            <ModalTitle>포인트 적립</ModalTitle>
          </ModalHeader>

          <div className="py-4 space-y-4">
            {/* Customer Info */}
            <div className="bg-neutral-50 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-neutral-500">고객</span>
                  <span className="font-medium text-neutral-900">
                    {customer?.name || (isNewCustomer ? '신규 고객' : '알 수 없음')}
                  </span>
                  {customer?.isVip && <Badge variant="vip">VIP</Badge>}
                  {isNewCustomer && <Badge variant="new">신규</Badge>}
                </div>
                <span className="text-sm text-neutral-500">
                  010-{phoneInput.slice(0, 4)}-{phoneInput.slice(4)}
                </span>
              </div>
              {customer && (
                <p className="text-xs text-neutral-500 mt-1">
                  보유 포인트: {formatNumber(customer.totalPoints)}P · 방문 {customer.visitCount}회
                </p>
              )}
            </div>

            {/* Input Method Selection */}
            {!inputMethod && (
              <div className="space-y-3">
                <p className="text-sm text-neutral-600 font-medium">적립 방식을 선택하세요</p>
                <div className="grid grid-cols-2 gap-3">
                  {/* Payment Amount Option */}
                  <button
                    onClick={() => handleSelectInputMethod('payment')}
                    disabled={!storeSettings.pointRateEnabled}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      storeSettings.pointRateEnabled
                        ? 'border-neutral-200 hover:border-brand-800 hover:bg-brand-50'
                        : 'border-neutral-100 bg-neutral-50 cursor-not-allowed'
                    }`}
                  >
                    <Calculator className={`w-6 h-6 mb-2 ${storeSettings.pointRateEnabled ? 'text-brand-800' : 'text-neutral-400'}`} />
                    <p className={`font-semibold ${storeSettings.pointRateEnabled ? 'text-neutral-900' : 'text-neutral-400'}`}>
                      결제금액 입력
                    </p>
                    <p className={`text-xs mt-1 ${storeSettings.pointRateEnabled ? 'text-neutral-500' : 'text-neutral-400'}`}>
                      {storeSettings.pointRateEnabled
                        ? `${storeSettings.pointRatePercent}% 자동 계산`
                        : '설정에서 활성화 필요'}
                    </p>
                  </button>

                  {/* Direct Input Option */}
                  <button
                    onClick={() => handleSelectInputMethod('direct')}
                    className="p-4 rounded-xl border-2 border-neutral-200 hover:border-brand-800 hover:bg-brand-50 text-left transition-all"
                  >
                    <Keyboard className="w-6 h-6 text-brand-800 mb-2" />
                    <p className="font-semibold text-neutral-900">직접 입력</p>
                    <p className="text-xs text-neutral-500 mt-1">포인트 직접 입력</p>
                  </button>
                </div>
              </div>
            )}

            {/* Payment Amount Input */}
            {inputMethod === 'payment' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Left - Input and Preview */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm text-brand-800">
                    <Calculator className="w-4 h-4" />
                    <span>결제금액 입력 ({storeSettings.pointRatePercent}% 적립)</span>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-700">결제 금액</label>
                    <div
                      className="flex items-center justify-between px-4 py-3 border-2 rounded-xl bg-white border-brand-800 ring-2 ring-brand-100 cursor-text"
                      onClick={() => paymentInputRef.current?.focus()}
                    >
                      <span className="text-2xl font-bold text-neutral-900">
                        {paymentInput ? formatNumber(parseInt(paymentInput)) : '0'}
                      </span>
                      <span className="text-lg text-neutral-500">원</span>
                    </div>
                    <input
                      ref={paymentInputRef}
                      type="text"
                      inputMode="numeric"
                      value={paymentInput}
                      onChange={(e) => setPaymentInput(e.target.value.replace(/\D/g, ''))}
                      className="absolute opacity-0 pointer-events-none"
                    />
                  </div>

                  {/* Payment Presets */}
                  <div className="grid grid-cols-4 gap-2">
                    {PAYMENT_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        onClick={() => setPaymentInput(preset.toString())}
                        className={`py-2 rounded-lg text-sm font-medium transition-all ${
                          parseInt(paymentInput) === preset
                            ? 'bg-brand-800 text-white'
                            : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                        }`}
                      >
                        {formatNumber(preset)}
                      </button>
                    ))}
                  </div>

                  {/* Calculated Points Preview */}
                  <div className="bg-brand-50 rounded-xl p-4 text-center">
                    <p className="text-sm text-brand-700">적립 예정 포인트</p>
                    <p className="text-2xl font-bold text-brand-800 mt-1">
                      {formatNumber(calculatePointsFromPayment(parseInt(paymentInput) || 0))} P
                    </p>
                  </div>

                  <button
                    onClick={() => setInputMethod(null)}
                    className="text-sm text-neutral-500 hover:text-neutral-700"
                  >
                    ← 다른 방식 선택
                  </button>
                </div>

                {/* Right - Keypad */}
                <div className="bg-neutral-50 rounded-2xl p-4">
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                      <button
                        key={num}
                        onClick={() => setPaymentInput(prev => prev + num.toString())}
                        className="aspect-square flex items-center justify-center text-2xl font-semibold text-neutral-900 bg-white rounded-xl hover:bg-neutral-100 active:bg-neutral-200 transition-colors shadow-sm"
                      >
                        {num}
                      </button>
                    ))}
                    <button
                      onClick={() => setPaymentInput('')}
                      className="aspect-square flex items-center justify-center text-sm font-semibold text-neutral-600 bg-red-50 rounded-xl hover:bg-red-100 active:bg-red-200 transition-colors"
                    >
                      초기화
                    </button>
                    <button
                      onClick={() => setPaymentInput(prev => prev + '0')}
                      className="aspect-square flex items-center justify-center text-2xl font-semibold text-neutral-900 bg-white rounded-xl hover:bg-neutral-100 active:bg-neutral-200 transition-colors shadow-sm"
                    >
                      0
                    </button>
                    <button
                      onClick={() => setPaymentInput(prev => prev.slice(0, -1))}
                      className="aspect-square flex items-center justify-center text-neutral-600 bg-neutral-200 rounded-xl hover:bg-neutral-300 active:bg-neutral-400 transition-colors"
                    >
                      <Delete className="w-6 h-6" />
                    </button>
                  </div>
                  {/* Quick add buttons */}
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <button
                      onClick={() => setPaymentInput(prev => (parseInt(prev || '0') + 10000).toString())}
                      className="py-3 rounded-xl text-sm font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                    >
                      +1만
                    </button>
                    <button
                      onClick={() => setPaymentInput(prev => (parseInt(prev || '0') + 50000).toString())}
                      className="py-3 rounded-xl text-sm font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                    >
                      +5만
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Direct Points Input */}
            {inputMethod === 'direct' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Left - Input and Preview */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm text-brand-800">
                    <Keyboard className="w-4 h-4" />
                    <span>직접 포인트 입력</span>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-700">적립 포인트</label>
                    <div
                      className="flex items-center justify-between px-4 py-3 border-2 rounded-xl bg-white border-brand-800 ring-2 ring-brand-100 cursor-text"
                      onClick={() => pointsInputRef.current?.focus()}
                    >
                      <span className="text-2xl font-bold text-neutral-900">
                        {pointsInput ? formatNumber(parseInt(pointsInput)) : '0'}
                      </span>
                      <span className="text-lg text-neutral-500">P</span>
                    </div>
                    <input
                      ref={pointsInputRef}
                      type="text"
                      inputMode="numeric"
                      value={pointsInput}
                      onChange={(e) => setPointsInput(e.target.value.replace(/\D/g, ''))}
                      className="absolute opacity-0 pointer-events-none"
                    />
                  </div>

                  {/* Point Presets */}
                  <div className="grid grid-cols-4 gap-2">
                    {POINT_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        onClick={() => setPointsInput(preset.toString())}
                        className={`py-2 rounded-lg text-sm font-medium transition-all ${
                          parseInt(pointsInput) === preset
                            ? 'bg-brand-800 text-white'
                            : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                        }`}
                      >
                        {formatNumber(preset)}P
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => setInputMethod(null)}
                    className="text-sm text-neutral-500 hover:text-neutral-700"
                  >
                    ← 다른 방식 선택
                  </button>
                </div>

                {/* Right - Keypad */}
                <div className="bg-neutral-50 rounded-2xl p-4">
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                      <button
                        key={num}
                        onClick={() => setPointsInput(prev => prev + num.toString())}
                        className="aspect-square flex items-center justify-center text-2xl font-semibold text-neutral-900 bg-white rounded-xl hover:bg-neutral-100 active:bg-neutral-200 transition-colors shadow-sm"
                      >
                        {num}
                      </button>
                    ))}
                    <button
                      onClick={() => setPointsInput('')}
                      className="aspect-square flex items-center justify-center text-sm font-semibold text-neutral-600 bg-red-50 rounded-xl hover:bg-red-100 active:bg-red-200 transition-colors"
                    >
                      초기화
                    </button>
                    <button
                      onClick={() => setPointsInput(prev => prev + '0')}
                      className="aspect-square flex items-center justify-center text-2xl font-semibold text-neutral-900 bg-white rounded-xl hover:bg-neutral-100 active:bg-neutral-200 transition-colors shadow-sm"
                    >
                      0
                    </button>
                    <button
                      onClick={() => setPointsInput(prev => prev.slice(0, -1))}
                      className="aspect-square flex items-center justify-center text-neutral-600 bg-neutral-200 rounded-xl hover:bg-neutral-300 active:bg-neutral-400 transition-colors"
                    >
                      <Delete className="w-6 h-6" />
                    </button>
                  </div>
                  {/* Quick add buttons */}
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <button
                      onClick={() => setPointsInput(prev => (parseInt(prev || '0') + 500).toString())}
                      className="py-3 rounded-xl text-sm font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                    >
                      +500P
                    </button>
                    <button
                      onClick={() => setPointsInput(prev => (parseInt(prev || '0') + 1000).toString())}
                      className="py-3 rounded-xl text-sm font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                    >
                      +1000P
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <ModalFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowInputMethodModal(false);
                setInputMethod(null);
              }}
            >
              취소
            </Button>
            {inputMethod && (
              <Button
                onClick={handleInputMethodConfirm}
                disabled={
                  (inputMethod === 'payment' && calculatePointsFromPayment(parseInt(paymentInput) || 0) <= 0) ||
                  (inputMethod === 'direct' && (parseInt(pointsInput) || 0) <= 0)
                }
              >
                적립하기
              </Button>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Confirmation Modal */}
      <Modal open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <ModalContent className="max-w-sm">
          <ModalHeader>
            <ModalTitle>적립 확인</ModalTitle>
          </ModalHeader>

          <div className="py-4">
            <div className="bg-neutral-50 rounded-xl p-4 space-y-3">
              {/* Customer info */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-500">고객</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-neutral-900">
                    {customer?.name || (isNewCustomer ? '신규 고객' : '알 수 없음')}
                  </span>
                  {customer?.isVip && <Badge variant="vip">VIP</Badge>}
                  {isNewCustomer && <Badge variant="new">신규</Badge>}
                </div>
              </div>

              {/* Phone */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-500">전화번호</span>
                <span className="font-medium text-neutral-900">
                  010-{phoneInput.slice(0, 4)}-{phoneInput.slice(4)}
                </span>
              </div>

              {/* Points to earn */}
              <div className="flex items-center justify-between border-t border-neutral-200 pt-3">
                <span className="text-sm text-neutral-500">적립 포인트</span>
                <span className="text-xl font-bold text-brand-800">
                  +{formatNumber(currentPoints)} P
                </span>
              </div>

              {/* New balance (if existing customer) */}
              {customer && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-neutral-500">적립 후 잔액</span>
                  <span className="font-medium text-green-600">
                    {formatNumber(customer.totalPoints + currentPoints)} P
                  </span>
                </div>
              )}
            </div>
          </div>

          <ModalFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirmModal(false)}
              disabled={isSubmitting}
            >
              취소
            </Button>
            <Button
              onClick={handleSubmitEarn}
              disabled={isSubmitting}
              className="min-w-24"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                '적립하기'
              )}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Success Modal */}
      <Modal
        open={showSuccessModal}
        onOpenChange={(open) => {
          setShowSuccessModal(open);
          if (!open) {
            handleReset();
          }
        }}
      >
        <ModalContent className="max-w-sm">
          <div className="py-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-green-600" />
              </div>
            </div>
            <h2 className="text-xl font-bold text-neutral-900 mb-2">
              포인트 적립 완료
            </h2>
            <p className="text-neutral-600 mb-4">
              {successData?.customerName || '고객'}님에게<br />
              <span className="text-brand-800 font-bold text-lg">
                {formatNumber(successData?.points || 0)}P
              </span>
              가 적립되었습니다.
            </p>
            <div className="bg-neutral-50 rounded-lg py-3 px-4 inline-block">
              <span className="text-sm text-neutral-500">현재 보유 포인트</span>
              <p className="text-xl font-bold text-neutral-900">
                {formatNumber(successData?.totalPoints || 0)} P
              </p>
            </div>
          </div>

          <ModalFooter className="justify-center">
            <Button
              onClick={() => {
                setShowSuccessModal(false);
                handleReset();
              }}
              className="min-w-32"
            >
              확인
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
