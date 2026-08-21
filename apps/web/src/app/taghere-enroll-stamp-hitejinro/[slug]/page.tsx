'use client';

import { API_BASE } from '@/lib/api-config';
import { Suspense, useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { BarcodeDetector } from 'barcode-detector/ponyfill';
import { getStoredKakaoId, saveKakaoId, removeStoredKakaoId } from '@/features/enroll/kakao-storage';
import { StampSuccessPopup } from '@/features/enroll/StampSuccessPopup';
import type { VisitSourceOption, SurveyQuestion } from '@/features/enroll/types';

// 하이트진로 바코드 프리픽스 (EAN-13)
const HITEJINRO_BARCODE_PREFIX = '8801119';

interface StampInfo {
  storeId: string;
  storeName: string;
  rewards?: Array<{ tier: number; description: string; options?: any[] | null }>;
  enabled: boolean;
  franchiseStampEnabled?: boolean;
  franchiseName?: string;
}

interface RewardInfo {
  tier: number;
  description: string;
  isRandom: boolean;
}

interface SuccessData {
  storeName: string;
  customerId: string;
  currentStamps: number;
  hasExistingPreferences: boolean;
  hasVisitSource?: boolean;
  rewards: RewardInfo[];
  drawnReward?: string | null;
  drawnRewardTier?: number | null;
  franchiseName?: string | null;
}

function HitejinroEnrollStampContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const [stampInfo, setStampInfo] = useState<StampInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAlreadyParticipated, setShowAlreadyParticipated] = useState(false);
  const [alreadyParticipatedData, setAlreadyParticipatedData] = useState<{ stamps: number; storeName: string; rewards: Record<number, string> } | null>(null);
  const [successData, setSuccessData] = useState<SuccessData | null>(null);
  const [isAgreed, setIsAgreed] = useState(false);
  const [showAgreementWarning, setShowAgreementWarning] = useState(false);
  const [isAutoEarning, setIsAutoEarning] = useState(false);
  const autoEarnAttemptedRef = useRef(false);
  const [visitSourceOptions, setVisitSourceOptions] = useState<VisitSourceOption[]>([]);
  const [visitSourceEnabled, setVisitSourceEnabled] = useState(false);
  const [surveyQuestions, setSurveyQuestions] = useState<SurveyQuestion[]>([]);

  // 바코드 스캐너 관련 상태
  const [isScannerActive, setIsScannerActive] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [showInvalidBarcodePopup, setShowInvalidBarcodePopup] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetector | null>(null);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scannerContainerRef = useRef<HTMLDivElement>(null);

  // 바코드 처리를 위한 ref (콜백에서 최신 상태 접근용)
  const stampInfoRef = useRef<StampInfo | null>(null);
  const isAgreedRef = useRef(false);

  // ref 동기화
  useEffect(() => {
    stampInfoRef.current = stampInfo;
  }, [stampInfo]);

  useEffect(() => {
    isAgreedRef.current = isAgreed;
  }, [isAgreed]);

  const slug = params.slug as string;
  const rawOrderId = searchParams.get('ordersheetId') || searchParams.get('orderId');
  const ordersheetId = rawOrderId && /^\{.+\}$/.test(rawOrderId) ? null : rawOrderId;
  const orderParamName = searchParams.get('orderId') ? 'orderId' : 'ordersheetId';
  const urlError = searchParams.get('error');

  // Success params from redirect
  const successStamps = searchParams.get('stamps');
  const successStoreName = searchParams.get('successStoreName');
  const customerId = searchParams.get('customerId');
  const urlKakaoId = searchParams.get('kakaoId');
  const hasPreferences = searchParams.get('hasPreferences') === 'true';
  const hasVisitSourceParam = searchParams.get('hasVisitSource') === 'true';
  // URL 파라미터에서 모든 rewardN 패턴 동적 파싱 (1~50 지원)
  const rewardParams: Record<number, string | null> = {};
  const rewardRandomParams: Record<number, boolean> = {};
  searchParams.forEach((value, key) => {
    const match = key.match(/^reward(\d+)$/);
    if (match && !key.endsWith('Random')) {
      const n = parseInt(match[1]);
      if (n >= 1 && n <= 50) {
        rewardParams[n] = value || null;
        rewardRandomParams[n] = searchParams.get(`reward${n}Random`) === 'true';
      }
    }
  });
  const urlDrawnReward = searchParams.get('drawnReward');
  const urlDrawnRewardTier = searchParams.get('drawnRewardTier');
  const urlFranchiseName = searchParams.get('franchiseName');

  // 바코드 스캐너 정지
  const stopScanner = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsScannerActive(false);
  }, []);

  // 바코드 스캔 성공 시 비프음 재생
  const playBeepSound = useCallback(() => {
    try {
      const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 1800; // 높은 톤의 비프음
      oscillator.type = 'sine';
      gainNode.gain.value = 0.3;

      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.15); // 0.15초 동안 재생
    } catch (e) {
      console.error('Failed to play beep sound:', e);
    }
  }, []);

  // 바코드 스캐너 시작
  const startScanner = useCallback(async () => {
    if (!scannerContainerRef.current) return;

    setScannerError(null);

    try {
      // 카메라 열기 — 바코드 인식에 적합한 해상도 (1280x720)
      // 너무 높은 해상도는 일부 Android (Galaxy S24 등)에서 프레임 처리 부하 발생
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
      } catch {
        // Fallback: 기본 후면 카메라
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
      }

      streamRef.current = stream;

      // 오토포커스 + 토치 활성화 (Android Chrome 호환성 향상)
      const track = stream.getVideoTracks()[0];
      if (track) {
        try {
          const capabilities = track.getCapabilities?.() as any;
          const advancedConstraints: any[] = [];

          // 연속 오토포커스 설정
          if (capabilities?.focusMode?.includes?.('continuous')) {
            advancedConstraints.push({ focusMode: 'continuous' });
          }

          // 근거리 초점 힌트 (바코드 스캔 거리 ~20-30cm)
          if (capabilities?.focusDistance) {
            advancedConstraints.push({ focusDistance: 0.25 });
          }

          if (advancedConstraints.length > 0) {
            await track.applyConstraints({ advanced: advancedConstraints });
          }
        } catch {
          // 미지원 기기 — 무시
        }
      }

      // 비디오 엘리먼트에 스트림 연결
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();

      // BarcodeDetector 초기화 (ZXing WASM 기반 polyfill)
      if (!detectorRef.current) {
        detectorRef.current = new BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'],
        });
      }

      // 처리 중복 방지용 플래그
      let isHandlingBarcode = false;

      // 주기적 프레임 스캔 (200ms 간격 — 포커스 맞는 순간 빠르게 캐치)
      scanIntervalRef.current = setInterval(async () => {
        if (isHandlingBarcode || !video || video.readyState < 2) return;

        try {
          const barcodes = await detectorRef.current!.detect(video);
          if (barcodes.length === 0) return;

          const decodedText = barcodes[0].rawValue;
          if (!decodedText) return;

          // 중복 처리 방지
          isHandlingBarcode = true;

          // 바코드 인식 성공 - 비프음 재생
          playBeepSound();

          // 바코드 인식 성공
          setScannedBarcode(decodedText);

          // 하이트진로 바코드 검증
          if (decodedText.startsWith(HITEJINRO_BARCODE_PREFIX)) {
            // 유효한 바코드 → 스캐너 정지 후 스탬프 적립 진행
            stopScanner();
            // ref를 통해 최신 상태 접근
            if (!stampInfoRef.current || !isAgreedRef.current) {
              if (!isAgreedRef.current) {
                setShowAgreementWarning(true);
              }
              isHandlingBarcode = false;
              return;
            }
            handleValidBarcodeWithRef(decodedText);
          } else {
            // 유효하지 않은 바코드
            stopScanner();
            setShowInvalidBarcodePopup(true);
          }
        } catch (e) {
          // 프레임 디코딩 실패 (무시)
        }
      }, 200);

      setIsScannerActive(true);
    } catch (err) {
      console.error('Failed to start scanner:', err);
      if (err instanceof Error) {
        if (err.message.includes('Permission denied') || err.message.includes('NotAllowedError')) {
          setScannerError('카메라 권한이 필요합니다. 브라우저 설정에서 카메라 권한을 허용해주세요.');
        } else if (err.message.includes('NotFoundError')) {
          setScannerError('카메라를 찾을 수 없습니다.');
        } else {
          setScannerError('카메라를 시작할 수 없습니다: ' + err.message);
        }
      }
    }
  }, [stopScanner, playBeepSound]);

  // 유효한 바코드 처리 (ref 사용 - 스캐너 콜백에서 호출됨)
  const handleValidBarcodeWithRef = async (barcode: string) => {
    const currentStampInfo = stampInfoRef.current;
    if (!currentStampInfo) return;

    setIsProcessing(true);

    // 저장된 kakaoId가 있으면 자동 적립 시도
    const storedKakaoId = getStoredKakaoId();
    if (storedKakaoId) {
      await attemptAutoEarn(storedKakaoId, currentStampInfo, barcode);
      return;
    }

    // 카카오 로그인으로 이동
    proceedToKakaoLoginWithRef(barcode);
  };

  // 유효한 바코드 처리 → 카카오 로그인으로 진행
  const handleValidBarcode = async (barcode: string) => {
    if (!stampInfo || !isAgreed) {
      if (!isAgreed) {
        setShowAgreementWarning(true);
      }
      return;
    }

    setIsProcessing(true);

    // 저장된 kakaoId가 있으면 자동 적립 시도
    const storedKakaoId = getStoredKakaoId();
    if (storedKakaoId) {
      await attemptAutoEarn(storedKakaoId, stampInfo, barcode);
      return;
    }

    // 카카오 로그인으로 이동
    proceedToKakaoLogin(barcode);
  };

  // 카카오 로그인으로 이동 (ref 사용)
  const proceedToKakaoLoginWithRef = (barcode: string) => {
    const currentStampInfo = stampInfoRef.current;
    if (!currentStampInfo) return;

    const redirectUri = `${API_BASE}/auth/kakao/taghere-callback`;

    const stateData = {
      storeId: currentStampInfo.storeId,
      slug,
      ordersheetId: ordersheetId || '',
      isTaghere: true,
      isStamp: true,
      isHitejinro: true,
      barcode,
      origin: window.location.origin,
      returnPath: `/taghere-enroll-stamp-hitejinro/${slug}`,
    };
    const state = btoa(JSON.stringify(stateData));

    if (typeof window !== 'undefined' && window.Kakao && window.Kakao.isInitialized()) {
      window.Kakao.Auth.authorize({
        redirectUri,
        state,
        scope: 'profile_nickname,account_email,phone_number,gender,birthday,birthyear',
      });
    } else {
      const params = new URLSearchParams();
      params.set('storeId', currentStampInfo.storeId);
      params.set('slug', slug);
      params.set('isStamp', 'true');
      params.set('isHitejinro', 'true');
      params.set('barcode', barcode);
      if (ordersheetId) params.set(orderParamName, ordersheetId);
      params.set('origin', window.location.origin);
      params.set('returnPath', `/taghere-enroll-stamp-hitejinro/${slug}`);
      window.location.href = `${API_BASE}/auth/kakao/taghere-start?${params.toString()}`;
    }
  };

  // 카카오 로그인으로 이동
  const proceedToKakaoLogin = (barcode: string) => {
    if (!stampInfo) return;

    const redirectUri = `${API_BASE}/auth/kakao/taghere-callback`;

    const stateData = {
      storeId: stampInfo.storeId,
      slug,
      ordersheetId: ordersheetId || '',
      isTaghere: true,
      isStamp: true,
      isHitejinro: true,
      barcode,
      origin: window.location.origin,
      returnPath: `/taghere-enroll-stamp-hitejinro/${slug}`,
    };
    const state = btoa(JSON.stringify(stateData));

    if (typeof window !== 'undefined' && window.Kakao && window.Kakao.isInitialized()) {
      window.Kakao.Auth.authorize({
        redirectUri,
        state,
        scope: 'profile_nickname,account_email,phone_number,gender,birthday,birthyear',
      });
    } else {
      const params = new URLSearchParams();
      params.set('storeId', stampInfo.storeId);
      params.set('slug', slug);
      params.set('isStamp', 'true');
      params.set('isHitejinro', 'true');
      params.set('barcode', barcode);
      if (ordersheetId) params.set(orderParamName, ordersheetId);
      params.set('origin', window.location.origin);
      params.set('returnPath', `/taghere-enroll-stamp-hitejinro/${slug}`);
      window.location.href = `${API_BASE}/auth/kakao/taghere-start?${params.toString()}`;
    }
  };

  // 자동 적립 시도
  const attemptAutoEarn = async (kakaoId: string, storeData: StampInfo, barcode?: string) => {
    setIsAutoEarning(true);

    try {
      const res = await fetch(`${API_BASE}/api/taghere/stamp-earn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kakaoId,
          ordersheetId: ordersheetId || undefined,
          slug,
          isHitejinro: true,
          barcode,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        // API rewards 배열에서 RewardInfo 변환
        const apiRewards: RewardInfo[] = Array.isArray(data.rewards)
          ? data.rewards.map((r: any) => ({
              tier: r.tier,
              description: r.description || '',
              isRandom: r.options && Array.isArray(r.options) && r.options.length > 1,
            }))
          : [];
        setSuccessData({
          storeName: data.storeName,
          customerId: data.customerId,
          currentStamps: data.currentStamps,
          hasExistingPreferences: data.hasExistingPreferences || false,
          hasVisitSource: data.hasVisitSource || false,
          rewards: apiRewards,
          drawnReward: data.drawnReward || null,
          drawnRewardTier: data.drawnRewardTier || null,
          franchiseName: data.franchiseName || null,
        });
        setStampInfo(null);
      } else {
        if (data.error === 'invalid_kakao_id') {
          removeStoredKakaoId();
          // 카카오 로그인으로 이동
          if (barcode) {
            proceedToKakaoLogin(barcode);
          }
        } else if (data.error === 'already_earned_today' || data.error === 'already_earned') {
          if (data.currentStamps !== undefined) {
            const rwArr: Record<number, string> = {};
            if (Array.isArray(data.rewards)) {
              for (const r of data.rewards) {
                rwArr[r.tier] = r.description || '';
              }
            }
            setAlreadyParticipatedData({
              stamps: data.currentStamps,
              storeName: data.storeName || storeData.storeName || '',
              rewards: rwArr,
            });
          }
          setShowAlreadyParticipated(true);
          setStampInfo(null);
        }
      }
    } catch (e) {
      console.error('Auto-earn failed:', e);
    } finally {
      setIsAutoEarning(false);
      setIsProcessing(false);
    }
  };

  // 방문 경로 및 설문 조회
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

  // 매장 정보 조회 및 성공 데이터 처리
  useEffect(() => {
    if (successStamps && customerId) {
      if (urlKakaoId) {
        saveKakaoId(urlKakaoId);
      }

      const urlRewards: RewardInfo[] = Object.entries(rewardParams)
        .filter(([_, desc]) => desc)
        .map(([tier, desc]) => ({
          tier: Number(tier),
          description: desc!,
          isRandom: rewardRandomParams[Number(tier)] || false,
        }))
        .sort((a, b) => a.tier - b.tier);
      setSuccessData({
        storeName: successStoreName || '태그히어',
        customerId,
        currentStamps: parseInt(successStamps),
        hasExistingPreferences: hasPreferences,
        hasVisitSource: hasVisitSourceParam,
        rewards: urlRewards,
        drawnReward: urlDrawnReward,
        drawnRewardTier: urlDrawnRewardTier ? parseInt(urlDrawnRewardTier) : null,
        franchiseName: urlFranchiseName,
      });
      setIsLoading(false);
      return;
    }

    if (urlError === 'already_participated') {
      const urlStamps = searchParams.get('stamps');
      const urlStoreName = searchParams.get('storeName');
      if (urlStamps) {
        const rw: Record<number, string> = {};
        for (const [tier, desc] of Object.entries(rewardParams)) {
          if (desc) rw[Number(tier)] = desc;
        }
        setAlreadyParticipatedData({
          stamps: parseInt(urlStamps),
          storeName: urlStoreName || '',
          rewards: rw,
        });
      }
      setShowAlreadyParticipated(true);
      setIsLoading(false);
      return;
    } else if (urlError) {
      setError('로그인에 실패했습니다. 다시 시도해주세요.');
      setIsLoading(false);
      return;
    }

    const fetchStampInfo = async () => {
      try {

        const res = await fetch(`${API_BASE}/api/taghere/stamp-info/${slug}`);
        if (res.ok) {
          const data = await res.json();

          if (!data.enabled) {
            setError('이 매장은 스탬프 적립 서비스를 제공하지 않습니다.');
            setIsLoading(false);
            return;
          }

          setStampInfo(data);
          setIsLoading(false);
          return;
        } else if (res.status === 404) {
          const errorData = await res.json().catch(() => ({}));
          setError(errorData.error === 'Store not found' ? '존재하지 않는 매장입니다.' : '주문 정보를 찾을 수 없습니다.');
        } else {
          const errorData = await res.json();
          setError(errorData.error || '정보를 불러오는데 실패했습니다.');
        }
        setIsLoading(false);
      } catch (e) {
        console.error('Failed to fetch stamp info:', e);
        setError('정보를 불러오는데 실패했습니다.');
        setIsLoading(false);
      }
    };

    fetchStampInfo();
  }, [slug, ordersheetId, urlError, successStamps, customerId, successStoreName, urlKakaoId]);

  // 컴포넌트 언마운트 시 스캐너 정리
  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  const handleCloseSuccessPopup = () => {
    const url = new URL(window.location.origin + '/taghere-enroll-stamp-hitejinro/stamp-success');
    url.searchParams.set('slug', slug);
    if (ordersheetId) url.searchParams.set(orderParamName, ordersheetId);
    if (successData) {
      url.searchParams.set('stamps', String(successData.currentStamps || 0));
      url.searchParams.set('storeName', successData.storeName || '');
      for (const r of successData.rewards) {
        if (r.description) url.searchParams.set(`reward${r.tier}`, r.description);
        if (r.isRandom) url.searchParams.set(`reward${r.tier}Random`, 'true');
      }
      if (successData.drawnReward) {
        url.searchParams.set('drawnReward', successData.drawnReward);
      }
      if (successData.drawnRewardTier) {
        url.searchParams.set('drawnRewardTier', String(successData.drawnRewardTier));
      }
      if (successData.franchiseName) {
        url.searchParams.set('franchiseName', successData.franchiseName);
      }
    }
    window.location.href = url.toString();
  };

  const handleSkipEarn = () => {
    const url = new URL(window.location.origin + '/taghere-enroll/order-success');
    url.searchParams.set('type', 'stamp');
    url.searchParams.set('slug', slug);
    if (ordersheetId) {
      url.searchParams.set(orderParamName, ordersheetId);
    }
    window.location.href = url.toString();
  };

  const handleStartScan = () => {
    if (!isAgreed) {
      setShowAgreementWarning(true);
      return;
    }
    startScanner();
  };

  const handleRetryScan = () => {
    setShowInvalidBarcodePopup(false);
    setScannedBarcode(null);
    startScanner();
  };

  if (isLoading || isAutoEarning) {
    return (
      <div className="h-[100dvh] bg-neutral-100 font-pretendard flex justify-center overflow-hidden">
        <div className="w-full max-w-md h-full flex flex-col items-center justify-center bg-white gap-4">
          <div className="w-8 h-8 border-2 border-[#FFD541] border-t-transparent rounded-full animate-spin" />
          {isAutoEarning && <p className="text-sm text-neutral-500">자동으로 스탬프 적립 중...</p>}
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
          <button onClick={() => window.location.reload()} className="px-5 py-2.5 bg-[#FFD541] text-neutral-900 font-semibold rounded-xl text-sm">
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  const rewardCards = (() => {
    if (!stampInfo) return [{ tier: 10, description: '선물이 있어요' }];
    const rewards = stampInfo.rewards || [];
    if (rewards.length === 0) return [{ tier: 10, description: '보상을 받으세요' }];
    return [...rewards].sort((a, b) => a.tier - b.tier);
  })();

  return (
    <>
      {successData ? (
        <StampSuccessPopup
          successData={successData}
          onClose={handleCloseSuccessPopup}
          visitSourceOptions={visitSourceOptions}
          visitSourceEnabled={visitSourceEnabled}
          surveyQuestions={surveyQuestions}
          header={
            <>
              <div className="text-center mb-4 mt-4">
                <p className="text-[30px] font-bold text-[#61EB49] leading-none">스탬프 적립 완료</p>
              </div>

              <div className="text-center mb-5">
                <h2 className="text-[18px] font-bold text-neutral-900 mb-1">알림톡으로 적립내역을 보내드렸어요!</h2>
                <p className="text-[14px] text-neutral-400">소중한 의견은 큰 도움이 돼요</p>
              </div>
            </>
          }
        />
      ) : (
        <div className="h-[100dvh] bg-neutral-100 font-pretendard flex justify-center overflow-hidden">
          <div className="w-full max-w-[430px] h-full flex flex-col bg-white relative">
            {/* 우측 상단 X 버튼 */}
            <button onClick={handleSkipEarn} className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-neutral-600 transition-colors z-10" aria-label="건너뛰기">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* 스크롤 가능한 상단 영역 */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {/* Title */}
              <div className="pt-8 pb-3 px-2.5">
                <div className="text-center">
                  <p className="text-[20px] font-bold text-[#1d2022] leading-[130%] tracking-[-0.4px]">
                    테라/켈리 주문 후
                    <br />
                    병에 있는 바코드를 스캔하면
                  </p>
                  <p className="text-[20px] font-bold text-[#00ab4f] leading-[130%] tracking-[-0.4px]">
                    스탬프 획득
                  </p>
                </div>
              </div>

              {/* 바코드 스캐너 영역 */}
              <div className="flex flex-col items-center px-11">
                <div className="w-full flex flex-col gap-2 items-center">
                  <div className="w-full aspect-[4/3] bg-neutral-900 rounded-2xl overflow-hidden relative" ref={scannerContainerRef}>
                    <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted />

                    {!isScannerActive && !scannerError && !isProcessing && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-900">
                        <svg className="w-16 h-16 text-neutral-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <p className="text-neutral-400 text-sm">카메라 대기 중</p>
                      </div>
                    )}

                    {isProcessing && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-900/80">
                        <div className="w-8 h-8 border-2 border-[#00A859] border-t-transparent rounded-full animate-spin mb-3" />
                        <p className="text-white text-sm">스탬프 적립 중...</p>
                      </div>
                    )}

                    {scannerError && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-900 p-4">
                        <svg className="w-12 h-12 text-red-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <p className="text-red-400 text-sm text-center">{scannerError}</p>
                      </div>
                    )}
                  </div>
                  <p className="text-[14px] font-medium text-[#91959a] leading-[130%]">
                    {isScannerActive ? '바코드를 카메라에 비춰주세요' : '카메라 대기중'}
                  </p>
                </div>
              </div>

              {/* 스탬프 보상 */}
              <div className="px-10 py-5 flex flex-col gap-3 items-center">
                <p className="text-[16px] font-semibold text-black leading-[130%] text-center w-full">스탬프 보상</p>
                <div className="w-full flex flex-col gap-2">
                  {rewardCards.map((card, i) => (
                    <div key={i} className="bg-[#f2f3f4] rounded-[4px] flex items-center gap-3 px-3 py-3.5 w-full">
                      <span className="text-[15px] font-medium text-[#1d2022] leading-[130%] whitespace-nowrap">{card.tier}개</span>
                      <span className="text-[15px] font-medium text-[#6eadff] leading-[130%]">{card.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 하단 고정 영역 */}
            <div className="flex-shrink-0 flex flex-col px-5 pb-8">
              {/* 동의 안내 영역 */}
              <div className={`rounded-[12px] mb-4 p-4 transition-colors ${showAgreementWarning && !isAgreed ? 'bg-[#fff0f3] border border-[#ffb3c1]' : 'bg-[#f8f9fa]'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-start gap-1">
                    <p className="text-[14px] font-medium leading-[140%] text-[#55595e]">적립을 위해 전국 매장 혜택 수신 동의가 필요해요.</p>
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
                  <div
                    className={`w-[20px] h-[20px] border-2 rounded flex items-center justify-center transition-colors flex-shrink-0 ${
                      isAgreed ? 'bg-[#00A859] border-[#00A859]' : showAgreementWarning && !isAgreed ? 'border-[#ffb3c1] bg-white' : 'border-[#d1d5db] bg-white'
                    }`}
                  >
                    {isAgreed && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className={`text-[14px] ${showAgreementWarning && !isAgreed ? 'text-[#ff6b6b]' : 'text-[#55595e]'}`}>네, 동의합니다</span>
                </button>
              </div>

              <button
                onClick={isScannerActive ? stopScanner : handleStartScan}
                disabled={isProcessing}
                className={`w-full py-4 font-semibold text-base rounded-[10px] transition-colors ${
                  isScannerActive ? 'bg-neutral-700 hover:bg-neutral-800 text-white' : 'bg-[#00A859] hover:bg-[#008a4a] text-white'
                }`}
              >
                {isProcessing ? '적립 중...' : isScannerActive ? '스캔 중지' : '바코드 스캔하기'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 이미 참여 팝업 */}
      {showAlreadyParticipated && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-2xl p-6 w-full max-w-xs text-center shadow-xl">
            <div className="w-16 h-16 flex items-center justify-center mx-auto mb-4">
              <img src="/images/gold-box.webp" alt="보상 상자" className="w-full h-full object-contain" />
            </div>
            <h2 className="text-lg font-bold text-neutral-900 mb-2">오늘 이미 스탬프를 적립했어요</h2>
            <p className="text-sm text-neutral-500 mb-5">스탬프는 하루에 한 번만 적립 가능합니다.</p>
            <button
              onClick={() => {
                if (alreadyParticipatedData) {
                  const url = new URL(window.location.origin + '/taghere-enroll-stamp-hitejinro/stamp-success');
                  url.searchParams.set('slug', slug);
                  url.searchParams.set('stamps', String(alreadyParticipatedData.stamps));
                  url.searchParams.set('storeName', alreadyParticipatedData.storeName);
                  for (const [tier, desc] of Object.entries(alreadyParticipatedData.rewards)) {
                    if (desc) url.searchParams.set(`reward${tier}`, desc);
                  }
                  window.location.href = url.toString();
                } else {
                  handleSkipEarn();
                }
              }}
              className="w-full py-3 bg-[#00A859] hover:bg-[#008a4a] text-white font-semibold text-base rounded-xl transition-colors"
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* 유효하지 않은 바코드 팝업 */}
      {showInvalidBarcodePopup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-2xl p-6 w-full max-w-xs text-center shadow-xl">
            <div className="w-16 h-16 flex items-center justify-center mx-auto mb-4 text-5xl">🍺</div>
            <h2 className="text-lg font-bold text-neutral-900 mb-2">테라와 켈리 주문 시에만</h2>
            <h2 className="text-lg font-bold text-neutral-900 mb-4">스탬프가 적립 돼요!</h2>
            <p className="text-sm text-neutral-500 mb-5">테라 또는 켈리 병에 있는 바코드를 스캔해주세요.</p>
            <button onClick={handleRetryScan} className="w-full py-3 bg-[#00A859] hover:bg-[#008a4a] text-white font-semibold text-base rounded-xl transition-colors">
              다시 스캔
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

export default function HitejinroEnrollStampPage() {
  return (
    <Suspense
      fallback={
        <div className="h-[100dvh] bg-neutral-100 flex justify-center overflow-hidden">
          <div className="w-full max-w-md h-full flex items-center justify-center bg-white">
            <div className="w-8 h-8 border-2 border-[#00A859] border-t-transparent rounded-full animate-spin" />
          </div>
        </div>
      }
    >
      <HitejinroEnrollStampContent />
    </Suspense>
  );
}
