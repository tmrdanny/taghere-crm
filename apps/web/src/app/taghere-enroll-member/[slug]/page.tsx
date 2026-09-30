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

  const [sendError, setSendError] = useState(false);

  // 발송 성공(sent) 또는 이미 받은(skipped) 쿠폰을 받은 것으로 표시. 실패가 있으면 false
  const sendCoupons = async (couponIds: string[], method: 'single' | 'all'): Promise<boolean> => {
    if (couponIds.length === 0) return true;
    setSendError(false);
    try {
      const res = await fetch(`${API_BASE}/api/membership/coupons/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, couponIds }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      const received: string[] = [...(data.sent || []), ...(data.skipped || [])];
      setDownloadedIds((prev) => {
        const next = new Set(prev);
        received.forEach((id) => next.add(id));
        return next;
      });
      trackEvent('coupon_download', { method, count: couponIds.length });
      const ok = (data.failed || []).length === 0;
      if (!ok) setSendError(true);
      return ok;
    } catch {
      setSendError(true);
      return false;
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

  // 한 번 탭으로 남은 쿠폰을 모두 받고, 성공하면 체크 표시를 잠깐 보여준 뒤 바로 다음 단계로 넘어간다
  const handleDownloadAll = async () => {
    const remaining = coupons.filter((c) => !downloadedIds.has(c.id)).map((c) => c.id);
    if (remaining.length === 0) {
      onAllDownloaded();
      return;
    }
    setIsBatchSending(true);
    const ok = await sendCoupons(remaining, 'all');
    if (ok) {
      setTimeout(onAllDownloaded, 700);
    } else {
      setIsBatchSending(false);
    }
  };

  const allDownloaded = coupons.length > 0 && coupons.every((c) => downloadedIds.has(c.id));
  const remainingCount = coupons.filter((c) => !downloadedIds.has(c.id)).length;
  const totalAmount = coupons.reduce((sum, c) => sum + (c.amountValue || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* 백드롭 — 실수로 탭해도 쿠폰을 놓치지 않도록 닫기는 X 버튼으로만 */}
      <div className="absolute inset-0 bg-black/40" />

      {/* 시트 */}
      <div className="relative w-full max-w-[430px] bg-white rounded-t-3xl shadow-2xl coupon-sheet-slide-up">
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <div>
            <h2 className="text-[18px] font-bold text-[#1d2022]">쿠폰 혜택</h2>
            <p className="text-[13px] text-neutral-400 mt-0.5">
              {coupons.length}장{totalAmount > 0 ? ` · 총 ${totalAmount.toLocaleString()}원` : ''}
            </p>
          </div>
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
          {coupons.map((coupon, index) => {
            const isDownloaded = downloadedIds.has(coupon.id);
            const isLoading = loadingIds.has(coupon.id) || (isBatchSending && !isDownloaded);

            return (
              <div
                key={coupon.id}
                className={`coupon-row flex items-center gap-3 p-3 border rounded-xl transition-colors duration-300 ${
                  isDownloaded ? 'border-[#FFD541] bg-[#FFFBEA]' : 'border-neutral-200'
                }`}
                style={{ animationDelay: `${index * 60}ms` }}
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
                  <p className="text-[12px] text-neutral-400 mt-0.5 truncate">
                    {[coupon.couponAmount, coupon.expiryDate && `${coupon.expiryDate} 까지`].filter(Boolean).join(' · ')}
                  </p>
                </div>

                {/* 다운로드 아이콘 */}
                <button
                  onClick={() => handleSingleDownload(coupon.id)}
                  disabled={isDownloaded || isLoading}
                  className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-[background-color,transform] duration-300 active:scale-90 ${
                    isDownloaded
                      ? 'bg-[#FFD541] text-[#1d2022] coupon-check-pop'
                      : 'bg-neutral-900 text-white hover:bg-neutral-800'
                  } ${isLoading ? 'opacity-60' : ''}`}
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

        {/* 안내 / 오류 */}
        {sendError ? (
          <p className="px-5 pt-3 text-center text-[12px] text-[#ff6b6b]" role="alert">
            쿠폰을 보내지 못했어요. 아래 버튼을 다시 눌러주세요.
          </p>
        ) : (
          <p className="px-5 pt-3 text-center text-[12px] text-neutral-400">
            쿠폰은 카카오 계정의 번호로 알림톡이 전송돼요
          </p>
        )}

        {/* CTA — 한 번 탭으로 전부 받고 다음 단계로 */}
        <div className="px-5 pt-3 pb-[max(2rem,env(safe-area-inset-bottom))]">
          <button
            onClick={handleDownloadAll}
            disabled={isBatchSending}
            className="w-full py-4 bg-[#FFD541] hover:bg-[#FFCA00] text-[#1d2022] font-semibold text-base rounded-[10px] transition-[background-color,transform] active:scale-[0.98] disabled:opacity-80"
          >
            {isBatchSending
              ? allDownloaded
                ? '받기 완료'
                : '쿠폰 보내는 중...'
              : allDownloaded
                ? '다음'
                : remainingCount === coupons.length
                  ? `쿠폰 ${coupons.length}장 한 번에 받기`
                  : `남은 쿠폰 ${remainingCount}장 받기`}
          </button>
        </div>
      </div>
    </div>
  );
}

