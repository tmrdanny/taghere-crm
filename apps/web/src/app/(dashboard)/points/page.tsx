'use client';

import { API_BASE } from '@/lib/api-config';
import { useState, useRef, useEffect, useCallback } from 'react';
import { trackEvent } from '@/lib/analytics';
import { Button } from '@/components/ui/button';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalFooter,
} from '@/components/ui/modal';
import { formatNumber, formatPhone, getRelativeTime, maskNickname } from '@/lib/utils';
import { Delete, Loader2, UserPlus, RefreshCw, AlertCircle, CheckCircle2, Calculator, Keyboard, Info, X } from 'lucide-react';
import { useToast } from '@/components/ui/toast';


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

  // Toast
  const { showToast, ToastComponent } = useToast();

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
        const percent = data.pointRatePercent ?? 5;
        setStoreSettings({
          // pointRatePercent가 0보다 크면 활성화된 것으로 간주
          pointRateEnabled: percent > 0,
          pointRatePercent: percent,
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
    return Math.round(amount * storeSettings.pointRatePercent / 100);
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

      trackEvent('owner_points_earn', { amount: points, source: 'points' });
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
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 sm:px-8 lg:pt-8">
      {ToastComponent}

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

      <div className="w-full">
        {/* 안내 콜아웃 */}
        <div className="mb-4 rounded-[12px] bg-[color:var(--ad-bg-alt)] px-4 py-3 text-[13px] text-[color:var(--ad-muted)]">
          <div>
            <div className="flex gap-2.5">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
              <div className="text-[13px]">
                <p className="font-medium text-[color:var(--ad-ink-2)]">
                  포인트 적립 시, 고객에게 알림톡이 발송됩니다.
                </p>
                <p className="mt-1 text-[12.5px] text-[color:var(--ad-muted)]">
                  적립/사용 알림톡 1건 발송 시 20원이 차감됩니다. 비용이 없을경우 알림톡은 자동으로 발송 중지 됩니다.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6">

          {/* Left Panel - Recent Transactions & Tablet Link */}
          <div className="lg:col-span-4 order-2 lg:order-1 flex flex-col gap-4">
            {/* Recent Transactions Card */}
            <div className="ad-card flex-1">
              <div className="px-5 py-4 border-b border-[color:var(--ad-line)]">
                <div className="flex items-center justify-between">
                  <h2 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">
                    최근 적립 내역
                  </h2>
                  <button
                    onClick={fetchRecentTransactions}
                    className="ad-press p-2 rounded-[10px] hover:bg-[color:var(--ad-bg-alt)] transition-colors"
                    title="새로고침"
                  >
                    <RefreshCw className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                  </button>
                </div>
              </div>

              <div className="p-2 max-h-[calc(100vh-26rem)] overflow-y-auto">
                {isLoadingRecent ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-[color:var(--ad-faint)]" />
                  </div>
                ) : recentTransactions.length === 0 ? (
                  <p className="text-center text-[13px] text-[color:var(--ad-faint)] py-8">
                    적립 내역이 없습니다
                  </p>
                ) : (
                  <div className="space-y-1">
                    {recentTransactions.map((tx) => (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between px-3 py-2.5 rounded-[10px] hover:bg-[color:var(--ad-bg-alt)] transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[13.5px] font-medium text-[color:var(--ad-ink)] truncate">
                              {tx.customerName ? maskNickname(tx.customerName) : (tx.phone ? formatPhone(tx.phone) : '알 수 없음')}
                            </span>
                            {tx.isVip && <span className="inline-flex rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">VIP</span>}
                            {tx.isNew && <span className="inline-flex rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">신규</span>}
                          </div>
                          <span className="text-[12px] text-[color:var(--ad-faint)] ad-tnum">
                            {formatTime(tx.createdAt)}
                          </span>
                        </div>
                        <span className="text-[13.5px] font-semibold text-[color:var(--ad-pos)] ad-tnum ml-2">
                          +{formatNumber(tx.points)}P
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Right Panel - Point Input */}
          <div className="lg:col-span-8 order-1 lg:order-2">
            <div className="ad-card">
              {/* Header */}
              <div className="p-5 border-b border-[color:var(--ad-line)]">
                <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-[color:var(--ad-ink)]">
                  포인트 적립
                </h1>
                <p className="mt-1 text-[13px] text-[color:var(--ad-muted)]">
                  전화번호를 입력하고 적립할 포인트를 선택하세요
                </p>
              </div>

              <div className="p-5">
                {/* Error message */}
                {error && (
                  <div className="flex items-center gap-2 rounded-[12px] bg-[#fff0f3] text-[color:var(--ad-neg)] px-4 py-3 mb-4">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <span className="text-[13px]">{error}</span>
                    <button
                      onClick={() => setError(null)}
                      className="ml-auto text-[color:var(--ad-neg)] opacity-70 hover:opacity-100 p-1"
                      aria-label="닫기"
                    >
                      <X className="h-4 w-4" strokeWidth={1.8} />
                    </button>
                  </div>
                )}

                {/* Two Column Layout for inputs */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">

                  {/* Left Column - Phone & Points Input */}
                  <div className="space-y-4">
                    {/* Phone Input */}
                    <div>
                      <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">
                        전화번호
                      </label>
                      <div
                        className="flex items-center justify-center px-4 py-4 border rounded-[12px] bg-white cursor-text transition-colors border-[color:var(--ad-ink)] ring-[3px] ring-[rgba(29,32,34,0.06)]"
                        onClick={() => {
                          hiddenInputRef.current?.focus();
                        }}
                      >
                        <span className="text-[24px] font-medium ad-tnum text-[color:var(--ad-ink)]">010</span>
                        <span className="text-[24px] font-medium text-[color:var(--ad-line-strong)] mx-1">-</span>
                        <span className="text-[24px] font-medium ad-tnum tracking-wider">
                          {part1.split('').map((char, i) => (
                            <span key={i} className={char === '_' ? 'text-[color:var(--ad-line-strong)]' : 'text-[color:var(--ad-ink)]'}>
                              {char}
                            </span>
                          ))}
                        </span>
                        <span className="text-[24px] font-medium text-[color:var(--ad-line-strong)] mx-1">-</span>
                        <span className="text-[24px] font-medium ad-tnum tracking-wider">
                          {part2.split('').map((char, i) => (
                            <span key={i} className={char === '_' ? 'text-[color:var(--ad-line-strong)]' : 'text-[color:var(--ad-ink)]'}>
                              {char}
                            </span>
                          ))}
                        </span>
                      </div>
                    </div>

                    {/* Customer Search Status */}
                    {isSearching && (
                      <div className="flex items-center justify-center py-4 bg-[color:var(--ad-bg-alt)] rounded-[12px]">
                        <Loader2 className="w-5 h-5 animate-spin text-[color:var(--ad-faint)] mr-2" />
                        <span className="text-[13px] text-[color:var(--ad-muted)]">고객 검색 중...</span>
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
                      className="ad-press hidden lg:flex h-11 w-full items-center justify-center gap-1.5 rounded-[12px] bg-[color:var(--ad-ink)] px-4 text-[13.5px] font-semibold text-white hover:bg-[#383c40] disabled:opacity-40"
                      size="lg"
                    >
                      다음
                    </Button>
                  </div>

                  {/* Right Column - Keypad */}
                  <div className="bg-[color:var(--ad-bg-alt)] rounded-[16px] p-3">
                    <div className="grid grid-cols-3 gap-2">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                        <button
                          key={num}
                          onClick={() => handleKeypadPress(num.toString())}
                          className="aspect-square flex items-center justify-center text-[20px] font-medium text-[color:var(--ad-ink)] ad-tnum bg-white rounded-[12px] shadow-[inset_0_0_0_1px_var(--ad-line)] hover:bg-[color:var(--ad-bg-alt)] active:bg-[color:var(--ad-bg)] transition-colors"
                        >
                          {num}
                        </button>
                      ))}
                      <button
                        onClick={handleKeypadClear}
                        className="aspect-square flex items-center justify-center text-[13px] font-medium text-[color:var(--ad-neg)] bg-white rounded-[12px] shadow-[inset_0_0_0_1px_var(--ad-line)] hover:bg-[#fff0f3] active:bg-[#ffe1e8] transition-colors"
                      >
                        초기화
                      </button>
                      <button
                        onClick={() => handleKeypadPress('0')}
                        className="aspect-square flex items-center justify-center text-[20px] font-medium text-[color:var(--ad-ink)] ad-tnum bg-white rounded-[12px] shadow-[inset_0_0_0_1px_var(--ad-line)] hover:bg-[color:var(--ad-bg-alt)] active:bg-[color:var(--ad-bg)] transition-colors"
                      >
                        0
                      </button>
                      <button
                        onClick={handleKeypadDelete}
                        className="aspect-square flex items-center justify-center text-[color:var(--ad-ink-2)] bg-[color:var(--ad-bg)] rounded-[12px] hover:bg-[color:var(--ad-line)] active:bg-[color:var(--ad-line-strong)] transition-colors"
                      >
                        <Delete className="w-5 h-5" />
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
                  className="ad-press mt-4 flex h-11 w-full lg:hidden items-center justify-center gap-1.5 rounded-[12px] bg-[color:var(--ad-ink)] px-4 text-[13.5px] font-semibold text-white hover:bg-[#383c40] disabled:opacity-40"
                  size="lg"
                >
                  다음
                </Button>

              </div>
            </div>
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
            <div className="bg-[color:var(--ad-bg-alt)] rounded-[12px] p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-[color:var(--ad-muted)]">고객</span>
                  <span className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">
                    {customer?.name || (isNewCustomer ? '신규 고객' : '알 수 없음')}
                  </span>
                  {customer?.isVip && <span className="inline-flex rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">VIP</span>}
                  {isNewCustomer && <span className="inline-flex rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">신규</span>}
                </div>
                <span className="text-[13px] text-[color:var(--ad-muted)]">
                  010-{phoneInput.slice(0, 4)}-{phoneInput.slice(4)}
                </span>
              </div>
              {customer && (
                <p className="mt-1 text-[12px] text-[color:var(--ad-faint)] ad-tnum">
                  보유 포인트: {formatNumber(customer.totalPoints)}P · 방문 {customer.visitCount}회
                </p>
              )}
            </div>

            {/* Input Method Selection */}
            {!inputMethod && (
              <div className="space-y-3">
                <p className="text-[13px] font-medium text-[color:var(--ad-ink-2)]">적립 방식을 선택하세요</p>
                <div className="grid grid-cols-2 gap-3">
                  {/* Payment Amount Option */}
                  <button
                    onClick={() => handleSelectInputMethod('payment')}
                    disabled={!storeSettings.pointRateEnabled}
                    className={`ad-press p-4 rounded-[12px] border text-left transition-all ${
                      storeSettings.pointRateEnabled
                        ? 'border-[color:var(--ad-line-strong)] bg-white hover:border-[color:var(--ad-ink)] hover:bg-[color:var(--ad-bg-alt)]'
                        : 'border-[color:var(--ad-line)] bg-[color:var(--ad-bg-alt)] cursor-not-allowed'
                    }`}
                  >
                    <Calculator className={`w-5 h-5 mb-2 ${storeSettings.pointRateEnabled ? 'text-[color:var(--ad-muted)]' : 'text-[color:var(--ad-faint)]'}`} strokeWidth={1.8} />
                    <p className={`text-[14px] font-semibold ${storeSettings.pointRateEnabled ? 'text-[color:var(--ad-ink)]' : 'text-[color:var(--ad-faint)]'}`}>
                      결제금액 입력
                    </p>
                    <p className={`text-[12px] mt-1 ${storeSettings.pointRateEnabled ? 'text-[color:var(--ad-muted)]' : 'text-[color:var(--ad-faint)]'}`}>
                      {storeSettings.pointRateEnabled
                        ? `${storeSettings.pointRatePercent}% 자동 계산`
                        : '설정에서 활성화 필요'}
                    </p>
                  </button>

                  {/* Direct Input Option */}
                  <button
                    onClick={() => handleSelectInputMethod('direct')}
                    className="ad-press p-4 rounded-[12px] border border-[color:var(--ad-line-strong)] bg-white hover:border-[color:var(--ad-ink)] hover:bg-[color:var(--ad-bg-alt)] text-left transition-all"
                  >
                    <Keyboard className="w-5 h-5 text-[color:var(--ad-muted)] mb-2" strokeWidth={1.8} />
                    <p className="text-[14px] font-semibold text-[color:var(--ad-ink)]">직접 입력</p>
                    <p className="text-[12px] text-[color:var(--ad-muted)] mt-1">포인트 직접 입력</p>
                  </button>
                </div>
              </div>
            )}

            {/* Payment Amount Input */}
            {inputMethod === 'payment' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Left - Input and Preview */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-[13px] font-medium text-[color:var(--ad-ink-2)]">
                    <Calculator className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                    <span>결제금액 입력 ({storeSettings.pointRatePercent}% 적립)</span>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[13px] font-medium text-[color:var(--ad-ink-2)]">결제 금액</label>
                    <div
                      className="flex items-center justify-between px-4 py-3 border rounded-[12px] bg-white border-[color:var(--ad-ink)] ring-[3px] ring-[rgba(29,32,34,0.06)] cursor-text"
                      onClick={() => paymentInputRef.current?.focus()}
                    >
                      <span className="text-[24px] font-medium tracking-[-0.03em] ad-tnum text-[color:var(--ad-ink)]">
                        {paymentInput ? formatNumber(parseInt(paymentInput)) : '0'}
                      </span>
                      <span className="text-[15px] text-[color:var(--ad-muted)]">원</span>
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
                        className={`ad-press h-9 rounded-[10px] text-[13px] font-medium ad-tnum transition-all ${
                          parseInt(paymentInput) === preset
                            ? 'bg-[color:var(--ad-ink)] text-white'
                            : 'bg-white text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]'
                        }`}
                      >
                        {formatNumber(preset)}
                      </button>
                    ))}
                  </div>

                  {/* Calculated Points Preview */}
                  <div className="bg-[color:var(--ad-bg-alt)] rounded-[12px] p-4 text-center">
                    <p className="text-[12px] text-[color:var(--ad-muted)]">적립 예정 포인트</p>
                    <p className="text-[24px] font-medium tracking-[-0.03em] ad-tnum text-[color:var(--ad-ink)] mt-1">
                      {formatNumber(calculatePointsFromPayment(parseInt(paymentInput) || 0))} P
                    </p>
                  </div>

                  <button
                    onClick={() => setInputMethod(null)}
                    className="text-[12.5px] font-medium text-[color:var(--ad-link)] hover:underline"
                  >
                    ← 다른 방식 선택
                  </button>
                </div>

                {/* Right - Keypad */}
                <div className="bg-[color:var(--ad-bg-alt)] rounded-[16px] p-3">
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                      <button
                        key={num}
                        onClick={() => setPaymentInput(prev => prev + num.toString())}
                        className="aspect-square flex items-center justify-center text-[20px] font-medium text-[color:var(--ad-ink)] ad-tnum bg-white rounded-[12px] shadow-[inset_0_0_0_1px_var(--ad-line)] hover:bg-[color:var(--ad-bg-alt)] active:bg-[color:var(--ad-bg)] transition-colors"
                      >
                        {num}
                      </button>
                    ))}
                    <button
                      onClick={() => setPaymentInput('')}
                      className="aspect-square flex items-center justify-center text-[13px] font-medium text-[color:var(--ad-neg)] bg-white rounded-[12px] shadow-[inset_0_0_0_1px_var(--ad-line)] hover:bg-[#fff0f3] active:bg-[#ffe1e8] transition-colors"
                    >
                      초기화
                    </button>
                    <button
                      onClick={() => setPaymentInput(prev => prev + '0')}
                      className="aspect-square flex items-center justify-center text-[20px] font-medium text-[color:var(--ad-ink)] ad-tnum bg-white rounded-[12px] shadow-[inset_0_0_0_1px_var(--ad-line)] hover:bg-[color:var(--ad-bg-alt)] active:bg-[color:var(--ad-bg)] transition-colors"
                    >
                      0
                    </button>
                    <button
                      onClick={() => setPaymentInput(prev => prev.slice(0, -1))}
                      className="aspect-square flex items-center justify-center text-[color:var(--ad-ink-2)] bg-[color:var(--ad-bg)] rounded-[12px] hover:bg-[color:var(--ad-line)] active:bg-[color:var(--ad-line-strong)] transition-colors"
                    >
                      <Delete className="w-5 h-5" />
                    </button>
                  </div>
                  {/* Quick add buttons */}
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <button
                      onClick={() => setPaymentInput(prev => (parseInt(prev || '0') + 10000).toString())}
                      className="ad-press h-11 rounded-[12px] bg-white text-[13px] font-medium ad-tnum text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] transition-colors"
                    >
                      +1만
                    </button>
                    <button
                      onClick={() => setPaymentInput(prev => (parseInt(prev || '0') + 50000).toString())}
                      className="ad-press h-11 rounded-[12px] bg-white text-[13px] font-medium ad-tnum text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] transition-colors"
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
                  <div className="flex items-center gap-2 text-[13px] font-medium text-[color:var(--ad-ink-2)]">
                    <Keyboard className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                    <span>직접 포인트 입력</span>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[13px] font-medium text-[color:var(--ad-ink-2)]">적립 포인트</label>
                    <div
                      className="flex items-center justify-between px-4 py-3 border rounded-[12px] bg-white border-[color:var(--ad-ink)] ring-[3px] ring-[rgba(29,32,34,0.06)] cursor-text"
                      onClick={() => pointsInputRef.current?.focus()}
                    >
                      <span className="text-[24px] font-medium tracking-[-0.03em] ad-tnum text-[color:var(--ad-ink)]">
                        {pointsInput ? formatNumber(parseInt(pointsInput)) : '0'}
                      </span>
                      <span className="text-[15px] text-[color:var(--ad-muted)]">P</span>
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
                        className={`ad-press h-9 rounded-[10px] text-[13px] font-medium ad-tnum transition-all ${
                          parseInt(pointsInput) === preset
                            ? 'bg-[color:var(--ad-ink)] text-white'
                            : 'bg-white text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]'
                        }`}
                      >
                        {formatNumber(preset)}P
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => setInputMethod(null)}
                    className="text-[12.5px] font-medium text-[color:var(--ad-link)] hover:underline"
                  >
                    ← 다른 방식 선택
                  </button>
                </div>

                {/* Right - Keypad */}
                <div className="bg-[color:var(--ad-bg-alt)] rounded-[16px] p-3">
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                      <button
                        key={num}
                        onClick={() => setPointsInput(prev => prev + num.toString())}
                        className="aspect-square flex items-center justify-center text-[20px] font-medium text-[color:var(--ad-ink)] ad-tnum bg-white rounded-[12px] shadow-[inset_0_0_0_1px_var(--ad-line)] hover:bg-[color:var(--ad-bg-alt)] active:bg-[color:var(--ad-bg)] transition-colors"
                      >
                        {num}
                      </button>
                    ))}
                    <button
                      onClick={() => setPointsInput('')}
                      className="aspect-square flex items-center justify-center text-[13px] font-medium text-[color:var(--ad-neg)] bg-white rounded-[12px] shadow-[inset_0_0_0_1px_var(--ad-line)] hover:bg-[#fff0f3] active:bg-[#ffe1e8] transition-colors"
                    >
                      초기화
                    </button>
                    <button
                      onClick={() => setPointsInput(prev => prev + '0')}
                      className="aspect-square flex items-center justify-center text-[20px] font-medium text-[color:var(--ad-ink)] ad-tnum bg-white rounded-[12px] shadow-[inset_0_0_0_1px_var(--ad-line)] hover:bg-[color:var(--ad-bg-alt)] active:bg-[color:var(--ad-bg)] transition-colors"
                    >
                      0
                    </button>
                    <button
                      onClick={() => setPointsInput(prev => prev.slice(0, -1))}
                      className="aspect-square flex items-center justify-center text-[color:var(--ad-ink-2)] bg-[color:var(--ad-bg)] rounded-[12px] hover:bg-[color:var(--ad-line)] active:bg-[color:var(--ad-line-strong)] transition-colors"
                    >
                      <Delete className="w-5 h-5" />
                    </button>
                  </div>
                  {/* Quick add buttons */}
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <button
                      onClick={() => setPointsInput(prev => (parseInt(prev || '0') + 500).toString())}
                      className="ad-press h-11 rounded-[12px] bg-white text-[13px] font-medium ad-tnum text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] transition-colors"
                    >
                      +500P
                    </button>
                    <button
                      onClick={() => setPointsInput(prev => (parseInt(prev || '0') + 1000).toString())}
                      className="ad-press h-11 rounded-[12px] bg-white text-[13px] font-medium ad-tnum text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] transition-colors"
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
              className="ad-press inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] border-0 bg-white px-3.5 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
              onClick={() => {
                setShowInputMethodModal(false);
                setInputMethod(null);
              }}
            >
              취소
            </Button>
            {inputMethod && (
              <Button
                className="ad-press inline-flex h-10 items-center justify-center gap-1.5 rounded-[12px] bg-[color:var(--ad-ink)] px-4 text-[13.5px] font-semibold text-white hover:bg-[#383c40] disabled:opacity-40"
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
            <div className="bg-[color:var(--ad-bg-alt)] rounded-[12px] p-4 space-y-3">
              {/* Customer info */}
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-[color:var(--ad-muted)]">고객</span>
                <div className="flex items-center gap-2">
                  <span className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">
                    {customer?.name || (isNewCustomer ? '신규 고객' : '알 수 없음')}
                  </span>
                  {customer?.isVip && <span className="inline-flex rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">VIP</span>}
                  {isNewCustomer && <span className="inline-flex rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">신규</span>}
                </div>
              </div>

              {/* Phone */}
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-[color:var(--ad-muted)]">전화번호</span>
                <span className="text-[13.5px] font-medium text-[color:var(--ad-ink)]">
                  010-{phoneInput.slice(0, 4)}-{phoneInput.slice(4)}
                </span>
              </div>

              {/* Points to earn */}
              <div className="flex items-center justify-between border-t border-[color:var(--ad-line)] pt-3">
                <span className="text-[13px] text-[color:var(--ad-muted)]">적립 포인트</span>
                <span className="text-[20px] font-medium tracking-[-0.03em] ad-tnum text-[color:var(--ad-ink)]">
                  +{formatNumber(currentPoints)} P
                </span>
              </div>

              {/* New balance (if existing customer) */}
              {customer && (
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-[color:var(--ad-muted)]">적립 후 잔액</span>
                  <span className="text-[13.5px] font-medium ad-tnum text-[color:var(--ad-pos)]">
                    {formatNumber(customer.totalPoints + currentPoints)} P
                  </span>
                </div>
              )}
            </div>
          </div>

          <ModalFooter>
            <Button
              variant="outline"
              className="ad-press inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] border-0 bg-white px-3.5 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
              onClick={() => setShowConfirmModal(false)}
              disabled={isSubmitting}
            >
              취소
            </Button>
            <Button
              onClick={handleSubmitEarn}
              disabled={isSubmitting}
              className="min-w-24 ad-press inline-flex h-10 items-center justify-center gap-1.5 rounded-[12px] bg-[color:var(--ad-ink)] px-4 text-[13.5px] font-semibold text-white hover:bg-[#383c40] disabled:opacity-40"
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
              <div className="w-14 h-14 bg-[color:var(--ad-bg)] rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-[color:var(--ad-pos)]" strokeWidth={1.7} />
              </div>
            </div>
            <h2 className="text-[17px] font-semibold text-[color:var(--ad-ink)] mb-2">
              포인트 적립 완료
            </h2>
            <p className="text-[13.5px] text-[color:var(--ad-ink-2)] mb-4">
              {successData?.customerName || '고객'}님에게<br />
              <span className="text-[color:var(--ad-ink)] font-semibold text-[17px] ad-tnum">
                {formatNumber(successData?.points || 0)}P
              </span>
              가 적립되었습니다.
            </p>
            <div className="bg-[color:var(--ad-bg-alt)] rounded-[12px] py-3 px-4 inline-block">
              <span className="text-[13px] text-[color:var(--ad-muted)]">현재 보유 포인트</span>
              <p className="text-[20px] font-medium tracking-[-0.03em] ad-tnum text-[color:var(--ad-ink)]">
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
              className="min-w-32 ad-press inline-flex h-10 items-center justify-center gap-1.5 rounded-[12px] bg-[color:var(--ad-ink)] px-4 text-[13.5px] font-semibold text-white hover:bg-[#383c40] disabled:opacity-40"
            >
              확인
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

    </div>
  );
}
