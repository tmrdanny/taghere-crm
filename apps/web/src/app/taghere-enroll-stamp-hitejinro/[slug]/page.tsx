'use client';

import { Suspense, useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { BarcodeDetector } from 'barcode-detector/ponyfill';

// ============================================
// 로컬스토리지 헬퍼 함수 (kakaoId 저장용)
// ============================================
const KAKAO_STORAGE_KEY = 'taghere_kakao_id';
const KAKAO_STORAGE_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000; // 90일

interface StoredKakaoData {
  kakaoId: string;
  savedAt: number;
}

function getStoredKakaoId(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem(KAKAO_STORAGE_KEY);
    if (!stored) return null;

    const data: StoredKakaoData = JSON.parse(stored);
    const now = Date.now();

    // 만료 체크 (90일)
    if (now - data.savedAt > KAKAO_STORAGE_EXPIRY_MS) {
      localStorage.removeItem(KAKAO_STORAGE_KEY);
      return null;
    }

    return data.kakaoId;
  } catch {
    localStorage.removeItem(KAKAO_STORAGE_KEY);
    return null;
  }
}

function saveKakaoId(kakaoId: string): void {
  if (typeof window === 'undefined') return;

  const data: StoredKakaoData = {
    kakaoId,
    savedAt: Date.now(),
  };
  localStorage.setItem(KAKAO_STORAGE_KEY, JSON.stringify(data));
}

function removeStoredKakaoId(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(KAKAO_STORAGE_KEY);
}

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

interface VisitSourceOption {
  id: string;
  label: string;
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

interface SurveyQuestion {
  id: string;
  type: 'DATE' | 'TEXT' | 'CHOICE';
  label: string;
  description: string | null;
  required: boolean;
  choiceOptions?: string[] | null;
}

// 9개 핵심 카테고리 + 세부 매핑
const CATEGORY_OPTIONS = [
  { value: 'KOREAN', label: '한식', icon: '🍚', mappedCategories: ['KOREAN', 'BUNSIK', 'KOREAN_PUB'] },
  { value: 'CHINESE', label: '중식', icon: '🥟', mappedCategories: ['CHINESE'] },
  { value: 'JAPANESE', label: '일식', icon: '🍣', mappedCategories: ['JAPANESE', 'IZAKAYA'] },
  { value: 'WESTERN', label: '양식', icon: '🍝', mappedCategories: ['WESTERN', 'BRUNCH'] },
  { value: 'CAFE', label: '카페', icon: '☕', mappedCategories: ['CAFE', 'BAKERY', 'ICECREAM'] },
  { value: 'MEAT', label: '고기/구이', icon: '🥩', mappedCategories: ['MEAT', 'SEAFOOD', 'BUFFET'] },
  { value: 'BEER', label: '주점', icon: '🍺', mappedCategories: ['BEER', 'POCHA', 'COOK_PUB'] },
  { value: 'WINE_BAR', label: '와인', icon: '🍷', mappedCategories: ['WINE_BAR', 'COCKTAIL_BAR'] },
  { value: 'DESSERT', label: '디저트', icon: '🍰', mappedCategories: ['DESSERT'] },
] as const;

const ALL_CATEGORIES_VALUE = 'ALL';

function StarRating({ rating, onRatingChange }: { rating: number; onRatingChange: (rating: number) => void }) {
  return (
    <div className="flex gap-3 justify-center">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onRatingChange(star)}
          className="cursor-pointer hover:scale-110 transition-transform"
        >
          <svg
            className={`w-10 h-10 ${star <= rating ? 'fill-[#FFD541] text-[#FFD541]' : 'fill-none text-neutral-300'}`}
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
          </svg>
        </button>
      ))}
    </div>
  );
}

