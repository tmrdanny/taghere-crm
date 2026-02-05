'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { formatNumber } from '@/lib/utils';

// ============================================
// 로컬스토리지 헬퍼 함수 (kakaoId 저장용)
// ============================================
const KAKAO_STORAGE_KEY = 'taghere_kakao_id';
const KAKAO_STORAGE_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000; // 90일

// 9개 핵심 카테고리 + 세부 매핑
const CATEGORY_OPTIONS = [
  {
    value: 'KOREAN',
    label: '한식',
    icon: '🍚',
    mappedCategories: ['KOREAN', 'BUNSIK', 'KOREAN_PUB']
  },
  {
    value: 'CHINESE',
    label: '중식',
    icon: '🥟',
    mappedCategories: ['CHINESE']
  },
  {
    value: 'JAPANESE',
    label: '일식',
    icon: '🍣',
    mappedCategories: ['JAPANESE', 'IZAKAYA']
  },
  {
    value: 'WESTERN',
    label: '양식',
    icon: '🍝',
    mappedCategories: ['WESTERN', 'BRUNCH']
  },
  {
    value: 'CAFE',
    label: '카페',
    icon: '☕',
    mappedCategories: ['CAFE', 'BAKERY', 'ICECREAM']
  },
  {
    value: 'MEAT',
    label: '고기/구이',
    icon: '🥩',
    mappedCategories: ['MEAT', 'SEAFOOD', 'BUFFET']
  },
  {
    value: 'BEER',
    label: '주점',
    icon: '🍺',
    mappedCategories: ['BEER', 'POCHA', 'COOK_PUB']
  },
  {
    value: 'WINE_BAR',
    label: '와인',
    icon: '🍷',
    mappedCategories: ['WINE_BAR', 'COCKTAIL_BAR']
  },
  {
    value: 'DESSERT',
    label: '디저트',
    icon: '🍰',
    mappedCategories: ['DESSERT']
  },
] as const;

// "모든 업종" 선택 옵션
const ALL_CATEGORIES_VALUE = 'ALL';

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

interface OrderInfo {
  storeId: string;
  storeName: string;
  ordersheetId: string;
  resultPrice: number;
  ratePercent: number;
  earnPoints: number;
  alreadyEarned: boolean;
}

interface VisitSourceOption {
  id: string;
  label: string;
}

interface SuccessData {
  points: number;
  storeName: string;
  customerId: string;
  resultPrice: number;
  hasExistingPreferences: boolean;
  hasVisitSource?: boolean;
}

