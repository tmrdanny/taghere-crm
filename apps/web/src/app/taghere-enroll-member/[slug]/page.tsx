'use client';

import { API_BASE } from '@/lib/api-config';
import { Suspense, useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { trackEvent, setUserId } from '@/lib/analytics';
import { getStoredKakaoId, saveKakaoId, removeStoredKakaoId } from '@/features/enroll/kakao-storage';
import { SuccessPopup } from '@/features/enroll/SuccessPopup';
import type { VisitSourceOption, SurveyQuestion } from '@/features/enroll/types';

interface OrderInfo {
  storeId: string;
  storeName: string;
  ordersheetId?: string;
  resultPrice?: number;
}

interface SuccessData {
  storeName: string;
  customerId: string;
  hasExistingPreferences: boolean;
  hasVisitSource?: boolean;
}

interface MembershipCoupon {
  id: string;
  brandName: string;
  imageUrl: string;
  couponName: string;
  couponContent: string;
  couponAmount: string;
  amountValue: number;
  expiryDate: string;
}

// ============================================
// 쿠폰 다운로드 하단 시트
// ============================================
function CouponBottomSheet({
  coupons,
  customerId,
  onAllDownloaded,
  onClose,
}: {
  coupons: MembershipCoupon[];
  customerId: string;
  onAllDownloaded: () => void;
  onClose: () => void;
}) {
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [isBatchSending, setIsBatchSending] = useState(false);

  // 이미 발송된 쿠폰 조회
  useEffect(() => {
    if (!customerId) return;
    fetch(`${API_BASE}/api/membership/coupons/sent/${customerId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.sentCouponIds) {
          setDownloadedIds(new Set(data.sentCouponIds));
        }
      })
      .catch(() => {});
  }, [customerId]);

  const sendCoupons = async (couponIds: string[], method: 'single' | 'all') => {
    if (couponIds.length === 0) return;
    const res = await fetch(`${API_BASE}/api/membership/coupons/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId, couponIds }),
    });
    if (res.ok) {
      const data = await res.json();
      const newDownloaded = new Set(downloadedIds);
      [...(data.sent || []), ...(data.skipped || [])].forEach((id: string) => newDownloaded.add(id));
      setDownloadedIds(newDownloaded);
      trackEvent('coupon_download', { method, count: couponIds.length });
    }
  };

  const handleSingleDownload = async (couponId: string) => {
    if (downloadedIds.has(couponId) || loadingIds.has(couponId)) return;
    setLoadingIds((s) => new Set(s).add(couponId));
    try {
      await sendCoupons([couponId], 'single');
    } finally {
      setLoadingIds((s) => {
        const next = new Set(s);
        next.delete(couponId);
        return next;
      });
    }
  };

  const handleDownloadAll = async () => {
    const remaining = coupons.filter((c) => !downloadedIds.has(c.id)).map((c) => c.id);
    if (remaining.length === 0) {
      onAllDownloaded();
      return;
    }
    setIsBatchSending(true);
    try {
      await sendCoupons(remaining, 'all');
    } finally {
      setIsBatchSending(false);
    }
  };

  const allDownloaded = coupons.length > 0 && coupons.every((c) => downloadedIds.has(c.id));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* 백드롭 */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* 시트 */}
      <div className="relative w-full max-w-[430px] bg-white rounded-t-3xl shadow-2xl coupon-sheet-slide-up">
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <h2 className="text-[18px] font-bold text-[#1d2022]">쿠폰 혜택</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500"
            aria-label="닫기"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 쿠폰 리스트 */}
        <div className="px-5 space-y-2 max-h-[50vh] overflow-y-auto">
          {coupons.map((coupon) => {
            const isDownloaded = downloadedIds.has(coupon.id);
            const isLoading = loadingIds.has(coupon.id);

            return (
              <div
                key={coupon.id}
                className="flex items-center gap-3 p-3 border border-neutral-200 rounded-xl"
              >
                {/* 브랜드 아이콘 */}
                <div className="w-11 h-11 rounded-full overflow-hidden bg-neutral-100 flex-shrink-0">
                  {coupon.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coupon.imageUrl} alt={coupon.brandName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-neutral-300 text-[10px]">
                      {coupon.brandName.charAt(0) || '?'}
                    </div>
                  )}
                </div>

                {/* 쿠폰명 / 만료일 */}
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium text-[#1d2022] truncate">
                    {coupon.couponName || coupon.brandName}
                  </p>
                  {coupon.expiryDate && (
                    <p className="text-[12px] text-neutral-400 mt-0.5">{coupon.expiryDate} 까지</p>
                  )}
                </div>

                {/* 다운로드 아이콘 */}
                <button
                  onClick={() => handleSingleDownload(coupon.id)}
                  disabled={isDownloaded || isLoading}
                  className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                    isDownloaded
                      ? 'bg-[#FFD541] text-[#1d2022]'
                      : 'bg-neutral-900 text-white hover:bg-neutral-800'
                  } disabled:opacity-60`}
                  aria-label={isDownloaded ? '다운로드 완료' : '쿠폰 다운로드'}
                >
                  {isLoading ? (
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : isDownloaded ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                    </svg>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* 안내 */}
        <p className="px-5 pt-3 text-center text-[12px] text-neutral-400">
          *쿠폰은 입력하신 번호로 알림톡이 전송됩니다
        </p>

        {/* CTA */}
        <div className="px-5 pt-3 pb-8">
          <button
            onClick={allDownloaded ? onAllDownloaded : handleDownloadAll}
            disabled={isBatchSending}
            className="w-full py-4 bg-[#FFD541] hover:bg-[#FFCA00] text-[#1d2022] font-semibold text-base rounded-[10px] transition-colors disabled:opacity-60"
          >
            {isBatchSending ? '발송 중...' : allDownloaded ? '확인' : '쿠폰 전체 다운받기'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TaghereMemberEnrollContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const [orderInfo, setOrderInfo] = useState<OrderInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAlreadyRegistered, setShowAlreadyRegistered] = useState(false);
  const [successData, setSuccessData] = useState<SuccessData | null>(null);
  const [isAgreed, setIsAgreed] = useState(false);
  const [showAgreementWarning, setShowAgreementWarning] = useState(false);
  const [isAutoEarning, setIsAutoEarning] = useState(false);
  const autoEarnAttemptedRef = useRef(false);
  const [visitSourceOptions, setVisitSourceOptions] = useState<VisitSourceOption[]>([]);
  const [visitSourceEnabled, setVisitSourceEnabled] = useState(false);
  const [surveyQuestions, setSurveyQuestions] = useState<SurveyQuestion[]>([]);
  const [coupons, setCoupons] = useState<MembershipCoupon[]>([]);
  const [showCouponSheet, setShowCouponSheet] = useState(false);
  const [proceedToNext, setProceedToNext] = useState(false);

  const slug = params.slug as string;
  const rawOrderId = searchParams.get('ordersheetId') || searchParams.get('orderId');
  const ordersheetId = rawOrderId && /^\{.+\}$/.test(rawOrderId) ? null : rawOrderId;
  const orderParamName = searchParams.get('orderId') ? 'orderId' : 'ordersheetId';
  const urlError = searchParams.get('error');

  // Success params from redirect
  const successMode = searchParams.get('mode');
  const successStoreName = searchParams.get('successStoreName');
  const customerId = searchParams.get('customerId');
  const urlKakaoId = searchParams.get('kakaoId');
  const hasPreferences = searchParams.get('hasPreferences') === 'true';
  const hasVisitSourceParam = searchParams.get('hasVisitSource') === 'true';
  const showCouponSheetParam = searchParams.get('showCouponSheet') === 'true';

  // customerId는 URL 파라미터가 기본이지만, auto-earn(재방문 자동등록) 경로는
  // URL에 안 담기고 successData에만 담기므로 그쪽으로 폴백한다.
  const resolvedCustomerId = customerId ?? successData?.customerId ?? null;

  // 같은 이벤트가 mount당 한 번만 발사되도록 보장 (StrictMode/effect 재실행 대비)
  const trackedEventsRef = useRef<Set<string>>(new Set());
  const trackOnce = (name: string, params: Record<string, unknown>) => {
    if (trackedEventsRef.current.has(name)) return;
    trackedEventsRef.current.add(name);
    trackEvent(name, params);
  };

  // 자동 등록 시도 함수
  const attemptAutoEarn = async (kakaoId: string, orderData: OrderInfo) => {
    setIsAutoEarning(true);

    try {
      const res = await fetch(`${API_BASE}/api/taghere/auto-earn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kakaoId,
          ordersheetId: orderData.ordersheetId,
          slug,
          mode: 'membership',
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSuccessData({
          storeName: data.storeName,
          customerId: data.customerId,
          hasExistingPreferences: data.hasExistingPreferences || false,
          hasVisitSource: data.hasVisitSource || false,
        });
        // 멤버십 모드 + showCouponSheet 응답 → 쿠폰 시트 우선 표시
        if (data.mode === 'membership' && data.showCouponSheet) {
          setShowCouponSheet(true);
        }
        setOrderInfo(null);
        setUserId(data.customerId);
        trackOnce('earn_success', { flow_type: 'membership', store_slug: slug, is_auto_earned: true });
      } else {
        if (data.error === 'invalid_kakao_id') {
          removeStoredKakaoId();
        } else if (data.error === 'already_earned') {
          setShowAlreadyRegistered(true);
          setOrderInfo(null);
          trackOnce('earn_fail', { flow_type: 'membership', store_slug: slug, reason: 'already_earned' });
        }
      }
    } catch (e) {
      console.error('Auto-earn failed:', e);
    } finally {
      setIsAutoEarning(false);
    }
  };

  // 쿠폰 리스트 조회
  useEffect(() => {
    const fetchCoupons = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/membership/coupons`);
        if (res.ok) {
          const data = await res.json();
          setCoupons(data.coupons || []);
        }
      } catch (e) {
        console.error('Failed to fetch coupons:', e);
      }
    };
    fetchCoupons();
  }, []);

  // showCouponSheet=true 파라미터 감지 시 시트 자동 오픈
  useEffect(() => {
    if (showCouponSheetParam && resolvedCustomerId) {
      setShowCouponSheet(true);
    }
  }, [showCouponSheetParam, resolvedCustomerId]);

  // 방문 경로 옵션 + 설문 조회
  useEffect(() => {
    const fetchVisitSourceOptions = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/taghere/visit-source-options/${slug}`);
        if (res.ok) {
          const data = await res.json();
          setVisitSourceEnabled(data.enabled);
          setVisitSourceOptions(data.options || []);
        }
      } catch (e) {
        console.error('Failed to fetch visit source options:', e);
      }
    };

    const fetchSurveyQuestions = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/taghere/survey-questions/${slug}`);
        if (res.ok) {
          const data = await res.json();
          setSurveyQuestions(data.questions || data);
        }
      } catch (e) {
        console.error('Failed to fetch survey questions:', e);
      }
    };

    if (slug) {
      fetchVisitSourceOptions();
      fetchSurveyQuestions();
    }
  }, [slug]);

  useEffect(() => {
    console.log('[TagHere Member Enroll] URL params:', {
      successMode,
      customerId,
      urlKakaoId,
      urlError,
      ordersheetId,
    });

    // 카카오 로그인 성공 후 리다이렉트
    if (successMode === 'membership' && customerId) {
      if (urlKakaoId) {
        console.log('[TagHere Member Enroll] Saving kakaoId to localStorage:', urlKakaoId);
        saveKakaoId(urlKakaoId);
      }

      setSuccessData({
        storeName: successStoreName || '태그히어',
        customerId,
        hasExistingPreferences: hasPreferences,
        hasVisitSource: hasVisitSourceParam,
      });
      setUserId(customerId);
      trackOnce('earn_success', { flow_type: 'membership', store_slug: slug, is_auto_earned: false });
      setIsLoading(false);
      return;
    }

    if (urlError === 'already_participated') {
      setShowAlreadyRegistered(true);
      trackOnce('earn_fail', { flow_type: 'membership', store_slug: slug, reason: 'already_earned' });
      setIsLoading(false);
      return;
    } else if (urlError) {
      setError('로그인에 실패했습니다. 다시 시도해주세요.');
      setIsLoading(false);
      return;
    }

    const fetchOrderInfo = async () => {
      try {

        if (ordersheetId) {
          // ordersheetId가 있으면 주문 정보와 함께 조회
          const res = await fetch(`${API_BASE}/api/taghere/ordersheet?ordersheetId=${ordersheetId}&slug=${slug}&mode=membership`);
          if (res.ok) {
            const data = await res.json();

            if (data.alreadyEarned) {
              setShowAlreadyRegistered(true);
              setIsLoading(false);
              trackOnce('earn_fail', { flow_type: 'membership', store_slug: slug, reason: 'already_earned' });
            } else {
              // 자동 등록 시도
              let shouldAutoEarn = false;
              let storedKakaoId: string | null = null;

              if (!autoEarnAttemptedRef.current) {
                autoEarnAttemptedRef.current = true;
                storedKakaoId = getStoredKakaoId();
                if (storedKakaoId) {
                  shouldAutoEarn = true;
                  setIsAutoEarning(true);
                }
              }

              setOrderInfo(data);
              setIsLoading(false);

              if (shouldAutoEarn && storedKakaoId) {
                attemptAutoEarn(storedKakaoId, data);
              }
            }
            return;
          } else if (res.status === 404) {
            const errorData = await res.json().catch(() => ({}));
            if (errorData.error === 'Store not found') {
              setError('존재하지 않는 매장입니다.');
              setIsLoading(false);
              return;
            }
            // 주문 정보를 못 찾은 경우 → 매장 정보만으로 진행
          } else {
            const errorData = await res.json();
            setError(errorData.error || '정보를 불러오는데 실패했습니다.');
            setIsLoading(false);
            return;
          }
        }

        // ordersheetId 없거나 주문 조회 실패 → 매장 정보만으로 멤버십 등록
        const storeRes = await fetch(`${API_BASE}/api/stores/by-slug/${slug}`);
        if (storeRes.ok) {
          const storeData = await storeRes.json();

          let shouldAutoEarn = false;
          let storedKakaoId: string | null = null;

          if (!autoEarnAttemptedRef.current) {
            autoEarnAttemptedRef.current = true;
            storedKakaoId = getStoredKakaoId();
            if (storedKakaoId) {
              shouldAutoEarn = true;
              setIsAutoEarning(true);
            }
          }

          const info: OrderInfo = {
            storeId: storeData.id,
            storeName: storeData.name,
          };
          setOrderInfo(info);
          setIsLoading(false);

          if (shouldAutoEarn && storedKakaoId) {
            attemptAutoEarn(storedKakaoId, info);
          }
        } else if (storeRes.status === 404) {
          setError('존재하지 않는 매장입니다.');
          setIsLoading(false);
        } else {
          setError('매장 정보를 불러오는데 실패했습니다.');
          setIsLoading(false);
        }
      } catch (e) {
        console.error('Failed to fetch order info:', e);
        setError('정보를 불러오는데 실패했습니다.');
        setIsLoading(false);
      }
    };

    fetchOrderInfo();
  }, [slug, ordersheetId, urlError, successMode, customerId, successStoreName, urlKakaoId]);

  // 멤버십 플로우 최초 진입(start). 카카오 로그인 복귀(successMode/urlError)는 진입으로 치지 않는다.
  useEffect(() => {
    if (slug && ordersheetId && !successMode && !urlError) {
      trackOnce('earn_flow_start', { flow_type: 'membership', store_slug: slug });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const handleOpenGift = () => {
    if (!orderInfo) return;

    setIsOpening(true);

    setTimeout(() => {
      const redirectUri = `${API_BASE}/auth/kakao/taghere-callback`;

      const stateData = {
        storeId: orderInfo.storeId,
        slug,
        ordersheetId: ordersheetId || '',
        isTaghere: true,
        isStamp: false,
        isMembership: true,
        origin: window.location.origin,
      };
      const state = btoa(JSON.stringify(stateData));

      trackEvent('kakao_auth_start', { flow_type: 'membership', store_slug: slug });
      if (typeof window !== 'undefined' && window.Kakao && window.Kakao.isInitialized()) {
        window.Kakao.Auth.authorize({
          redirectUri,
          state,
          scope: 'profile_nickname,account_email,phone_number,gender,birthday,birthyear',
        });
      } else {
        const params = new URLSearchParams();
        params.set('storeId', orderInfo.storeId);
        params.set('slug', slug);
        if (ordersheetId) params.set(orderParamName, ordersheetId);
        params.set('origin', window.location.origin);
        params.set('isMembership', 'true');
        window.location.href = `${API_BASE}/auth/kakao/taghere-start?${params.toString()}`;
      }
    }, 500);
  };

  const handleCloseSuccessPopup = () => {
    setSuccessData(null);

    const url = new URL(window.location.origin + '/taghere-enroll-member/order-success');
    if (ordersheetId) url.searchParams.set(orderParamName, ordersheetId);
    url.searchParams.set('slug', slug);
    url.searchParams.set('type', 'membership');
    window.location.href = url.toString();
  };

  if (isLoading || isAutoEarning) {
    return (
      <div className="h-[100dvh] bg-neutral-100 font-pretendard flex justify-center overflow-hidden">
        <div className="w-full max-w-md h-full flex flex-col items-center justify-center bg-white gap-4">
          <div className="w-8 h-8 border-2 border-[#FFD541] border-t-transparent rounded-full animate-spin" />
          {isAutoEarning && (
            <p className="text-sm text-neutral-500">자동으로 멤버십 등록 중...</p>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-[100dvh] bg-neutral-100 font-pretendard flex justify-center overflow-hidden">
        <div className="w-full max-w-md h-full flex flex-col items-center justify-center bg-white p-6">
          <div className="text-5xl mb-4">😢</div>
          <h1 className="text-lg font-semibold text-neutral-900 mb-2">오류가 발생했습니다</h1>
          <p className="text-neutral-500 text-sm mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 bg-[#FFD541] text-neutral-900 font-semibold rounded-xl text-sm"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  // X 버튼 클릭 시 주문완료 페이지로 이동
  const handleSkipEarn = () => {
    const url = new URL(window.location.origin + '/taghere-enroll-member/order-success');
    if (ordersheetId) url.searchParams.set(orderParamName, ordersheetId);
    url.searchParams.set('slug', slug);
    url.searchParams.set('type', 'membership');
    window.location.href = url.toString();
  };

  return (
    <>
      {/* 쿠폰 시트가 열려있으면 시트 우선 표시 */}
      {showCouponSheet && resolvedCustomerId ? (
        <>
          {/* 배경: 멤버십 첫 화면 그대로 보여서 자연스러운 느낌 */}
          <div className="h-[100dvh] bg-neutral-100 font-pretendard flex justify-center overflow-hidden">
            <div className="w-full max-w-[430px] h-full flex flex-col bg-white relative">
              <div className="flex-shrink-0 pt-12 pb-2">
                <div className="text-center px-5">
                  <p className="text-[25px] font-bold text-[#1d2022] leading-[130%] tracking-[-0.6px]">
                    최대{' '}
                    <span className="text-[#6BA3FF]">
                      {coupons.reduce((sum, c) => sum + (c.amountValue || 0), 0).toLocaleString()}원
                    </span>
                    <br />
                    쿠폰이 도착했어요
                  </p>
                </div>
              </div>
              <div className="flex-1 min-h-0 flex items-center justify-center px-8 py-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/7-money.webp"
                  alt="쿠폰 받기"
                  className="taghere-brand-image w-auto h-full max-w-[280px] max-h-full object-contain opacity-50"
                />
              </div>
            </div>
          </div>
          <CouponBottomSheet
            coupons={coupons}
            customerId={resolvedCustomerId}
            onAllDownloaded={() => {
              setShowCouponSheet(false);
              setProceedToNext(true);
              if (!successData) {
                setSuccessData({
                  storeName: successStoreName || '태그히어',
                  customerId: resolvedCustomerId,
                  hasExistingPreferences: hasPreferences,
                  hasVisitSource: hasVisitSourceParam,
                });
              }
            }}
            onClose={() => setShowCouponSheet(false)}
          />
        </>
      ) : proceedToNext && successData ? (
        <SuccessPopup
          successData={successData}
          onClose={handleCloseSuccessPopup}
          visitSourceOptions={visitSourceOptions}
          visitSourceEnabled={visitSourceEnabled}
          surveyQuestions={surveyQuestions}
          storeSlug={slug}
          flowType="membership"
          header={
            <>
              {/* Membership Success Display */}
              <div className="text-center mb-4 mt-4">
                <p className="text-[24px] font-bold text-[#6BA3FF] leading-tight">
                  알림톡으로 쿠폰을 보내드렸어요
                </p>
              </div>

              {/* Main Message */}
              <div className="text-center mb-5">
                <h2 className="text-[18px] font-bold text-neutral-900 mb-1">
                  매장 경험에 대한 솔직한 피드백을 남겨주세요.
                </h2>
                <p className="text-[14px] text-neutral-400">
                  소중한 의견은 큰 도움이 돼요
                </p>
              </div>
            </>
          }
        />
      ) : (
        <div className="h-[100dvh] bg-neutral-100 font-pretendard flex justify-center overflow-hidden">
          <div className="w-full max-w-[430px] h-full flex flex-col bg-white relative">
            {/* 우측 상단 X 버튼 */}
            <button
              onClick={handleSkipEarn}
              className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-neutral-600 transition-colors z-10"
              aria-label="건너뛰기"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Title - 상단 영역 */}
            <div className="flex-shrink-0 pt-12 pb-2">
              <div className="text-center px-5">
                <p className="text-[25px] font-bold text-[#1d2022] leading-[130%] tracking-[-0.6px]">
                  최대{' '}
                  <span className="text-[#6BA3FF]">
                    {coupons.reduce((sum, c) => sum + (c.amountValue || 0), 0).toLocaleString()}원
                  </span>
                  <br />
                  쿠폰이 도착했어요
                </p>
              </div>
            </div>

            {/* Brands Image - 중앙 영역 (남은 공간 모두 차지하지만 CTA는 절대 안 잘림) */}
            <div className="flex-1 min-h-0 flex items-center justify-center px-8 py-2">
              <div
                className={`taghere-brands-wrapper h-full flex items-center justify-center ${isOpening ? 'opening' : ''}`}
                onClick={() => {
                  trackEvent('earn_cta_click', { flow_type: 'membership', store_slug: slug, agreed: isAgreed });
                  if (!isAgreed) {
                    setShowAgreementWarning(true);
                    return;
                  }
                  if (isOpening) return;
                  if (resolvedCustomerId) {
                    setShowCouponSheet(true);
                  } else {
                    handleOpenGift();
                  }
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/7-money.webp"
                  alt="멤버십 가입"
                  className="taghere-brand-image w-auto h-full max-w-[280px] max-h-full object-contain"
                />
              </div>
            </div>

            {/* 하단 고정 영역 - 체크박스 + CTA */}
            <div className="flex-shrink-0 flex flex-col px-5 pb-6">
              {/* 주문 접수 완료 안내 */}
              <p className="text-center text-[13px] text-neutral-400 mb-3">주문이 접수되었어요</p>
              {/* 동의 안내 영역 */}
              <div
                className={`rounded-[12px] mb-4 p-4 transition-colors ${
                  showAgreementWarning && !isAgreed ? 'bg-[#fff0f3] border border-[#ffb3c1]' : 'bg-[#f8f9fa]'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-start gap-1">
                    <p className="text-[14px] font-medium leading-[140%] text-[#55595e]">
                      쿠폰을 받기 위해 전국 매장 혜택 수신 동의가 필요해요.
                    </p>
                    <span className="text-[#ff6b6b] text-[14px]">*</span>
                  </div>
                  <a
                    href="https://tmr-founders.notion.site/2492217234e380e1abbbe6867fc96aea?source=copy_link"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 p-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <svg className="w-5 h-5 text-[#b1b5b8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </a>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsAgreed(!isAgreed);
                    setShowAgreementWarning(false);
                  }}
                  className="flex items-center gap-2.5"
                >
                  <div className={`w-[20px] h-[20px] border-2 rounded flex items-center justify-center transition-colors flex-shrink-0 ${
                    isAgreed ? 'bg-[#FFD541] border-[#FFD541]' : showAgreementWarning && !isAgreed ? 'border-[#ffb3c1] bg-white' : 'border-[#d1d5db] bg-white'
                  }`}>
                    {isAgreed && (
                      <svg className="w-3 h-3 text-[#1d2022]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className={`text-[14px] ${showAgreementWarning && !isAgreed ? 'text-[#ff6b6b]' : 'text-[#55595e]'}`}>
                    네, 동의합니다
                  </span>
                </button>
              </div>

              <button
                onClick={() => {
                  trackEvent('earn_cta_click', { flow_type: 'membership', store_slug: slug, agreed: isAgreed });
                  if (!isAgreed) {
                    setShowAgreementWarning(true);
                    return;
                  }
                  if (resolvedCustomerId) {
                    setShowCouponSheet(true);
                  } else {
                    handleOpenGift();
                  }
                }}
                disabled={isOpening}
                className="w-full py-4 font-semibold text-base rounded-[10px] transition-colors bg-[#FFD541] hover:bg-[#FFCA00] text-[#1d2022]"
              >
                {isOpening ? '가입 중...' : resolvedCustomerId ? '쿠폰 다시 보기' : '쿠폰 다운받기'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Already Registered Popup */}
      {showAlreadyRegistered && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-2xl p-6 w-full max-w-xs text-center shadow-xl">
            <div className="text-4xl mb-4">🎁</div>
            <h2 className="text-lg font-bold text-neutral-900 mb-2">
              이미 등록이 완료되었어요
            </h2>
            <p className="text-sm text-neutral-500 mb-5">
              이 주문에 대한 멤버십 등록이 이미 완료되었습니다.
            </p>
            <button
              onClick={() => {
                const url = new URL(window.location.origin + '/taghere-enroll-member/order-success');
                if (ordersheetId) url.searchParams.set(orderParamName, ordersheetId);
                url.searchParams.set('slug', slug);
                url.searchParams.set('type', 'membership');
                window.location.href = url.toString();
              }}
              className="w-full py-3 bg-[#FFD541] hover:bg-[#FFCA00] text-neutral-900 font-semibold text-base rounded-xl transition-colors"
            >
              확인
            </button>
          </div>
        </div>
      )}

      <style jsx global>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-jp.min.css');

        .font-pretendard {
          font-family: 'Pretendard JP Variable', 'Pretendard JP', -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif;
        }

        .taghere-brands-wrapper {
          cursor: pointer;
          animation: gentleFloat 3s ease-in-out infinite;
        }
        .taghere-brands-wrapper.opening {
          animation: boxOpen 0.6s ease-out forwards;
        }
        @keyframes gentleFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes boxOpen {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.05); opacity: 1; }
          100% { transform: scale(0.9); opacity: 0.5; }
        }

        .coupon-sheet-slide-up {
          animation: couponSheetSlideUp 0.3s ease-out;
        }
        @keyframes couponSheetSlideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }

        video,
        .taghere-brand-image {
          mix-blend-mode: multiply;
        }
      `}</style>
    </>
  );
}

export default function TaghereMemberEnrollPage() {
  return (
    <Suspense fallback={
      <div className="h-[100dvh] bg-neutral-100 flex justify-center overflow-hidden">
        <div className="w-full max-w-md h-full flex items-center justify-center bg-white">
          <div className="w-8 h-8 border-2 border-[#FFD541] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    }>
      <TaghereMemberEnrollContent />
    </Suspense>
  );
}