const CONSENT_ITEMS = [
  {
    key: 'privacy',
    label: '개인정보 수집·이용 동의',
    href: 'https://tmr-founders.notion.site/26a2217234e3808389fbc84989029713?source=copy_link',
  },
  {
    key: 'partner',
    label: '제휴 브랜드 혜택 수신 동의',
    href: 'https://tmr-founders.notion.site/2de2217234e3807bbfa0db51b12a5e77?source=copy_link',
  },
] as const;

function TaghereMemberEnrollContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const [orderInfo, setOrderInfo] = useState<OrderInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAlreadyRegistered, setShowAlreadyRegistered] = useState(false);
  const [successData, setSuccessData] = useState<SuccessData | null>(null);
  // 필수 동의 2종 — 기본 체크 상태로 진입
  const [agreePrivacy, setAgreePrivacy] = useState(true);
  const [agreePartner, setAgreePartner] = useState(true);
  const isAgreed = agreePrivacy && agreePartner;
  const [showAgreementWarning, setShowAgreementWarning] = useState(false);
  const [isAutoEarning, setIsAutoEarning] = useState(false);
  const autoEarnAttemptedRef = useRef(false);
  const [visitSourceOptions, setVisitSourceOptions] = useState<VisitSourceOption[]>([]);
  const [visitSourceEnabled, setVisitSourceEnabled] = useState(false);
  const [surveyQuestions, setSurveyQuestions] = useState<SurveyQuestion[]>([]);
  const [coupons, setCoupons] = useState<MembershipCoupon[]>([]);
  const [showCouponSheet, setShowCouponSheet] = useState(false);
  const [proceedToNext, setProceedToNext] = useState(false);
  // 쿠폰 발급 플로우 진입 신호 (단일 기업이면 시트 없이 자동 발급)
  const [enterCouponFlow, setEnterCouponFlow] = useState(false);
  const [couponsLoaded, setCouponsLoaded] = useState(false);
  const autoIssueAttemptedRef = useRef(false);
  // 메뉴판 복귀 링크 — 나가기 시 즉시 이동할 수 있도록 미리 받아둔다
  const [menuLink, setMenuLink] = useState<string | null>(null);

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
        // 멤버십 모드 + showCouponSheet 응답 → 쿠폰 발급 플로우 진입
        if (data.mode === 'membership' && data.showCouponSheet) {
          setEnterCouponFlow(true);
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

  // 단일 기업 광고: 쿠폰 시트/추가 클릭 없이 쿠폰 1개를 즉시 발급하고 다음 단계로 진행
  const issueSingleCouponAndProceed = async (custId: string, coupon: MembershipCoupon) => {
    if (autoIssueAttemptedRef.current) return;
    autoIssueAttemptedRef.current = true;
    try {
      const apiUrl = API_BASE;
      await fetch(`${apiUrl}/api/membership/coupons/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: custId, couponIds: [coupon.id] }),
      });
      trackEvent('coupon_download', { method: 'auto_single', count: 1, store_slug: slug });
    } catch (e) {
      console.error('Auto coupon issue failed:', e);
    } finally {
      setShowCouponSheet(false);
      setProceedToNext(true);
      setSuccessData((prev) =>
        prev ?? {
          storeName: successStoreName || '태그히어',
          customerId: custId,
          hasExistingPreferences: hasPreferences,
          hasVisitSource: hasVisitSourceParam,
        }
      );
    }
  };

  // 쿠폰 리스트 조회
  // 메뉴판 복귀 링크 미리 조회 — 나가기 클릭 시 지연 없이 이동하기 위함.
  // 실패해도 조용히 넘어간다 (주문완료 페이지 폴백이 있으므로 등록 흐름을 막지 않음)
  useEffect(() => {
    if (!ordersheetId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/taghere/ordersheet?ordersheetId=${ordersheetId}&slug=${slug}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.menuLink) setMenuLink(data.menuLink);
      } catch {
        // 폴백 경로가 있으므로 무시
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ordersheetId, slug]);

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
      } finally {
        setCouponsLoaded(true);
      }
    };
    fetchCoupons();
  }, []);

  // showCouponSheet=true 파라미터 감지 → 쿠폰 발급 플로우 진입
  useEffect(() => {
    if (showCouponSheetParam && customerId) {
      setEnterCouponFlow(true);
    }
  }, [showCouponSheetParam, customerId]);

  // 쿠폰 발급 플로우 처리
  // - 단일 기업(쿠폰 1개): 시트 없이 즉시 발급 후 다음 단계로
  // - 복수 기업: 기존 쿠폰 시트 표시
  // - 광고 쿠폰 없음: 발급 없이 다음 단계로
  // 고객 ID 는 resolvedCustomerId — 재방문 자동등록(auto-earn)은 URL 에 customerId 가 없고 successData 에만 있다.
  useEffect(() => {
    if (!enterCouponFlow || !couponsLoaded) return;
    // 고객을 특정할 수 없으면 발급 없이 다음 단계로 (로딩에 갇히지 않게)
    if (!resolvedCustomerId || coupons.length === 0) {
      setProceedToNext(true);
    } else if (coupons.length === 1) {
      issueSingleCouponAndProceed(resolvedCustomerId, coupons[0]);
    } else {
      setShowCouponSheet(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enterCouponFlow, resolvedCustomerId, couponsLoaded, coupons]);

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

  // 나가기 공통 처리 — 메뉴판 링크가 있으면 바로 메뉴판, 없으면 주문완료 페이지로.
  // (손님이 어느 경로로 나가든 한 번의 동작으로 빠져나갈 수 있게 통일)
  const exitToMenu = () => {
    if (menuLink) {
      window.location.href = menuLink;
      return;
    }
    const url = new URL(window.location.origin + '/taghere-enroll-member/order-success');
    if (ordersheetId) url.searchParams.set(orderParamName, ordersheetId);
    url.searchParams.set('slug', slug);
    url.searchParams.set('type', 'membership');
    window.location.href = url.toString();
  };

  const handleCloseSuccessPopup = () => {
    setSuccessData(null);
    exitToMenu();
  };

  // 쿠폰 발급 플로우 진입 후 결정(자동 발급 / 시트)이 끝나기 전까지 로딩 표시
  const isResolvingCouponFlow = enterCouponFlow && !showCouponSheet && !proceedToNext;

  if (isLoading || isAutoEarning || isResolvingCouponFlow) {
    return (
      <div className="h-[100dvh] bg-neutral-100 font-pretendard flex justify-center overflow-hidden">
        <div className="w-full max-w-md h-full flex flex-col items-center justify-center bg-white gap-4">
          <div className="w-8 h-8 border-2 border-[#FFD541] border-t-transparent rounded-full animate-spin" />
          {isAutoEarning && (
            <p className="text-sm text-neutral-500">자동으로 멤버십 등록 중...</p>
          )}
          {isResolvingCouponFlow && !isAutoEarning && (
            <p className="text-sm text-neutral-500">쿠폰을 발급하고 있어요...</p>
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

  // X 버튼 클릭 시 메뉴판으로 (링크 없으면 주문완료 페이지)
  const handleSkipEarn = () => {
    exitToMenu();
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
            onClose={() => {
              // 쿠폰을 받지 않고 나가기 — 시트만 닫으면 빠져나갈 수 없는 화면에 갇힌다
              setShowCouponSheet(false);
              exitToMenu();
            }}
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
              {/* 동의 안내 영역 — 필수 2종, 기본 체크 */}
              <div
                className={`rounded-[12px] mb-4 px-4 py-3 space-y-1 transition-colors ${
                  showAgreementWarning && !isAgreed ? 'bg-[#fff0f3] border border-[#ffb3c1]' : 'bg-[#f8f9fa]'
                }`}
              >
                {CONSENT_ITEMS.map((item) => {
                  const checked = item.key === 'privacy' ? agreePrivacy : agreePartner;
                  const warn = showAgreementWarning && !checked;
                  return (
                    <div key={item.key} className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        onClick={() => {
                          if (item.key === 'privacy') setAgreePrivacy(!agreePrivacy);
                          else setAgreePartner(!agreePartner);
                          setShowAgreementWarning(false);
                        }}
                        className="flex items-center gap-2.5 py-1.5 min-w-0 text-left"
                      >
                        <div
                          className={`w-[20px] h-[20px] border-2 rounded flex items-center justify-center transition-colors flex-shrink-0 ${
                            checked ? 'bg-[#FFD541] border-[#FFD541]' : warn ? 'border-[#ffb3c1] bg-white' : 'border-[#d1d5db] bg-white'
                          }`}
                        >
                          {checked && (
                            <svg className="w-3 h-3 text-[#1d2022]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <span className={`text-[14px] leading-[140%] ${warn ? 'text-[#ff6b6b]' : 'text-[#55595e]'}`}>
                          {item.label} <span className="text-neutral-400">(필수)</span>
                        </span>
                      </button>
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 p-1"
                        aria-label={`${item.label} 전문 보기`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <svg className="w-5 h-5 text-[#b1b5b8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </a>
                    </div>
                  );
                })}
                {showAgreementWarning && !isAgreed && (
                  <p className="text-[12px] text-[#ff6b6b] pt-1">쿠폰을 받으려면 필수 항목에 동의해주세요.</p>
                )}
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
                className="w-full py-4 font-semibold text-base rounded-[10px] transition-[background-color,transform] active:scale-[0.98] bg-[#FFD541] hover:bg-[#FFCA00] text-[#1d2022]"
              >
                {isOpening ? '가입 중...' : resolvedCustomerId ? '쿠폰 다시 보기' : '동의하고 쿠폰 받기'}
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
              onClick={exitToMenu}
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

        .coupon-row {
          animation: couponRowIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        @keyframes couponRowIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .coupon-check-pop {
          animation: couponCheckPop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes couponCheckPop {
          0% { transform: scale(0.7); }
          100% { transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .coupon-row, .coupon-check-pop, .coupon-sheet-slide-up, .taghere-brands-wrapper { animation: none; }
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
