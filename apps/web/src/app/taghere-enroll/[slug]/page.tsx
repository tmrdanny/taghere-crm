'use client';

import { API_BASE } from '@/lib/api-config';
import { Suspense, useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { formatNumber } from '@/lib/utils';
import { trackEvent, setUserId } from '@/lib/analytics';
import { getStoredKakaoId, saveKakaoId, removeStoredKakaoId } from '@/features/enroll/kakao-storage';
import { SuccessPopup } from '@/features/enroll/SuccessPopup';
import type { VisitSourceOption, SurveyQuestion } from '@/features/enroll/types';

interface OrderInfo {
  storeId: string;
  storeName: string;
  ordersheetId: string;
  resultPrice: number;
  ratePercent: number;
  earnPoints: number;
  alreadyEarned: boolean;
  /** 후불 + 결제완료 감지 가능 POS 주문 → 적립이 결제완료 시점으로 미뤄진다 */
  pointAccrualDeferred?: boolean;
  /** 이미 적립 "예약"된 주문 (원장이 없어 alreadyEarned 로는 잡히지 않는다) */
  accrualPending?: boolean;
}

interface SuccessData {
  points: number;
  storeName: string;
  customerId: string;
  resultPrice: number;
  hasExistingPreferences: boolean;
  hasVisitSource?: boolean;
  /** 적립이 결제완료 시점으로 예약된 경우 (아직 실제 적립 전) */
  deferred?: boolean;
}

function CoinImage({ onClick, isOpening }: { onClick: () => void; isOpening: boolean }) {
  return (
    <div
      className={`coin-image-wrapper ${isOpening ? 'opening' : ''}`}
      onClick={!isOpening ? onClick : undefined}
    >
      <img
        src="/pointcoin-3d-white.webp"
        alt="포인트 코인"
        className="coin-image"
      />

      <style jsx>{`
        .coin-image-wrapper {
          cursor: pointer;
          animation: gentleFloat 3s ease-in-out infinite;
        }

        .coin-image-wrapper:hover {
          animation: gentleFloat 2s ease-in-out infinite;
        }

        .coin-image-wrapper.opening {
          animation: boxOpen 0.6s ease-out forwards;
        }

        .coin-image {
          width: 240px;
          height: 240px;
          object-fit: contain;
        }

        @keyframes gentleFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }

        @keyframes boxOpen {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(0.8); opacity: 0; }
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }

        .shake-animation {
          animation: shake 0.5s ease-in-out;
        }
      `}</style>
    </div>
  );
}

function TaghereEnrollContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const [orderInfo, setOrderInfo] = useState<OrderInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAlreadyParticipated, setShowAlreadyParticipated] = useState(false);
  // 이미 "적립 예약"된 주문 — 아직 적립 전이라 안내 문구가 다르다
  const [alreadyReserved, setAlreadyReserved] = useState(false);
  const [successData, setSuccessData] = useState<SuccessData | null>(null);
  const [isAgreed, setIsAgreed] = useState(false);
  const [showAgreementWarning, setShowAgreementWarning] = useState(false);
  const [isAutoEarning, setIsAutoEarning] = useState(false);
  const autoEarnAttemptedRef = useRef(false);
  const [visitSourceOptions, setVisitSourceOptions] = useState<VisitSourceOption[]>([]);
  const [visitSourceEnabled, setVisitSourceEnabled] = useState(false);
  const [surveyQuestions, setSurveyQuestions] = useState<SurveyQuestion[]>([]);

  const slug = params.slug as string;
  const rawOrderId = searchParams.get('ordersheetId') || searchParams.get('orderId');
  const ordersheetId = rawOrderId && /^\{.+\}$/.test(rawOrderId) ? null : rawOrderId;
  const orderParamName = searchParams.get('orderId') ? 'orderId' : 'ordersheetId';
  const urlError = searchParams.get('error');

  // Success params from redirect
  const successPoints = searchParams.get('points');
  const successStoreName = searchParams.get('successStoreName');
  const customerId = searchParams.get('customerId');
  const successResultPrice = searchParams.get('resultPrice');
  const urlKakaoId = searchParams.get('kakaoId');
  const hasPreferences = searchParams.get('hasPreferences') === 'true';
  const hasVisitSourceParam = searchParams.get('hasVisitSource') === 'true';
  // 카카오 콜백이 지연 적립(결제완료 후 적립)으로 처리한 경우
  const deferredParam = searchParams.get('deferred') === 'true';

  // 같은 이벤트가 mount당 한 번만 발사되도록 보장 (StrictMode/effect 재실행 대비)
  const trackedEventsRef = useRef<Set<string>>(new Set());
  const trackOnce = (name: string, params: Record<string, unknown>) => {
    if (trackedEventsRef.current.has(name)) return;
    trackedEventsRef.current.add(name);
    trackEvent(name, params);
  };

  // 자동 적립 시도 함수
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
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        // 자동 적립 성공 → 피드백 팝업 표시
        setSuccessData({
          points: data.points,
          storeName: data.storeName,
          customerId: data.customerId,
          resultPrice: data.resultPrice,
          hasExistingPreferences: data.hasExistingPreferences || false,
          hasVisitSource: data.hasVisitSource || false,
          deferred: data.deferred === true,
        });
        setOrderInfo(null); // 기본 UI 숨김
        setUserId(data.customerId);
        trackOnce('earn_success', { flow_type: 'points', store_slug: slug, points: data.points, is_auto_earned: true });
      } else {
        // 에러 처리
        if (data.error === 'invalid_kakao_id') {
          // 유효하지 않은 kakaoId → 로컬스토리지 삭제, 기존 흐름으로
          removeStoredKakaoId();
        } else if (data.error === 'already_earned' || data.error === 'already_reserved') {
          // 이미 적립됐거나, 결제완료 대기 중인 적립 예약이 있음
          setAlreadyReserved(data.error === 'already_reserved');
          setShowAlreadyParticipated(true);
          setOrderInfo(null);
          trackOnce('earn_fail', { flow_type: 'points', store_slug: slug, reason: data.error });
        }
        // 그 외 에러는 기존 흐름 유지 (수동 적립 가능)
      }
    } catch (e) {
      console.error('Auto-earn failed:', e);
      // 네트워크 오류 등 → 기존 흐름 유지
    } finally {
      setIsAutoEarning(false);
    }
  };

  // 방문 경로 옵션은 항상 조회 (별도 useEffect - 카카오 로그인 리다이렉트 시에도 실행되도록)
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

  // 적립 플로우 최초 진입(start). 카카오 로그인 복귀(successPoints/urlError)는 진입으로 치지 않는다.
  useEffect(() => {
    if (slug && ordersheetId && !successPoints && !urlError) {
      trackOnce('earn_flow_start', { flow_type: 'points', store_slug: slug });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    // 디버그: URL 파라미터 확인
    console.log('[TagHere Enroll] URL params:', {
      successPoints,
      customerId,
      urlKakaoId,
      urlError,
      ordersheetId,
    });

    // Check if redirected back with success data
    if (successPoints && customerId) {
      // 카카오 로그인 성공 후 리다이렉트 → kakaoId 저장
      if (urlKakaoId) {
        console.log('[TagHere Enroll] Saving kakaoId to localStorage:', urlKakaoId);
        saveKakaoId(urlKakaoId);
      } else {
        console.log('[TagHere Enroll] No kakaoId in URL params');
      }

      setSuccessData({
        points: parseInt(successPoints),
        storeName: successStoreName || '태그히어',
        customerId,
        resultPrice: parseInt(successResultPrice || '0'),
        hasExistingPreferences: hasPreferences,
        hasVisitSource: hasVisitSourceParam,
        deferred: deferredParam,
      });
      setUserId(customerId);
      trackOnce('earn_success', { flow_type: 'points', store_slug: slug, points: parseInt(successPoints), is_auto_earned: false });
      setIsLoading(false);
      return;
    }

    if (urlError === 'already_participated') {
      setShowAlreadyParticipated(true);
      trackOnce('earn_fail', { flow_type: 'points', store_slug: slug, reason: 'already_earned' });
      setIsLoading(false);
      return;
    } else if (urlError) {
      setError('로그인에 실패했습니다. 다시 시도해주세요.');
      setIsLoading(false);
      return;
    }

    if (!ordersheetId) {
      setError('주문 정보가 없습니다.');
      setIsLoading(false);
      return;
    }

    const fetchOrderInfo = async () => {
      try {

        // TagHere API로 주문 정보 조회
        const res = await fetch(`${API_BASE}/api/taghere/ordersheet?ordersheetId=${ordersheetId}&slug=${slug}`);
        if (res.ok) {
          const data = await res.json();

          if (data.alreadyEarned || data.accrualPending) {
            setAlreadyReserved(!data.alreadyEarned && data.accrualPending === true);
            setShowAlreadyParticipated(true);
            setIsLoading(false);
            trackOnce('earn_fail', {
              flow_type: 'points',
              store_slug: slug,
              reason: data.alreadyEarned ? 'already_earned' : 'already_reserved',
            });
          } else {
            // 자동 적립 시도: 로컬스토리지에 kakaoId가 있으면 자동 적립
            // isLoading이 false가 되기 전에 isAutoEarning을 true로 설정해서 동의 UI가 안 보이게 함
            let shouldAutoEarn = false;
            let storedKakaoId: string | null = null;

            if (!autoEarnAttemptedRef.current) {
              autoEarnAttemptedRef.current = true;
              storedKakaoId = getStoredKakaoId();
              if (storedKakaoId) {
                shouldAutoEarn = true;
                setIsAutoEarning(true); // 먼저 설정하여 로딩 상태 유지
              }
            }

            setOrderInfo(data);
            setIsLoading(false);

            // 자동 적립 시도 (isLoading이 false가 된 후에도 isAutoEarning이 true라서 로딩 화면 유지)
            if (shouldAutoEarn && storedKakaoId) {
              attemptAutoEarn(storedKakaoId, data);
            }
          }
          return; // 성공 시 finally 건너뛰기 위해 여기서 처리 완료
        } else if (res.status === 404) {
          const errorData = await res.json().catch(() => ({}));
          setError(errorData.error === 'Store not found' ? '존재하지 않는 매장입니다.' : '주문 정보를 찾을 수 없습니다.');
        } else {
          const errorData = await res.json();
          setError(errorData.error || '주문 정보를 불러오는데 실패했습니다.');
        }
        setIsLoading(false);
      } catch (e) {
        console.error('Failed to fetch order info:', e);
        setError('주문 정보를 불러오는데 실패했습니다.');
        setIsLoading(false);
      }
    };

    fetchOrderInfo();
  }, [slug, ordersheetId, urlError, successPoints, customerId, successStoreName, successResultPrice, urlKakaoId]);

  const handleOpenGift = () => {
    if (!orderInfo) return;

    setIsOpening(true);

    setTimeout(() => {
      const redirectUri = `${API_BASE}/auth/kakao/taghere-callback`;

      // state 파라미터에 필요한 정보를 담아 전달
      const stateData = {
        storeId: orderInfo.storeId,
        slug,
        ordersheetId: ordersheetId || '',
        isTaghere: true,
        isStamp: false,
        origin: window.location.origin,
      };
      const state = btoa(JSON.stringify(stateData));

      // 카카오 SDK가 초기화되어 있으면 SDK 사용 (모바일에서 카카오톡 앱으로 로그인)
      trackEvent('kakao_auth_start', { flow_type: 'points', store_slug: slug });
      if (typeof window !== 'undefined' && window.Kakao && window.Kakao.isInitialized()) {
        window.Kakao.Auth.authorize({
          redirectUri,
          state,
          scope: 'profile_nickname,account_email,phone_number,gender,birthday,birthyear',
        });
      } else {
        // SDK 초기화 실패 시 기존 REST API 방식으로 폴백
        const params = new URLSearchParams();
        params.set('storeId', orderInfo.storeId);
        params.set('slug', slug);
        if (ordersheetId) params.set(orderParamName, ordersheetId);
        params.set('origin', window.location.origin);
        window.location.href = `${API_BASE}/auth/kakao/taghere-start?${params.toString()}`;
      }
    }, 500);
  };

  const handleCloseSuccessPopup = () => {
    setSuccessData(null);

    // order-success 페이지로 리다이렉트
    const url = new URL(window.location.origin + '/taghere-enroll/order-success');
    if (ordersheetId) url.searchParams.set(orderParamName, ordersheetId);
    url.searchParams.set('slug', slug);
    window.location.href = url.toString();
  };

  if (isLoading || isAutoEarning) {
    return (
      <div className="h-[100dvh] bg-neutral-100 font-pretendard flex justify-center overflow-hidden">
        <div className="w-full max-w-md h-full flex flex-col items-center justify-center bg-white gap-4">
          <div className="w-8 h-8 border-2 border-[#FFD541] border-t-transparent rounded-full animate-spin" />
          {isAutoEarning && (
            <p className="text-sm text-neutral-500">자동으로 포인트 적립 중...</p>
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
    const url = new URL(window.location.origin + '/taghere-enroll/order-success');
    if (ordersheetId) url.searchParams.set(orderParamName, ordersheetId);
    url.searchParams.set('slug', slug);
    window.location.href = url.toString();
  };

  return (
    <>
      {successData ? (
        // 포인트 적립 완료 → 피드백 화면만 표시
        <SuccessPopup
          successData={successData}
          onClose={handleCloseSuccessPopup}
          visitSourceOptions={visitSourceOptions}
          visitSourceEnabled={visitSourceEnabled}
          surveyQuestions={surveyQuestions}
          storeSlug={slug}
          flowType="points"
          header={
            <>
              {/* Points Display */}
              <div className="text-center mb-4 mt-4">
                <p className="text-[38px] font-bold text-[#61EB49] leading-none">
                  +{formatNumber(successData.points)}P
                </p>
              </div>

              {/* Main Message */}
              <div className="text-center mb-5">
                <h2 className="text-[18px] font-bold text-neutral-900 mb-1">
                  {successData.deferred
                    ? '결제 완료 후 자동으로 적립돼요'
                    : '알림톡으로 적립내역을 보내드렸어요!'}
                </h2>
                <p className="text-[14px] text-neutral-400">
                  {successData.deferred
                    ? '결제가 끝나면 알림톡으로 알려드릴게요'
                    : '소중한 의견은 큰 도움이 돼요'}
                </p>
              </div>
            </>
          }
        />
      ) : (
        // 포인트 적립 전 → 기본 화면만 표시
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

            {/* Title - 상단 영역 (flex: 1) */}
            <div className="flex-1 flex flex-col justify-end pb-4">
              <div className="text-center">
                <p className="text-[25px] font-bold text-[#1d2022] leading-[130%] tracking-[-0.6px]">
                  {orderInfo?.pointAccrualDeferred ? '결제 완료 후 자동 적립' : '방금 전 주문으로 적립된'}
                  <br />
                  <span className="text-[#61EB49]">{formatNumber(orderInfo?.earnPoints || 0)}P</span>
                  <span> 받아가세요</span>
                </p>
                {orderInfo && orderInfo.resultPrice > 0 && (
                  <p className="text-[14px] font-medium text-[#b1b5b8] leading-[130%] mt-2">
                    주문 금액 {formatNumber(orderInfo.resultPrice)}원 x {orderInfo.ratePercent}% 적립
                    {orderInfo.pointAccrualDeferred && ' · 결제 완료 시 자동 적립'}
                  </p>
                )}
              </div>
            </div>

            {/* Coin Image - 중앙 영역 (flex: 2) */}
            <div className="flex-[2] flex items-center justify-center">
              <CoinImage onClick={() => {
                trackEvent('earn_cta_click', { flow_type: 'points', store_slug: slug, agreed: isAgreed });
                if (!isAgreed) {
                  setShowAgreementWarning(true);
                  return;
                }
                handleOpenGift();
              }} isOpening={isOpening} />
            </div>

            {/* 하단 고정 영역 - 체크박스 + CTA */}
            <div className="flex-[1.2] flex flex-col justify-end px-5 pb-8">
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
                      적립을 위해 전국 매장 혜택 수신 동의가 필요해요.
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
                  trackEvent('earn_cta_click', { flow_type: 'points', store_slug: slug, agreed: isAgreed });
                  if (!isAgreed) {
                    setShowAgreementWarning(true);
                    return;
                  }
                  handleOpenGift();
                }}
                disabled={isOpening}
                className="w-full py-4 font-semibold text-base rounded-[10px] transition-colors bg-[#FFD541] hover:bg-[#FFCA00] text-[#1d2022]"
              >
                {isOpening ? '적립 중...' : '포인트 적립하기'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Already Participated Popup */}
      {showAlreadyParticipated && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-2xl p-6 w-full max-w-xs text-center shadow-xl">
            <div className="text-4xl mb-4">🎁</div>
            <h2 className="text-lg font-bold text-neutral-900 mb-2">
              {alreadyReserved ? '적립 예약이 완료되었어요' : '이미 적립이 완료되었어요'}
            </h2>
            <p className="text-sm text-neutral-500 mb-5">
              {alreadyReserved
                ? '결제가 완료되면 자동으로 적립되고 알림톡으로 알려드릴게요.'
                : '이 주문에 대한 포인트가 이미 적립되었습니다.'}
            </p>
            <button
              onClick={() => {
                // order-success 페이지로 이동
                const url = new URL(window.location.origin + '/taghere-enroll/order-success');
                if (ordersheetId) url.searchParams.set(orderParamName, ordersheetId);
                url.searchParams.set('slug', slug);
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
      `}</style>
    </>
  );
}

export default function TaghereEnrollPage() {
  return (
    <Suspense fallback={
      <div className="h-[100dvh] bg-neutral-100 flex justify-center overflow-hidden">
        <div className="w-full max-w-md h-full flex items-center justify-center bg-white">
          <div className="w-8 h-8 border-2 border-[#FFD541] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    }>
      <TaghereEnrollContent />
    </Suspense>
  );
}
