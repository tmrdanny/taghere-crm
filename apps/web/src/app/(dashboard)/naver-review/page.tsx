'use client';

import { API_BASE } from '@/lib/api-config';
import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  Info,
  ChevronLeft,
  Menu,
  Loader2,
  AlertCircle,
  Clock,
} from 'lucide-react';


interface Settings {
  benefitText: string;
  storeName: string;
  alimtalkDelayEnabled: boolean;
  alimtalkDelayMinutes: number;
}

export default function NaverReviewPage() {
  const { showToast, ToastComponent } = useToast();

  // Settings state
  const [settings, setSettings] = useState<Settings>({
    benefitText: '',
    storeName: '',
    alimtalkDelayEnabled: false,
    alimtalkDelayMinutes: 30,
  });

  // Local input state
  const [benefitText, setBenefitText] = useState('');
  const [delayEnabled, setDelayEnabled] = useState(false);
  const [delayMinutes, setDelayMinutes] = useState(30);

  // UI states
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setSettings({
          benefitText: data.benefitText || '',
          storeName: data.storeName || '',
          alimtalkDelayEnabled: data.alimtalkDelayEnabled ?? false,
          alimtalkDelayMinutes: data.alimtalkDelayMinutes ?? 30,
        });
        setBenefitText(data.benefitText || '');
        setDelayEnabled(data.alimtalkDelayEnabled ?? false);
        setDelayMinutes(data.alimtalkDelayMinutes ?? 30);
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err);
      setError('설정을 불러오는데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Save settings
  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/api/review-automation/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          benefitText,
          alimtalkDelayEnabled: delayEnabled,
          alimtalkDelayMinutes: delayMinutes,
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

      <div className="max-w-5xl mx-auto">
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
            <div>
              <h1 className="text-2xl font-semibold text-neutral-900">
                리뷰 안내 문구 설정
              </h1>
              <p className="text-neutral-500 mt-1">
                포인트 적립 알림톡에 포함될 리뷰 안내 문구를 설정하세요.
              </p>
            </div>

            {/* Info Card */}
            <Card className="p-4 bg-blue-50 border-blue-200">
              <div className="flex gap-3">
                <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-800">
                  포인트 적립 시 발송되는 알림톡에 리뷰 안내 문구가 함께 표시됩니다.
                </p>
              </div>
            </Card>

            {/* Benefit Text Input */}
            <Card className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-neutral-700 block mb-1">
                    리뷰 이벤트 상품 (혜택 내용)
                  </label>
                  <textarea
                    value={benefitText}
                    onChange={(e) => setBenefitText(e.target.value)}
                    placeholder="예: 🍤 네이버 리뷰 작성시 새우 튀김 18cm (8,000원 상당) 즉시 제공!"
                    className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                    rows={4}
                  />
                  <p className="text-sm text-neutral-500 mt-2">
                    입력하지 않으면 기본 문구 &quot;진심을 담은 리뷰는 매장에 큰 도움이 됩니다 :)&quot;가 표시됩니다.
                  </p>
                </div>
              </div>
            </Card>

            {/* Delay Settings */}
            <Card className="p-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-neutral-500" />
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-neutral-900">
                      알림톡 지연 발송
                    </h3>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      적립/리뷰 알림톡을 설정한 시간 후에 발송합니다
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={delayEnabled}
                    onClick={() => setDelayEnabled(!delayEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      delayEnabled ? 'bg-brand-800' : 'bg-neutral-200'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        delayEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {delayEnabled && (
                  <div className="space-y-3 pt-2 border-t border-neutral-100">
                    <Card className="p-3 bg-amber-50 border-amber-200">
                      <p className="text-xs text-amber-800">
                        고객이 포인트/스탬프를 적립한 후, 설정한 시간이 지나면 알림톡이 발송됩니다.
                        식사 후 결제 시점에 리뷰를 요청하고 싶을 때 유용합니다.
                      </p>
                    </Card>

                    <div>
                      <label className="text-sm font-medium text-neutral-700 block mb-2">
                        발송 지연 시간
                      </label>
                      <select
                        value={delayMinutes}
                        onChange={(e) => setDelayMinutes(Number(e.target.value))}
                        className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        {Array.from({ length: 12 }, (_, i) => (i + 1) * 10).map((min) => (
                          <option key={min} value={min}>
                            {min}분 후 발송
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* Save Button */}
            <Card className="p-6">
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="w-full h-12 text-base"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                저장하기
              </Button>
            </Card>
          </div>

          {/* Right: Phone Preview */}
          <div className="lg:col-span-1">
            <p className="text-center text-neutral-500 mb-4">포인트 적립 알림톡 미리보기</p>
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
                              {/* Coin image header */}
                              <div className="border-b border-neutral-200">
                                <img
                                  src="/images/point-complete.png"
                                  alt="포인트 적립"
                                  className="w-full"
                                />
                              </div>

                              {/* Message body */}
                              <div className="px-4 py-4">
                                <p className="text-xs text-neutral-700 mb-4">
                                  [포인트 사용]<br />
                                  이용해주셔서 감사합니다.
                                </p>

                                <div className="space-y-1 mb-4">
                                  <p className="text-xs text-neutral-700">
                                    📌 매장명: {settings.storeName || '철길부산집'}
                                  </p>
                                  <p className="text-xs text-neutral-700">
                                    📌 적립포인트: 550 P
                                  </p>
                                  <p className="text-xs text-neutral-700">
                                    📌 잔여포인트: 3,200 P
                                  </p>
                                </div>

                                <div className="mb-4">
                                  <p className="text-xs text-neutral-700 mb-1">
                                    🎁 네이버 리뷰를 작성해주세요.
                                  </p>
                                  <p className="text-xs text-neutral-700 whitespace-pre-wrap">
                                    📌 {benefitText || '[리뷰 작성시 혜택이나 매장 공지사항을 작성해주세요.]'}
                                  </p>
                                </div>

                                {/* 네이버 리뷰 작성 버튼 */}
                                <button className="w-full py-2.5 bg-white text-neutral-800 text-xs font-medium rounded border border-neutral-300">
                                  네이버 리뷰 작성
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
    </div>
  );
}