interface SurveyQuestion {
  id: string;
  type: 'DATE';
  label: string;
  description: string | null;
  required: boolean;
}

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

  // 설문 팝업: 비동기로 로드된 경우 대응
  useEffect(() => {
    if (surveyQuestions.length > 0 && !surveySubmitted) {
      setShowSurveyModal(true);
    }
  }, [surveyQuestions.length, surveySubmitted]);

  const handleSurveySubmit = async () => {
    const answersToSubmit = Object.entries(surveyAnswers)
      .filter(([, value]) => value)
      .map(([questionId, value]) => ({
        questionId,
        valueDate: value,
      }));

    if (answersToSubmit.length > 0 && successData?.customerId) {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
        await fetch(`${apiUrl}/api/taghere/survey-answers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerId: successData.customerId,
            answers: answersToSubmit,
          }),
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

  // 단계별 UI: 방문 경로 활성화 시 1/2 → 2/2 단계로 진행
  const showVisitSourceStep = visitSourceEnabled && visitSourceOptions.length > 0;
  const showCategoryStep = !successData.hasExistingPreferences;
  const totalSteps = (showVisitSourceStep ? 1 : 0) + (showCategoryStep ? 1 : 0);
  const [currentStep, setCurrentStep] = useState(1); // 1 = 방문경로, 2 = 선호업종

  const toggleCategory = (categoryValue: string) => {
    setSelectedCategories(prev => {
      // "모든 업종" 클릭 시
      if (categoryValue === ALL_CATEGORIES_VALUE) {
        if (prev.includes(ALL_CATEGORIES_VALUE)) {
          // 이미 선택되어 있으면 전체 해제
          return [];
        } else {
          // 모든 카테고리 선택
          return [ALL_CATEGORIES_VALUE, ...CATEGORY_OPTIONS.map(c => c.value)];
        }
      }

      // 개별 카테고리 클릭 시
      if (prev.includes(categoryValue)) {
        // 선택 해제
        const newSelection = prev.filter(c => c !== categoryValue && c !== ALL_CATEGORIES_VALUE);
        return newSelection;
      } else {
        // 선택 추가
        const newSelection = [...prev.filter(c => c !== ALL_CATEGORIES_VALUE), categoryValue];
        // 모든 개별 카테고리가 선택되었는지 확인
        if (newSelection.length === CATEGORY_OPTIONS.length) {
          return [ALL_CATEGORIES_VALUE, ...newSelection];
        }
        return newSelection;
      }
    });
  };

  // 방문 경로 즉시 저장하고 다음 단계로 이동하는 함수
  const handleVisitSourceSelect = async (optionId: string) => {
    setSelectedVisitSource(optionId);

    if (!successData.customerId) return;

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      await fetch(`${apiUrl}/api/customers/visit-source`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerId: successData.customerId,
          visitSource: optionId,
        }),
      });

      // 저장 후 다음 단계로 이동 또는 마지막 단계면 피드백 영역 표시
      if (showCategoryStep) {
        setCurrentStep(2);
      }
      // 선호 업종 단계가 없으면 현재 단계 유지 (피드백 입력 가능)
    } catch (error) {
      console.error('Visit source save error:', error);
    }
  };

  // "건너뛰기" 버튼 클릭 시 - 다음 단계로 이동 또는 닫기
  const handleSkip = () => {
    if (showVisitSourceStep && currentStep === 1 && showCategoryStep) {
      setCurrentStep(2);
    } else {
      onClose();
    }
  };

  const handleSubmit = async () => {
    if (!successData.customerId) {
      onClose();
      return;
    }

    setIsSubmitting(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

      // 선택된 카테고리를 세부 카테고리로 확장
      const expandedCategories = selectedCategories
        .filter(c => c !== ALL_CATEGORIES_VALUE)
        .flatMap(categoryValue => {
          const option = CATEGORY_OPTIONS.find(opt => opt.value === categoryValue);
          return option ? option.mappedCategories : [];
        });

      // 피드백 저장
      await fetch(`${apiUrl}/api/customers/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerId: successData.customerId,
          feedbackRating: feedbackRating || null,
          feedbackText: feedbackText.trim() || null,
          preferredCategories: expandedCategories.length > 0 ? expandedCategories : null,
        }),
      });

      // 제출 완료 후 팝업 없이 바로 order-success로 이동
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
        {/* Full Page Content */}
        <div className="flex-1 flex flex-col px-5 py-6 overflow-y-auto">
          {/* Points Display */}
          <div className="text-center mb-4 mt-4">
            <p className="text-[38px] font-bold text-[#61EB49] leading-none">
              +{formatNumber(successData.points)}P
            </p>
          </div>

          {/* Main Message */}
          <div className="text-center mb-5">
            <h2 className="text-[18px] font-bold text-neutral-900 mb-1">
              알림톡으로 적립내역을 보내드렸어요!
            </h2>
            <p className="text-[14px] text-neutral-400">
              소중한 의견은 큰 도움이 돼요
            </p>
          </div>

          {/* Star Rating */}
          <div className="mb-11">
            <StarRating rating={feedbackRating} onRatingChange={setFeedbackRating} />
          </div>

          {/* 단계 표시기 - 2단계 이상일 때만 표시 */}
          {totalSteps >= 2 && (
            <div className="flex justify-center gap-2 mb-4">
              {showVisitSourceStep && (
                <div className={`w-2 h-2 rounded-full transition-colors ${currentStep === 1 ? 'bg-[#6BA3FF]' : 'bg-neutral-200'}`} />
              )}
              {showCategoryStep && (
                <div className={`w-2 h-2 rounded-full transition-colors ${currentStep === 2 || (!showVisitSourceStep && currentStep === 1) ? 'bg-[#6BA3FF]' : 'bg-neutral-200'}`} />
              )}
            </div>
          )}

          {/* Step 1: Visit Source Selection - 방문 경로 활성화 시 */}
          {showVisitSourceStep && currentStep === 1 && (
            <div className="mb-4 mt-5">
              <p className="text-[15px] font-semibold text-neutral-900 mb-1.5 text-center">
                어떻게 저희 매장을 알게 되셨나요?
              </p>
              <p className="text-[13px] text-neutral-500 mb-3 text-center">
                더 나은 서비스를 위해 알려주세요
              </p>

              {/* 방문 경로 선택 버튼 그리드 */}
              <div className="grid grid-cols-3 gap-2">
                {visitSourceOptions.map((option) => {
                  const isSelected = selectedVisitSource === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => handleVisitSourceSelect(option.id)}
                      className={`px-3 py-2.5 rounded-lg text-[14px] font-medium transition-all ${
                        isSelected
                          ? 'bg-[#6BA3FF] text-white border border-[#6BA3FF]'
                          : 'bg-neutral-50 text-neutral-600 border border-neutral-200 hover:border-[#6BA3FF]'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 2: Preferred Categories - 선호 업종 선택 */}
          {showCategoryStep && ((showVisitSourceStep && currentStep === 2) || (!showVisitSourceStep && currentStep === 1)) && (
            <div className="mb-4 mt-5">
              <p className="text-[15px] font-semibold text-neutral-900 mb-1.5 text-center">
                어떤 업종을 선호하세요?
              </p>
              <p className="text-[13px] text-neutral-500 mb-3 text-center">
                선택한 업종의 쿠폰을 매 주 보내드릴게요
              </p>

              {/* 업종 선택 버튼 그리드 */}
              <div className={showAllCategories ? 'grid grid-cols-4 gap-2 mb-2' : 'relative mb-2'}>
                {showAllCategories ? (
                  <>
                    {/* "모든 업종" 버튼 */}
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

                    {/* 개별 카테고리 버튼들 */}
                    {CATEGORY_OPTIONS.map((category) => {
                      const isSelected = selectedCategories.includes(category.value);
                      return (
                        <button
                          key={category.value}
                          type="button"
                          onClick={() => toggleCategory(category.value)}
                          className={`px-3 py-2.5 rounded-lg text-[14px] font-medium transition-all ${
                            isSelected
                              ? 'bg-[#6BA3FF] text-white border border-[#6BA3FF]'
                              : 'bg-neutral-50 text-neutral-600 border border-neutral-200 hover:border-neutral-300'
                          }`}
                        >
                          {category.label}
                        </button>
                      );
                    })}
                  </>
                ) : (
                  <div className="flex gap-2 overflow-hidden">
                    {/* "모든 업종" 버튼 */}
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

                    {/* 개별 카테고리 버튼들 (한식/중식/일식/양식) */}
                    {CATEGORY_OPTIONS.slice(0, 4).map((category) => {
                      const isSelected = selectedCategories.includes(category.value);
                      return (
                        <button
                          key={category.value}
                          type="button"
                          onClick={() => toggleCategory(category.value)}
                          className={`flex-shrink-0 px-3 py-2.5 rounded-lg text-[14px] font-medium transition-all ${
                            isSelected
                              ? 'bg-[#6BA3FF] text-white border border-[#6BA3FF]'
                              : 'bg-neutral-50 text-neutral-600 border border-neutral-200 hover:border-neutral-300'
                          }`}
                        >
                          {category.label}
                        </button>
                      );
                    })}

                    {/* 블러 처리된 카페 버튼 */}
                    <div className="flex-shrink-0 px-3 py-2.5 rounded-lg text-[14px] font-medium bg-neutral-50 text-neutral-600 border border-neutral-200 opacity-50 blur-[1px] pointer-events-none">
                      카페
                    </div>
                  </div>
                )}
              </div>

              {/* 더보기/접기 버튼 */}
              <div className="text-center my-3">
                <button
                  type="button"
                  onClick={() => setShowAllCategories(!showAllCategories)}
                  className="flex items-center justify-center gap-1 mx-auto text-[13px] text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                  <span>{showAllCategories ? '접기' : '더보기'}</span>
                  <svg
                    className={`w-3.5 h-3.5 transition-transform ${showAllCategories ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Feedback Text - 마지막 단계에서만 표시 */}
          {((showVisitSourceStep && showCategoryStep && currentStep === 2) ||
            (showVisitSourceStep && !showCategoryStep && currentStep === 1) ||
            (!showVisitSourceStep && showCategoryStep && currentStep === 1) ||
            (!showVisitSourceStep && !showCategoryStep)) && (
            <div className="mb-4">
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="매장 경험에 대한 솔직한 피드백을 남겨주시면 감사하겠습니다."
                className="w-full h-[84px] px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-lg resize-none text-[14px] text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#FFD541] focus:border-transparent"
              />
            </div>
          )}

          {/* Spacer to push buttons to bottom */}
          <div className="flex-1 min-h-[12px]"></div>

          {/* Survey Modal */}
          {showSurveyModal && surveyQuestions.length > 0 && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-5">
              <div className="bg-white rounded-2xl w-full max-w-[390px] shadow-xl overflow-hidden">
                <div className="px-5 py-6">
                  <p className="text-[18px] font-bold text-neutral-900 mb-1 text-center">
                    추가 정보를 알려주세요
                  </p>
                  <p className="text-[13px] text-neutral-500 mb-5 text-center">
                    특별한 날에 혜택을 보내드릴게요
                  </p>
                  <div className="space-y-4 mb-6">
                    {surveyQuestions.map((q) => (
                      <div key={q.id} className="flex flex-col gap-2 items-center">
                        <label className="text-[14px] font-medium text-neutral-700 text-center whitespace-pre-line">
                          {q.label}
                        </label>
                        {q.description && (
                          <p className="text-[12px] text-neutral-400 text-center whitespace-pre-line">{q.description}</p>
                        )}
                        <input
                          type="date"
                          value={surveyAnswers[q.id] || ''}
                          onChange={(e) =>
                            setSurveyAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                          }
                          className="w-full px-4 py-3.5 bg-neutral-50 border border-neutral-200 rounded-xl text-[16px] text-neutral-900 text-center focus:outline-none focus:ring-2 focus:ring-[#FFD541] focus:border-transparent appearance-none"
                          style={{ minHeight: '52px' }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={handleSurveySkip}
                      className="flex-1 py-3.5 bg-neutral-200 hover:bg-neutral-300 text-neutral-700 font-semibold text-[15px] rounded-xl transition-colors"
                    >
                      다음에 할래요
                    </button>
                    <button
                      onClick={handleSurveySubmit}
                      className="flex-1 py-3.5 bg-[#FFD541] hover:bg-[#FFCA00] text-neutral-900 font-semibold text-[15px] rounded-xl transition-colors"
                    >
                      제출하기
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Buttons - 단계에 따라 다른 버튼 표시 */}
          <div className="flex gap-3 pb-2">
            {/* Step 1 (방문 경로) 버튼 - 선택하면 자동으로 다음 단계로 이동, 건너뛰기만 표시 */}
            {showVisitSourceStep && showCategoryStep && currentStep === 1 ? (
              <button
                onClick={handleSkip}
                className="flex-1 py-3.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-500 font-medium text-[14px] rounded-xl transition-colors"
              >
                건너뛰기
              </button>
            ) : (
              /* 마지막 단계 버튼 */
              <>
                <button
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="flex-1 py-3.5 bg-neutral-200 hover:bg-neutral-300 text-neutral-700 font-semibold text-[15px] rounded-xl transition-colors"
                >
                  다음에 쓸게요
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="flex-1 py-3.5 bg-[#FFD541] hover:bg-[#FFCA00] disabled:bg-[#FFE88A] text-neutral-900 font-semibold text-[15px] rounded-xl transition-colors"
                >
                  {isSubmitting ? '제출 중...' : '제출할게요'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
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
  const [successData, setSuccessData] = useState<SuccessData | null>(null);
  const [isAgreed, setIsAgreed] = useState(false);
  const [showAgreementWarning, setShowAgreementWarning] = useState(false);
  const [isAutoEarning, setIsAutoEarning] = useState(false);
  const autoEarnAttemptedRef = useRef(false);
  const [visitSourceOptions, setVisitSourceOptions] = useState<VisitSourceOption[]>([]);
  const [visitSourceEnabled, setVisitSourceEnabled] = useState(false);
  const [surveyQuestions, setSurveyQuestions] = useState<SurveyQuestion[]>([]);

  const slug = params.slug as string;
  const ordersheetId = searchParams.get('ordersheetId');
  const urlError = searchParams.get('error');

  // Success params from redirect
  const successPoints = searchParams.get('points');
  const successStoreName = searchParams.get('successStoreName');
  const customerId = searchParams.get('customerId');
  const successResultPrice = searchParams.get('resultPrice');
  const urlKakaoId = searchParams.get('kakaoId');
  const hasPreferences = searchParams.get('hasPreferences') === 'true';

  // 자동 적립 시도 함수
  const attemptAutoEarn = async (kakaoId: string, orderData: OrderInfo) => {
    setIsAutoEarning(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const res = await fetch(`${apiUrl}/api/taghere/auto-earn`, {
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
        });
        setOrderInfo(null); // 기본 UI 숨김
      } else {
        // 에러 처리
        if (data.error === 'invalid_kakao_id') {
          // 유효하지 않은 kakaoId → 로컬스토리지 삭제, 기존 흐름으로
          removeStoredKakaoId();
        } else if (data.error === 'already_earned') {
          // 이미 적립됨
          setShowAlreadyParticipated(true);
          setOrderInfo(null);
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
      });
      setIsLoading(false);
      return;
    }

    if (urlError === 'already_participated') {
      setShowAlreadyParticipated(true);
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
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

        // TagHere API로 주문 정보 조회
        const res = await fetch(`${apiUrl}/api/taghere/ordersheet?ordersheetId=${ordersheetId}&slug=${slug}`);
        if (res.ok) {
          const data = await res.json();

          if (data.alreadyEarned) {
            setShowAlreadyParticipated(true);
            setIsLoading(false);
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
          setError('존재하지 않는 매장입니다.');
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
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const redirectUri = `${apiUrl}/auth/kakao/taghere-callback`;

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
        if (ordersheetId) params.set('ordersheetId', ordersheetId);
        params.set('origin', window.location.origin);
        window.location.href = `${apiUrl}/auth/kakao/taghere-start?${params.toString()}`;
      }
    }, 500);
  };

  const handleCloseSuccessPopup = () => {
    setSuccessData(null);

    // order-success 페이지로 리다이렉트
    const url = new URL(window.location.origin + '/taghere-enroll/order-success');
    if (ordersheetId) url.searchParams.set('ordersheetId', ordersheetId);
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
    if (ordersheetId) url.searchParams.set('ordersheetId', ordersheetId);
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
                  방금 전 주문으로 적립된
                  <br />
                  <span className="text-[#61EB49]">{formatNumber(orderInfo?.earnPoints || 0)}P</span>
                  <span> 받아가세요</span>
                </p>
                {orderInfo && orderInfo.resultPrice > 0 && (
                  <p className="text-[14px] font-medium text-[#b1b5b8] leading-[130%] mt-2">
                    주문 금액 {formatNumber(orderInfo.resultPrice)}원 x {orderInfo.ratePercent}% 적립
                  </p>
                )}
              </div>
            </div>

            {/* Coin Image - 중앙 영역 (flex: 2) */}
            <div className="flex-[2] flex items-center justify-center">
              <CoinImage onClick={() => {
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
                      포인트 적립을 위해 전국 매장 혜택 수신 동의가 필요해요.
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
              이미 적립이 완료되었어요
            </h2>
            <p className="text-sm text-neutral-500 mb-5">
              이 주문에 대한 포인트가 이미 적립되었습니다.
            </p>
            <button
              onClick={() => {
                // order-success 페이지로 이동
                const url = new URL(window.location.origin + '/taghere-enroll/order-success');
                if (ordersheetId) url.searchParams.set('ordersheetId', ordersheetId);
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
