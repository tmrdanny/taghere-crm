'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalFooter,
} from '@/components/ui/modal';
import { formatCurrency, formatPhone } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import {
  Info,
  ChevronLeft,
  Menu,
  Loader2,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  XCircle,
  Send,
  Wallet,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface Settings {
  enabled: boolean;
  sendFrequency: 'every' | 'first_only';
  benefitText: string;
  naverReviewUrl: string | null;
  balance: number;
  storeName: string;
}

// 최소 충전금 (5원 미만이면 자동 발송 불가)
const MIN_BALANCE_FOR_AUTO_SEND = 5;

interface ReviewLog {
  id: string;
  customerId: string | null;
  orderId: string | null;
  phone: string | null;
  status: 'PENDING' | 'SENT' | 'FAILED';
  cost: number;
  failReason: string | null;
  sentAt: string | null;
  createdAt: string;
  customer?: {
    id: string;
    name: string | null;
    phone: string | null;
  } | null;
}

export default function NaverReviewPage() {
  const router = useRouter();
  const { showToast, ToastComponent } = useToast();

  // Settings state
  const [settings, setSettings] = useState<Settings>({
    enabled: false,
    sendFrequency: 'every',
    benefitText: '',
    naverReviewUrl: null,
    balance: 0,
    storeName: '',
  });

  // Local input states (for unsaved changes)
  const [benefitText, setBenefitText] = useState('');
  const [naverPlaceUrl, setNaverPlaceUrl] = useState('');

  // 충전금이 5원 미만이면 자동 발송 불가
  const canEnableAutoSend = settings.balance >= MIN_BALANCE_FOR_AUTO_SEND;

  // Logs state
  const [logs, setLogs] = useState<ReviewLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(true);

  // UI states
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Test send modal
  const [showTestModal, setShowTestModal] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [isTestSending, setIsTestSending] = useState(false);
  const [testCount, setTestCount] = useState({ count: 0, limit: 5, remaining: 5 });

  // Get auth token
  const getAuthToken = () => {
    if (typeof window === 'undefined') return 'dev-token';
    return localStorage.getItem('token') || 'dev-token';
  };

  // Fetch settings
  const fetchSettings = useCallback(async () => {
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/api/review-automation/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        setBenefitText(data.benefitText || '');
        setNaverPlaceUrl(data.naverReviewUrl || '');
        // 충전금이 5원 미만이면 자동 발송 강제 OFF
        if ((data.balance ?? 0) < MIN_BALANCE_FOR_AUTO_SEND && data.enabled) {
          setSettings((prev) => ({ ...prev, enabled: false }));
        }
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err);
      setError('설정을 불러오는데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch logs
  const fetchLogs = useCallback(async () => {
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/api/review-automation/logs?limit=20`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setIsLoadingLogs(false);
    }
  }, []);

  // Fetch test count
  const fetchTestCount = useCallback(async () => {
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/api/review-automation/test-count`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setTestCount(data);
      }
    } catch (err) {
      console.error('Failed to fetch test count:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchSettings();
    fetchLogs();
    fetchTestCount();
  }, [fetchSettings, fetchLogs, fetchTestCount]);

  // Save settings
  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    // 필수 값 검증
    if (!benefitText.trim()) {
      setError('리뷰 이벤트 상품(혜택 내용)을 입력해주세요.');
      setIsSaving(false);
      return;
    }

    if (!naverPlaceUrl.trim()) {
      setError('네이버 플레이스 링크를 입력해주세요.');
      setIsSaving(false);
      return;
    }

    // 네이버 플레이스 URL 형식 검증
    if (!naverPlaceUrl.includes('naver.me') && !naverPlaceUrl.includes('map.naver.com') && !naverPlaceUrl.includes('place.naver.com')) {
      setError('올바른 네이버 플레이스 링크를 입력해주세요.');
      setIsSaving(false);
      return;
    }

    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/api/review-automation/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          enabled: settings.enabled,
          sendFrequency: settings.sendFrequency,
          benefitText,
          naverReviewUrl: naverPlaceUrl,
        }),
      });

      if (!res.ok) {
        throw new Error('설정 저장에 실패했습니다.');
      }

      showToast('설정이 저장되었습니다.', 'success');
      fetchSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패');
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle enabled
  const handleToggleEnabled = async (enabled: boolean) => {
    // 충전금이 5원 미만이면 켤 수 없음
    if (enabled && !canEnableAutoSend) {
      setError('충전금이 5원 미만입니다. 자동 발송을 사용하려면 먼저 충전해주세요.');
      return;
    }

    // 자동 발송 켜기 전 필수 값 검증
    if (enabled) {
      if (!benefitText.trim()) {
        setError('자동 발송을 사용하려면 리뷰 이벤트 상품(혜택 내용)을 입력하고 저장해주세요.');
        return;
      }
      if (!naverPlaceUrl.trim()) {
        setError('자동 발송을 사용하려면 네이버 플레이스 링크를 입력하고 저장해주세요.');
        return;
      }
    }

    setSettings((prev) => ({ ...prev, enabled }));

    try {
      const token = getAuthToken();
      await fetch(`${API_BASE}/api/review-automation/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled }),
      });
    } catch (err) {
      console.error('Failed to toggle enabled:', err);
    }
  };

  // Test send
  const handleTestSend = async () => {
    setIsTestSending(true);
    setError(null);

    try {
      const token = getAuthToken();

      const res = await fetch(`${API_BASE}/api/review-automation/test-send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          phone: testPhone,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        showToast(data.message || '테스트 발송이 완료되었습니다.', 'success');
        setShowTestModal(false);
        setTestPhone('');
        fetchTestCount(); // 테스트 횟수 갱신
      } else {
        setError(data.error || '테스트 발송 실패');
      }

      fetchLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : '테스트 발송 실패');
    } finally {
      setIsTestSending(false);
    }
  };

  // Format time
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) return '방금 전';
    if (diffMins < 60) return `${diffMins}분 전`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}시간 전`;

    return date.toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <Loader2 className="w-8 h-8 animate-spin text-brand-800" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Toast notification */}
      {ToastComponent}

      <div className="max-w-7xl mx-auto">
        {/* Error message */}
        {error && (
          <div className="mb-4 flex items-center gap-2 bg-red-50 text-red-700 px-4 py-3 rounded-lg">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto">
              ✕
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Settings */}
          <div className="lg:col-span-2 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-semibold text-neutral-900">
                네이버 리뷰 자동 요청 설정
              </h1>
              <div className="flex items-center gap-3">
                <span className="text-sm text-neutral-500">
                  {settings.enabled && canEnableAutoSend ? '자동 발송 사용 중' : '자동 발송 중지'}
                </span>
                <Switch
                  checked={settings.enabled && canEnableAutoSend}
                  onCheckedChange={handleToggleEnabled}
                  disabled={!canEnableAutoSend}
                />
              </div>
            </div>

            {/* Info Card */}
            <Card className="p-4 bg-blue-50 border-blue-200">
              <div className="flex gap-3">
                <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="text-blue-800">
                    태그히어 포인트 적립 시, 고객에게 자동으로 네이버 영수증 리뷰 요청 알림톡이 발송됩니다.
                  </p>
                  <p className="text-blue-600 mt-1">
                    알림톡 1건 발송 시 50원이 차감됩니다.
                  </p>
                </div>
              </div>
            </Card>

            {/* Send Frequency Setting */}
            <Card className="p-6">
              <div className="space-y-3">
                <label className="text-sm font-medium text-neutral-700 block">
                  발송 빈도 설정
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setSettings((prev) => ({ ...prev, sendFrequency: 'every' }))}
                    className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all ${
                      settings.sendFrequency === 'every'
                        ? 'border-brand-500 bg-brand-50 text-brand-800'
                        : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'
                    }`}
                  >
                    <div className="font-medium mb-1">매 주문 발송</div>
                    <p className="text-xs text-neutral-500">
                      포인트 적립할 때마다 리뷰 요청 발송
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettings((prev) => ({ ...prev, sendFrequency: 'first_only' }))}
                    className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all ${
                      settings.sendFrequency === 'first_only'
                        ? 'border-brand-500 bg-brand-50 text-brand-800'
                        : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'
                    }`}
                  >
                    <div className="font-medium mb-1">첫 주문 1회만 발송</div>
                    <p className="text-xs text-neutral-500">
                      오늘 첫 포인트 적립 시에만 리뷰 요청 발송
                    </p>
                  </button>
                </div>
                <p className="text-xs text-neutral-400">
                  {settings.sendFrequency === 'every'
                    ? '고객이 포인트를 적립할 때마다 리뷰 요청 알림톡이 발송됩니다.'
                    : '고객이 오늘 처음 포인트를 적립할 때만 리뷰 요청 알림톡이 발송됩니다. 같은 날 추가 주문 시에는 발송되지 않습니다.'}
                </p>
              </div>
            </Card>

            {/* Balance Card */}
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-neutral-500 mb-1">현재 보유 충전금</p>
                  <p className="text-3xl font-bold text-neutral-900">
                    {formatCurrency(settings.balance)}
                  </p>
                  <p className="text-xs text-neutral-400 mt-1">
                    약 {Math.floor(settings.balance / 50)}건 발송 가능
                  </p>
                </div>
                <Button onClick={() => router.push('/billing')}>
                  <Wallet className="w-4 h-4 mr-2" />
                  충전하기
                </Button>
              </div>
            </Card>

            {/* Balance Warning */}
            {!canEnableAutoSend && (
              <Card className="p-4 bg-amber-50 border-amber-200">
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="text-amber-800 font-medium">
                      충전금이 {MIN_BALANCE_FOR_AUTO_SEND}원 미만입니다
                    </p>
                    <p className="text-amber-600 mt-1">
                      자동 발송을 사용하려면 먼저 충전해주세요. 현재 잔액: {formatCurrency(settings.balance)}
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {/* Benefit Text & Naver Place URL Input */}
            <Card className="p-6">
              <div className="space-y-6">
                {/* 리뷰 이벤트 상품 */}
                <div>
                  <label className="text-sm font-medium text-neutral-700 block mb-1">
                    리뷰 이벤트 상품 (혜택 내용) <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={benefitText}
                    onChange={(e) => setBenefitText(e.target.value)}
                    placeholder="예: 🍤 네이버 리뷰 작성시 새우 튀김 18cm (8,000원 상당) 즉시 제공!"
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                    rows={3}
                  />
                  <p className="text-sm text-neutral-500 mt-1">
                    고객에게 보여질 혜택 내용을 입력해주세요. 우측 미리보기에서 확인할 수 있습니다.
                  </p>
                </div>

                {/* 네이버 플레이스 링크 */}
                <div>
                  <label className="text-sm font-medium text-neutral-700 block mb-1">
                    네이버 플레이스 링크 <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={naverPlaceUrl}
                    onChange={(e) => setNaverPlaceUrl(e.target.value)}
                    placeholder="https://naver.me/xxxxx 또는 https://map.naver.com/..."
                    className="w-full"
                  />
                  <p className="text-sm text-neutral-500 mt-1">
                    네이버플레이스 → &apos;공유&apos;를 클릭하여 나오는 링크를 넣어주세요.
                  </p>
                </div>
              </div>
            </Card>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 h-12 text-base"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                설정 저장하기
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowTestModal(true)}
                className="h-12"
              >
                <Send className="w-4 h-4 mr-2" />
                테스트 발송
              </Button>
            </div>

            {/* Recent Logs */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-neutral-900">최근 발송 로그</h2>
                <button
                  onClick={fetchLogs}
                  className="p-1 rounded hover:bg-neutral-100 transition-colors"
                >
                  <RefreshCw className="w-4 h-4 text-neutral-400" />
                </button>
              </div>

              {isLoadingLogs ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
                </div>
              ) : logs.length === 0 ? (
                <p className="text-center text-neutral-400 py-8">
                  발송 로그가 없습니다
                </p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between py-3 border-b border-neutral-100 last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        {log.status === 'SENT' ? (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-500" />
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-neutral-900">
                              {log.customer?.name || (log.phone ? formatPhone(log.phone) : log.orderId)}
                            </span>
                            <Badge
                              variant={log.status === 'SENT' ? 'success' : 'error'}
                            >
                              {log.status === 'SENT' ? '발송' : '실패'}
                            </Badge>
                          </div>
                          {log.failReason && (
                            <p className="text-xs text-red-500">{log.failReason}</p>
                          )}
                          <p className="text-xs text-neutral-400">
                            {formatTime(log.createdAt)}
                          </p>
                        </div>
                      </div>
                      <span className="text-sm text-neutral-500">
                        {log.cost > 0 ? `-${log.cost}원` : '-'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Right: Phone Preview */}
          <div className="lg:col-span-1">
            <p className="text-center text-neutral-500 mb-4">발송 메세지 미리보기</p>
            <div className="flex justify-center sticky top-24">
              {/* Phone Frame */}
              <div className="relative w-72 h-[580px] bg-neutral-800 rounded-[2.5rem] p-2 shadow-2xl">
                {/* Inner bezel */}
                <div className="w-full h-full bg-neutral-900 rounded-[2rem] p-1 overflow-hidden">
                  {/* Screen */}
                  <div className="w-full h-full bg-[#B2C7D9] rounded-[1.75rem] overflow-hidden flex flex-col relative">
                    {/* Dynamic Island / Notch */}
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 w-16 h-5 bg-neutral-900 rounded-full z-10" />

                    {/* KakaoTalk header */}
                    <div className="flex items-center justify-between px-4 pt-10 pb-2">
                      <ChevronLeft className="w-4 h-4 text-neutral-700" />
                      <span className="font-medium text-xs text-neutral-800">채널명</span>
                      <Menu className="w-4 h-4 text-neutral-700" />
                    </div>

                    {/* Date badge */}
                    <div className="flex justify-center mb-3">
                      <span className="text-[10px] bg-neutral-500/30 text-neutral-700 px-2 py-0.5 rounded-full">
                        {new Date().toLocaleDateString('ko-KR', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </span>
                    </div>

                    {/* Message area */}
                    <div className="flex-1 pl-2 pr-4 overflow-auto">
                      <div className="flex gap-1.5">
                        {/* Profile icon */}
                        <div className="flex-shrink-0">
                          <div className="w-7 h-7 rounded-full bg-neutral-300" />
                        </div>

                        {/* Message content */}
                        <div className="flex-1 min-w-0 mr-4">
                          <p className="text-[10px] text-neutral-600 mb-0.5">채널명</p>

                          {/* Message bubble - KakaoTalk style */}
                          <div className="relative">
                            {/* Kakao badge */}
                            <div className="absolute -top-1 -right-1 z-10">
                              <span className="bg-neutral-700 text-white text-[8px] px-1 py-0.5 rounded-full font-medium">
                                kakao
                              </span>
                            </div>

                            <div className="bg-[#FEE500] rounded-t-md px-2 py-1.5">
                              <span className="text-xs font-medium text-neutral-800">알림톡 도착</span>
                            </div>
                            <div className="bg-white rounded-b-md shadow-sm overflow-hidden">
                              {/* Full width image */}
                              <img
                                src="/event-review.png"
                                alt="리뷰 이벤트"
                                className="w-full object-cover"
                              />

                              {/* Message body */}
                              <div className="p-4">
                                <p className="text-xs text-neutral-800 mb-3">
                                  {settings.storeName || '#{매장명}'}에서 이벤트 참여를 요청했어요.
                                </p>
                                <p className="text-xs text-neutral-700 mb-1">
                                  리뷰 작성하고 이벤트에 참여하세요!
                                </p>
                                <p className="text-xs text-neutral-700 mb-3 whitespace-pre-wrap">
                                  {benefitText || '#{리뷰내용}'}
                                </p>
                                <p className="text-xs text-neutral-500 mb-4">
                                  영수증이 필요하실 경우 매장 직원을 불러주세요.
                                </p>

                                {/* CTA Button */}
                                <button className="w-full py-2.5 border border-neutral-300 rounded-md text-xs font-medium text-neutral-800 bg-white hover:bg-neutral-50 transition-colors">
                                  리뷰 작성 하기
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Time */}
                          <p className="text-[8px] text-neutral-500 mt-0.5 text-right">
                            오전 {new Date().getHours() < 12 ? new Date().getHours() : new Date().getHours() - 12}:{String(new Date().getMinutes()).padStart(2, '0')}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Bottom safe area */}
                    <div className="h-6" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Test Send Modal */}
      <Modal open={showTestModal} onOpenChange={setShowTestModal}>
        <ModalContent className="max-w-sm">
          <ModalHeader>
            <ModalTitle>테스트 발송</ModalTitle>
          </ModalHeader>

          <div className="py-4 space-y-4">
            <p className="text-sm text-neutral-600">
              테스트용 전화번호를 입력해주세요.
            </p>
            <p className="text-sm text-blue-600">
              테스트 발송은 금액이 차감되지 않아요.
            </p>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-700">
                오늘 테스트 발송: {testCount.count}/{testCount.limit}회 (남은 횟수: {testCount.remaining}회)
              </p>
            </div>
            <Input
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="01012345678"
            />
          </div>

          <ModalFooter>
            <Button
              variant="outline"
              onClick={() => setShowTestModal(false)}
              disabled={isTestSending}
            >
              취소
            </Button>
            <Button
              onClick={handleTestSend}
              disabled={isTestSending || !testPhone || testCount.remaining <= 0}
            >
              {isTestSending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                '테스트 발송'
              )}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