function SuccessPopup({
  successData,
  onClose,
  visitSourceOptions,
  visitSourceEnabled,
  surveyQuestions,
}: {
  successData: SuccessData;
  onClose: () => void;
  visitSourceOptions: VisitSourceOption[];
  visitSourceEnabled: boolean;
  surveyQuestions: SurveyQuestion[];
}) {
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackText, setFeedbackText] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedVisitSource, setSelectedVisitSource] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [surveyAnswers, setSurveyAnswers] = useState<Record<string, string>>({});
  const [showSurveyModal, setShowSurveyModal] = useState(() => surveyQuestions.length > 0);
  const [surveySubmitted, setSurveySubmitted] = useState(false);

  useEffect(() => {
    if (surveyQuestions.length > 0 && !surveySubmitted) {
      setShowSurveyModal(true);
    }
  }, [surveyQuestions.length, surveySubmitted]);

  const handleSurveySubmit = async () => {
    const answersToSubmit = Object.entries(surveyAnswers)
      .filter(([, value]) => value)
      .map(([questionId, value]) => {
        const q = surveyQuestions.find((sq) => sq.id === questionId);
        if (q?.type === 'DATE') return { questionId, valueDate: value };
        return { questionId, valueText: value };
      });

    if (answersToSubmit.length > 0 && successData?.customerId) {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
        await fetch(`${apiUrl}/api/taghere/survey-answers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerId: successData.customerId, answers: answersToSubmit }),
        });
      } catch (error) {
        console.error('Survey submit error:', error);
      }
    }

    setSurveySubmitted(true);
    setShowSurveyModal(false);
  };

  const handleSurveySkip = () => {
    setSurveySubmitted(true);
    setShowSurveyModal(false);
  };

  const toggleCategory = (categoryValue: string) => {
    setSelectedCategories((prev) => {
      if (categoryValue === ALL_CATEGORIES_VALUE) {
        if (prev.includes(ALL_CATEGORIES_VALUE)) {
          return [];
        } else {
          return [ALL_CATEGORIES_VALUE, ...CATEGORY_OPTIONS.map((c) => c.value)];
        }
      }

      if (prev.includes(categoryValue)) {
        const newSelection = prev.filter((c) => c !== categoryValue && c !== ALL_CATEGORIES_VALUE);
        return newSelection;
      } else {
        const newSelection = [...prev.filter((c) => c !== ALL_CATEGORIES_VALUE), categoryValue];
        if (newSelection.length === CATEGORY_OPTIONS.length) {
          return [ALL_CATEGORIES_VALUE, ...newSelection];
        }
        return newSelection;
      }
    });
  };

  const handleSubmit = async () => {
    if (!successData.customerId) {
      onClose();
      return;
    }

    setIsSubmitting(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

      const expandedCategories = selectedCategories
        .filter((c) => c !== ALL_CATEGORIES_VALUE)
        .flatMap((categoryValue) => {
          const option = CATEGORY_OPTIONS.find((opt) => opt.value === categoryValue);
          return option ? option.mappedCategories : [];
        });

      await fetch(`${apiUrl}/api/customers/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: successData.customerId,
          feedbackRating: feedbackRating || null,
          feedbackText: feedbackText.trim() || null,
          preferredCategories: expandedCategories.length > 0 ? expandedCategories : null,
        }),
      });

      if (selectedVisitSource) {
        await fetch(`${apiUrl}/api/customers/visit-source`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerId: successData.customerId, visitSource: selectedVisitSource }),
        });
      }

      onClose();
    } catch (error) {
      console.error('Feedback submission error:', error);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-[100dvh] bg-white font-pretendard flex justify-center overflow-hidden">
      <div className="w-full max-w-[430px] h-full flex flex-col">
        <div className="flex-1 flex flex-col px-5 py-6 overflow-y-auto">
          <div className="text-center mb-4 mt-4">
            <p className="text-[30px] font-bold text-[#61EB49] leading-none">스탬프 적립 완료</p>
          </div>

          <div className="text-center mb-5">
            <h2 className="text-[18px] font-bold text-neutral-900 mb-1">알림톡으로 적립내역을 보내드렸어요!</h2>
            <p className="text-[14px] text-neutral-400">소중한 의견은 큰 도움이 돼요</p>
          </div>

          <div className="mb-11">
            <StarRating rating={feedbackRating} onRatingChange={setFeedbackRating} />
          </div>

          {visitSourceEnabled && visitSourceOptions.length > 0 && !successData.hasVisitSource && (
            <div className="mb-4 mt-5">
              <p className="text-[15px] font-semibold text-neutral-900 mb-1.5 text-center">어떻게 저희 매장을 알게 되셨나요?</p>
              <p className="text-[13px] text-neutral-500 mb-3 text-center">더 나은 서비스를 위해 알려주세요</p>
              <div className="grid grid-cols-3 gap-2">
                {visitSourceOptions.map((option) => {
                  const isSelected = selectedVisitSource === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setSelectedVisitSource(isSelected ? null : option.id)}
                      className={`px-3 py-2.5 rounded-lg text-[14px] font-medium transition-all ${
                        isSelected ? 'bg-[#6BA3FF] text-white border border-[#6BA3FF]' : 'bg-neutral-50 text-neutral-600 border border-neutral-200 hover:border-neutral-300'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {!successData.hasExistingPreferences && !visitSourceEnabled && (
            <div className="mb-4 mt-5">
              <p className="text-[15px] font-semibold text-neutral-900 mb-1.5 text-center">어떤 업종을 선호하세요?</p>
              <p className="text-[13px] text-neutral-500 mb-3 text-center">선택한 업종의 쿠폰을 매 주 보내드릴게요</p>

              <div className={showAllCategories ? 'grid grid-cols-4 gap-2 mb-2' : 'relative mb-2'}>
                {showAllCategories ? (
                  <>
                    <button
                      type="button"
                      onClick={() => toggleCategory(ALL_CATEGORIES_VALUE)}
                      className={`px-3 py-2.5 rounded-lg text-[14px] font-medium transition-all ${
                        selectedCategories.includes(ALL_CATEGORIES_VALUE)
                          ? 'bg-[#6BA3FF] text-white border border-[#6BA3FF]'
                          : 'bg-neutral-50 text-neutral-600 border border-neutral-200 hover:border-neutral-300'
                      }`}
                    >
                      모든 업종
                    </button>
                    {CATEGORY_OPTIONS.map((category) => {
                      const isSelected = selectedCategories.includes(category.value);
                      return (
                        <button
                          key={category.value}
                          type="button"
                          onClick={() => toggleCategory(category.value)}
                          className={`px-3 py-2.5 rounded-lg text-[14px] font-medium transition-all ${
                            isSelected ? 'bg-[#6BA3FF] text-white border border-[#6BA3FF]' : 'bg-neutral-50 text-neutral-600 border border-neutral-200 hover:border-neutral-300'
                          }`}
                        >
                          {category.label}
                        </button>
                      );
                    })}
                  </>
                ) : (
                  <div className="flex gap-2 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleCategory(ALL_CATEGORIES_VALUE)}
                      className={`flex-shrink-0 px-3 py-2.5 rounded-lg text-[14px] font-medium transition-all ${
                        selectedCategories.includes(ALL_CATEGORIES_VALUE)
                          ? 'bg-[#6BA3FF] text-white border border-[#6BA3FF]'
                          : 'bg-neutral-50 text-neutral-600 border border-neutral-200 hover:border-neutral-300'
                      }`}
                    >
                      모든 업종
                    </button>
                    {CATEGORY_OPTIONS.slice(0, 4).map((category) => {
                      const isSelected = selectedCategories.includes(category.value);
                      return (
                        <button
                          key={category.value}
                          type="button"
                          onClick={() => toggleCategory(category.value)}
                          className={`flex-shrink-0 px-3 py-2.5 rounded-lg text-[14px] font-medium transition-all ${
                            isSelected ? 'bg-[#6BA3FF] text-white border border-[#6BA3FF]' : 'bg-neutral-50 text-neutral-600 border border-neutral-200 hover:border-neutral-300'
                          }`}
                        >
                          {category.label}
                        </button>
                      );
                    })}
                    <div className="flex-shrink-0 px-3 py-2.5 rounded-lg text-[14px] font-medium bg-neutral-50 text-neutral-600 border border-neutral-200 opacity-50 blur-[1px] pointer-events-none">
                      카페
                    </div>
                  </div>
                )}
              </div>

              <div className="text-center my-3">
                <button
                  type="button"
                  onClick={() => setShowAllCategories(!showAllCategories)}
                  className="flex items-center justify-center gap-1 mx-auto text-[13px] text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                  <span>{showAllCategories ? '접기' : '더보기'}</span>
                  <svg className={`w-3.5 h-3.5 transition-transform ${showAllCategories ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          <div className="mb-4">
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="매장 경험에 대한 솔직한 피드백을 남겨주시면 감사하겠습니다."
              className="w-full h-[84px] px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-lg resize-none text-[14px] text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#FFD541] focus:border-transparent"
            />
          </div>

          <div className="flex-1 min-h-[12px]"></div>

          {showSurveyModal && surveyQuestions.length > 0 && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-5">
              <div className="bg-white rounded-2xl w-full max-w-[390px] shadow-xl overflow-hidden">
                <div className="px-5 py-6">
                  <p className="text-[18px] font-bold text-neutral-900 mb-1 text-center">추가 정보를 알려주세요</p>
                  <p className="text-[13px] text-neutral-500 mb-5 text-center">특별한 날에 혜택을 보내드릴게요</p>
                  <div className="space-y-3 mb-6">
                    {surveyQuestions.map((q) => (
                      <div key={q.id} className="flex flex-col gap-1.5 items-center">
                        <label className="text-[14px] font-medium text-neutral-700 text-center whitespace-pre-line">{q.label}</label>
                        {q.description && <p className="text-[12px] text-neutral-400 text-center whitespace-pre-line">{q.description}</p>}
                        {q.type === 'DATE' && (
                          <input
                            type="date"
                            value={surveyAnswers[q.id] || ''}
                            onChange={(e) => setSurveyAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                            className="w-full max-w-[280px] px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-lg text-[14px] text-neutral-900 text-center focus:outline-none focus:ring-2 focus:ring-[#FFD541] focus:border-transparent"
                          />
                        )}
                        {q.type === 'TEXT' && (
                          <input
                            type="text"
                            value={surveyAnswers[q.id] || ''}
                            onChange={(e) => setSurveyAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                            placeholder="답변을 입력해주세요"
                            className="w-full max-w-[280px] px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-lg text-[14px] text-neutral-900 text-center focus:outline-none focus:ring-2 focus:ring-[#FFD541] focus:border-transparent"
                          />
                        )}
                        {q.type === 'CHOICE' && q.choiceOptions && (
                          <div className="w-full max-w-[280px] space-y-2">
                            {q.choiceOptions.map((opt, idx) => (
                              <button
                                key={idx}
                                onClick={() => setSurveyAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                                className={`w-full px-4 py-2.5 rounded-lg text-[14px] text-left transition-colors ${
                                  surveyAnswers[q.id] === opt
                                    ? 'bg-[#FFD541] text-neutral-900 font-medium'
                                    : 'bg-neutral-50 border border-neutral-200 text-neutral-700'
                                }`}
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-3">
                    <button onClick={handleSurveySkip} className="flex-1 py-3.5 bg-neutral-200 hover:bg-neutral-300 text-neutral-700 font-semibold text-[15px] rounded-xl transition-colors">
                      다음에 할래요
                    </button>
                    <button onClick={handleSurveySubmit} className="flex-1 py-3.5 bg-[#FFD541] hover:bg-[#FFCA00] text-neutral-900 font-semibold text-[15px] rounded-xl transition-colors">
                      제출하기
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3 pb-2">
            <button onClick={onClose} disabled={isSubmitting} className="flex-1 py-3.5 bg-neutral-200 hover:bg-neutral-300 text-neutral-700 font-semibold text-[15px] rounded-xl transition-colors">
              다음에 쓸게요
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1 py-3.5 bg-[#FFD541] hover:bg-[#FFCA00] disabled:bg-[#FFE88A] text-neutral-900 font-semibold text-[15px] rounded-xl transition-colors"
            >
              {isSubmitting ? '제출 중...' : '제출할게요'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
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

      // 오토포커스 활성화 (applyConstraints — 삼성/Android 호환성 향상)
      const track = stream.getVideoTracks()[0];
      if (track) {
        try {
          const capabilities = track.getCapabilities?.() as any;
          if (capabilities?.focusMode?.includes?.('continuous')) {
            await track.applyConstraints({
              advanced: [{ focusMode: 'continuous' } as any],
            });
          }
        } catch {
          // 오토포커스 미지원 기기 — 무시
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

      // 주기적 프레임 스캔 (350ms 간격 — 포커스 안정화 시간 확보)
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
      }, 350);

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

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const redirectUri = `${apiUrl}/auth/kakao/taghere-callback`;

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
      window.location.href = `${apiUrl}/auth/kakao/taghere-start?${params.toString()}`;
    }
  };

  // 카카오 로그인으로 이동
  const proceedToKakaoLogin = (barcode: string) => {
    if (!stampInfo) return;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const redirectUri = `${apiUrl}/auth/kakao/taghere-callback`;

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
      window.location.href = `${apiUrl}/auth/kakao/taghere-start?${params.toString()}`;
    }
  };

  // 자동 적립 시도
  const attemptAutoEarn = async (kakaoId: string, storeData: StampInfo, barcode?: string) => {
    setIsAutoEarning(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const res = await fetch(`${apiUrl}/api/taghere/stamp-earn`, {
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
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
        const res = await fetch(`${apiUrl}/api/taghere/visit-source-options/${slug}`);
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
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
        const res = await fetch(`${apiUrl}/api/taghere/survey-questions/${slug}`);
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
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

        const res = await fetch(`${apiUrl}/api/taghere/stamp-info/${slug}`);
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

  const rewardText = (() => {
    if (!stampInfo) return '10개 모으면 선물이 있어요';
    const rewards = stampInfo.rewards || [];
    if (rewards.length === 0) return '스탬프를 모아 보상을 받으세요';
    const sorted = [...rewards].sort((a, b) => a.tier - b.tier);
    const first = sorted[0];
    return `${first.tier}개 모으면 ${first.description} 증정`;
  })();

  return (
    <>
      {successData ? (
        <SuccessPopup
          successData={successData}
          onClose={handleCloseSuccessPopup}
          visitSourceOptions={visitSourceOptions}
          visitSourceEnabled={visitSourceEnabled}
          surveyQuestions={surveyQuestions}
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

            {/* Title */}
            <div className="pt-12 pb-4 px-5">
              <div className="text-center">
                {stampInfo?.franchiseStampEnabled && stampInfo.franchiseName ? (
                  <>
                    <p className="text-[25px] font-bold text-[#1d2022] leading-[130%] tracking-[-0.6px]">
                      {stampInfo.franchiseName}
                      <br />
                      <span className="text-[#00A859]">통합 스탬프 적립!</span>
                    </p>
                    <p className="text-[14px] font-medium text-[#b1b5b8] leading-[130%] mt-2">테라와 켈리 병에 있는 바코드를 스캔해보세요.</p>
                  </>
                ) : (
                  <>
                    <p className="text-[25px] font-bold text-[#1d2022] leading-[130%] tracking-[-0.6px]">
                      테라, 켈리 주문하고
                      <br />
                      <span className="text-[#00A859]">해외여행 가자!!</span>
                    </p>
                    <p className="text-[14px] font-medium text-[#b1b5b8] leading-[130%] mt-2">테라와 켈리 병에 있는 바코드를 스캔해보세요.</p>
                  </>
                )}
                <p className="text-[12px] text-neutral-400 mt-1">{rewardText}</p>
              </div>
            </div>

            {/* 바코드 스캐너 영역 */}
            <div className="flex-1 flex flex-col items-center justify-center px-5">
              <div className="w-full max-w-[320px] aspect-[4/3] bg-neutral-900 rounded-2xl overflow-hidden relative" ref={scannerContainerRef}>
                <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted />

                {!isScannerActive && !scannerError && !isProcessing && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-900">
                    <svg className="w-16 h-16 text-neutral-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                      />
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

              {/* 스캔 가이드 */}
              <div className="mt-4 text-center">
                <p className="text-[13px] text-neutral-500">{isScannerActive ? '바코드를 카메라에 비춰주세요' : '카메라 대기 중'}</p>
              </div>
            </div>

            {/* 하단 고정 영역 */}
            <div className="flex-shrink-0 flex flex-col px-5 pb-8">
              {/* 동의 안내 영역 */}
              <div className={`rounded-[12px] mb-4 p-4 transition-colors ${showAgreementWarning && !isAgreed ? 'bg-[#fff0f3] border border-[#ffb3c1]' : 'bg-[#f8f9fa]'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-start gap-1">
                    <p className="text-[14px] font-medium leading-[140%] text-[#55595e]">스탬프 적립을 위해 전국 매장 혜택 수신 동의가 필요해요.</p>
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
