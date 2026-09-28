'use client';

import { API_BASE } from '@/lib/api-config';
import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  Info,
  ChevronLeft,
  Menu,
  Loader2,
  AlertCircle,
  Clock, X } from 'lucide-react';
import { IPhoneFrame } from '@/components/ui/iphone-frame';


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
        <Loader2 className="w-8 h-8 animate-spin text-[color:var(--ad-faint)]" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 sm:px-8 lg:pt-8">
      {/* Toast notification */}
      {ToastComponent}

      <div>
        {/* Error message */}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-[12px] bg-[#fff0f3] px-4 py-3 text-[13px] text-[color:var(--ad-neg)]">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto" aria-label="닫기">
              <X className="h-4 w-4" strokeWidth={1.8} />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Settings */}
          <div className="lg:col-span-2 space-y-4">
            {/* Header */}
            <div>
              <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-[color:var(--ad-ink)]">
                리뷰 안내 문구 설정
              </h1>
              <p className="mt-1 text-[13px] text-[color:var(--ad-muted)]">
                포인트 적립 알림톡에 포함될 리뷰 안내 문구를 설정하세요.
              </p>
            </div>

            {/* Info Card */}
            <div className="rounded-[12px] bg-[color:var(--ad-bg-alt)] px-4 py-3 text-[13px] text-[color:var(--ad-muted)]">
              <div className="flex gap-2.5">
                <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                <p>
                  포인트 적립 시 발송되는 알림톡에 리뷰 안내 문구가 함께 표시됩니다.
                </p>
              </div>
            </div>

            {/* Benefit Text Input */}
            <div className="ad-card p-5">
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">
                    리뷰 이벤트 상품 (혜택 내용)
                  </label>
                  <textarea
                    value={benefitText}
                    onChange={(e) => setBenefitText(e.target.value)}
                    placeholder="예: 🍤 네이버 리뷰 작성시 새우 튀김 18cm (8,000원 상당) 즉시 제공!"
                    className="flex min-h-[100px] w-full py-2.5 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                    rows={4}
                  />
                  <p className="mt-2 text-[12px] text-[color:var(--ad-faint)]">
                    입력하지 않으면 기본 문구 &quot;진심을 담은 리뷰는 매장에 큰 도움이 됩니다 :)&quot;가 표시됩니다.
                  </p>
                </div>
              </div>
            </div>

            {/* Delay Settings */}
            <div className="ad-card p-5">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                  <div className="flex-1">
                    <h3 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">
                      알림톡 지연 발송
                    </h3>
                    <p className="mt-0.5 text-[12px] text-[color:var(--ad-faint)]">
                      적립/리뷰 알림톡을 설정한 시간 후에 발송합니다
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={delayEnabled}
                    onClick={() => setDelayEnabled(!delayEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      delayEnabled ? 'bg-[color:var(--ad-ink)]' : 'bg-[color:var(--ad-line-strong)]'
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
                  <div className="space-y-3 pt-3 border-t border-[color:var(--ad-line)]">
                    <div className="flex gap-2.5 rounded-[12px] bg-[color:var(--ad-bg-alt)] px-4 py-3 text-[13px] text-[color:var(--ad-muted)]">
                      <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-[color:var(--ad-faint)]" strokeWidth={1.8} />
                      <p>
                        고객이 포인트/스탬프를 적립한 후, 설정한 시간이 지나면 알림톡이 발송됩니다.
                        식사 후 결제 시점에 리뷰를 요청하고 싶을 때 유용합니다.
                      </p>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-[13px] font-medium text-[color:var(--ad-ink-2)]">
                        발송 지연 시간
                      </label>
                      <select
                        value={delayMinutes}
                        onChange={(e) => setDelayMinutes(Number(e.target.value))}
                        className="w-full h-10 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none"
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
            </div>

            {/* Save Button */}
            <div>
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="ad-press inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-[12px] bg-[color:var(--ad-ink)] px-4 text-[13.5px] font-semibold text-white hover:bg-[#383c40] disabled:opacity-40"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                저장하기
              </Button>
            </div>
          </div>

          {/* Right: Phone Preview */}
          <div className="lg:col-span-1">
            <p className="mb-4 text-center text-[13px] text-[color:var(--ad-muted)]">포인트 적립 알림톡 미리보기</p>
            <div className="flex justify-center sticky top-24">
              {/* Phone Frame */}
              <IPhoneFrame screenClassName="bg-[#B2C7D9]">

                    {/* KakaoTalk header */}
                    <div className="flex items-center justify-between px-4 pt-1 pb-2">
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
              </IPhoneFrame>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
