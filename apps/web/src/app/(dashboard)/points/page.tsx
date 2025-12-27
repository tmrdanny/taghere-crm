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
import { Delete, Loader2, UserPlus, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

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

// Preset point amounts
const POINT_PRESETS = [100, 500, 1000, 2000];

export default function PointsPage() {
  // Input states
  const [phoneInput, setPhoneInput] = useState('');
  const [pointsInput, setPointsInput] = useState('');
  const [step, setStep] = useState<'phone' | 'points'>('phone');

  // Customer states
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  // Recent transactions
  const [recentTransactions, setRecentTransactions] = useState<RecentTransaction[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(true);

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

      const res = await fetch(`${API_BASE}/api/points/recent?limit=5`, {
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

  // Initial load
  useEffect(() => {
    fetchRecentTransactions();
    // Auto focus on mount
    setTimeout(() => {
      hiddenInputRef.current?.focus();
    }, 100);
  }, [fetchRecentTransactions]);

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

      setStep('points');
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

  // Handle keypad press
  const handleKeypadPress = (key: string) => {
    if (step === 'phone') {
      if (phoneInput.length < 8) {
        const newValue = phoneInput + key;
        setPhoneInput(newValue);
        if (newValue.length === 8) {
          handlePhoneComplete(newValue);
        }
      }
    } else {
      if (pointsInput.length < 6) {
        setPointsInput(pointsInput + key);
      }
    }
  };

  const handleKeypadDelete = () => {
    if (step === 'phone') {
      setPhoneInput(phoneInput.slice(0, -1));
    } else {
      setPointsInput(pointsInput.slice(0, -1));
    }
  };

  const handleKeypadClear = () => {
    if (step === 'phone') {
      setPhoneInput('');
    } else {
      setPointsInput('');
    }
  };

  // Handle preset selection
  const handlePresetSelect = (amount: number) => {
    setPointsInput(amount.toString());
  };

  // Handle keyboard input
  const handleHiddenInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    if (step === 'phone') {
      if (value.length <= 8) {
        setPhoneInput(value);
        if (value.length === 8) {
          handlePhoneComplete(value);
        }
      }
    } else {
      if (value.length <= 6) {
        setPointsInput(value);
      }
    }
  };

  const handleHiddenInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (step === 'phone' && phoneInput.length === 8) {
        handlePhoneComplete(phoneInput);
      } else if (step === 'points' && pointsInput && parseInt(pointsInput) > 0) {
        setShowConfirmModal(true);
      }
    }
  };

  // Reset all inputs
  const handleReset = () => {
    setPhoneInput('');
    setPointsInput('');
    setStep('phone');
    setCustomer(null);
    setIsNewCustomer(false);
    setError(null);
    setTimeout(() => {
      hiddenInputRef.current?.focus();
    }, 100);
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
    <div className="h-[calc(100vh-4rem)] p-3 overflow-hidden">
      <div className="h-full max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 h-full">
          {/* Left: Recent Transactions */}
          <Card className="p-3 lg:col-span-2 order-2 lg:order-1 hidden lg:flex flex-col overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-neutral-500">
                최근 적립 내역
              </h2>
              <button
                onClick={fetchRecentTransactions}
                className="p-1 rounded hover:bg-neutral-100 transition-colors"
                title="새로고침"
              >
                <RefreshCw className="w-4 h-4 text-neutral-400" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1">
              {isLoadingRecent ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
                </div>
              ) : recentTransactions.length === 0 ? (
                <p className="text-center text-sm text-neutral-400 py-8">
                  적립 내역이 없습니다
                </p>
              ) : (
                recentTransactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between py-2 border-b border-neutral-100 last:border-0"
                  >
                    <div>
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-medium text-neutral-900">
                          {tx.customerName || (tx.phone ? formatPhone(tx.phone) : '알 수 없음')}
                        </span>
                        {tx.isVip && <Badge variant="vip">VIP</Badge>}
                        {tx.isNew && <Badge variant="new">신규</Badge>}
                      </div>
                      <span className="text-xs text-neutral-500">
                        {formatTime(tx.createdAt)}
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-green-600">
                      +{formatNumber(tx.points)}P
                    </span>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Right: Input Section */}
          <Card className="p-4 lg:col-span-3 order-1 lg:order-2 flex flex-col h-full overflow-hidden">
            {/* Hidden input for keyboard typing */}
            <input
              ref={hiddenInputRef}
              type="text"
              inputMode="numeric"
              value={step === 'phone' ? phoneInput : pointsInput}
              onChange={handleHiddenInputChange}
              onKeyDown={handleHiddenInputKeyDown}
              className="absolute opacity-0 pointer-events-none"
              autoFocus
            />

            <h1 className="text-xl font-bold text-neutral-900 text-center mb-1">
              포인트 적립
            </h1>

            {/* Error message */}
            {error && (
              <div className="flex items-center gap-2 bg-red-50 text-red-700 px-3 py-2 rounded-lg mb-2 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
                <button
                  onClick={() => setError(null)}
                  className="ml-auto text-red-500 hover:text-red-700"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Customer info card */}
            {step === 'points' && (
              <div className="mb-2">
                {isSearching ? (
                  <div className="flex items-center justify-center py-3 bg-neutral-50 rounded-xl">
                    <Loader2 className="w-5 h-5 animate-spin text-neutral-400 mr-2" />
                    <span className="text-sm text-neutral-500">고객 검색 중...</span>
                  </div>
                ) : customer ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-neutral-900">
                          {customer.name || '이름 없음'}
                        </span>
                        {customer.isVip && <Badge variant="vip">VIP</Badge>}
                      </div>
                      <span className="text-brand-800 font-bold">
                        {formatNumber(customer.totalPoints)}P 보유
                      </span>
                    </div>
                    <p className="text-xs text-neutral-500 mt-1">
                      방문 {customer.visitCount}회
                      {customer.lastVisitAt && ` · ${getRelativeTime(customer.lastVisitAt)}`}
                    </p>
                  </div>
                ) : isNewCustomer ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <div className="flex items-center gap-2">
                      <UserPlus className="w-5 h-5 text-amber-600" />
                      <span className="font-semibold text-amber-800">신규 고객</span>
                    </div>
                    <p className="text-xs text-amber-600 mt-1">
                      적립 시 자동으로 고객이 등록됩니다
                    </p>
                  </div>
                ) : null}
              </div>
            )}

            {/* Phone input display */}
            <div className="mb-2">
              <label className="text-xs font-medium text-brand-800 block mb-1">
                전화번호
              </label>
              <div
                className={`flex items-center justify-center px-3 py-3 border-2 rounded-xl bg-white cursor-text ${
                  step === 'phone' ? 'border-brand-800' : 'border-neutral-200'
                }`}
                onClick={() => {
                  if (step !== 'phone') {
                    setStep('phone');
                    setCustomer(null);
                    setIsNewCustomer(false);
                  }
                  hiddenInputRef.current?.focus();
                }}
              >
                <span className="text-xl font-medium text-neutral-900">010</span>
                <span className="text-xl font-medium text-neutral-400 mx-2">-</span>
                <span className="text-xl font-medium text-neutral-900 tracking-widest">
                  {part1.split('').map((char, i) => (
                    <span key={i} className={char === '_' ? 'text-neutral-300' : ''}>
                      {char}
                    </span>
                  ))}
                </span>
                <span className="text-xl font-medium text-neutral-400 mx-2">-</span>
                <span className="text-xl font-medium text-neutral-900 tracking-widest">
                  {part2.split('').map((char, i) => (
                    <span key={i} className={char === '_' ? 'text-neutral-300' : ''}>
                      {char}
                    </span>
                  ))}
                </span>
              </div>
            </div>

            {/* Points input display with presets */}
            <div className="mb-2">
              <label className="text-xs font-medium text-neutral-500 block mb-1">
                적립 포인트
              </label>

              {/* Preset buttons */}
              {step === 'points' && (
                <div className="flex gap-1.5 mb-2">
                  {POINT_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => handlePresetSelect(preset)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                        currentPoints === preset
                          ? 'bg-brand-800 text-white'
                          : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                      }`}
                    >
                      {formatNumber(preset)}
                    </button>
                  ))}
                </div>
              )}

              <div
                className={`flex items-center justify-center px-3 py-3 rounded-xl cursor-text ${
                  step === 'points'
                    ? 'border-2 border-brand-800 bg-white'
                    : 'bg-neutral-100 border border-neutral-200'
                }`}
                onClick={() => {
                  if (phoneInput.length === 8 && !isSearching) {
                    setStep('points');
                    hiddenInputRef.current?.focus();
                  }
                }}
              >
                {step === 'points' ? (
                  <span className="text-xl font-bold text-neutral-900">
                    {pointsInput ? `${formatNumber(parseInt(pointsInput))} P` : '0 P'}
                  </span>
                ) : (
                  <span className="text-sm text-neutral-400">
                    번호 입력 후 포인트를 입력하세요
                  </span>
                )}
              </div>
            </div>

            {/* Keypad */}
            <div className="grid grid-cols-3 gap-1.5 mb-3 flex-1 min-h-0">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  onClick={() => handleKeypadPress(num.toString())}
                  className="text-xl font-medium text-neutral-900 bg-neutral-50 rounded-lg hover:bg-neutral-100 active:bg-neutral-200 transition-colors"
                >
                  {num}
                </button>
              ))}
              <button
                onClick={handleKeypadClear}
                className="text-sm font-medium text-neutral-700 bg-red-50 rounded-lg hover:bg-red-100 active:bg-red-200 transition-colors"
              >
                초기화
              </button>
              <button
                onClick={() => handleKeypadPress('0')}
                className="text-xl font-medium text-neutral-900 bg-neutral-50 rounded-lg hover:bg-neutral-100 active:bg-neutral-200 transition-colors"
              >
                0
              </button>
              <button
                onClick={handleKeypadDelete}
                className="flex items-center justify-center text-neutral-700 bg-neutral-50 rounded-lg hover:bg-neutral-100 active:bg-neutral-200 transition-colors"
              >
                <Delete className="w-5 h-5" />
              </button>
            </div>

            {/* Submit button */}
            <Button
              onClick={() => {
                if (step === 'phone' && phoneInput.length === 8) {
                  handlePhoneComplete(phoneInput);
                } else if (step === 'points' && currentPoints > 0) {
                  setShowConfirmModal(true);
                }
              }}
              disabled={
                (step === 'phone' && phoneInput.length !== 8) ||
                (step === 'points' && currentPoints <= 0) ||
                isSearching
              }
              className="w-full py-3 text-base font-semibold rounded-full flex-shrink-0"
            >
              {step === 'phone' ? '다음' : '적립 완료'}
            </Button>
          </Card>
        </div>
      </div>

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
