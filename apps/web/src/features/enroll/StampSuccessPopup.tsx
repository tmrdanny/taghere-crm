import { API_BASE } from '@/lib/api-config';
import { useEffect, useState, type ReactNode } from 'react';
import { StarRating } from '@/features/enroll/StarRating';
import { CATEGORY_OPTIONS, ALL_CATEGORIES_VALUE } from '@/features/enroll/constants';
import type { VisitSourceOption, SurveyQuestion } from '@/features/enroll/types';

// 스탬프 적립 완료 후 피드백 화면 (단일 화면: 방문 경로/선호 업종 동시 노출, 제출 시 일괄 저장).
// taghere-enroll-stamp / taghere-enroll-stamp-hitejinro 공용 —
// 페이지별 차이는 header(상단 문구 블록)와 트래킹 콜백(하이트진로는 미전달 = 트래킹 없음)으로만 전달한다.
interface StampSuccessPopupData {
  customerId: string;
  hasExistingPreferences: boolean;
  hasVisitSource?: boolean;
}

export function StampSuccessPopup({
  successData,
  onClose,
  visitSourceOptions,
  visitSourceEnabled,
  surveyQuestions,
  header,
  onSurveySubmitted,
  onVisitSourceSelect,
  onFeedbackSubmit,
}: {
  successData: StampSuccessPopupData;
  onClose: () => void;
  visitSourceOptions: VisitSourceOption[];
  visitSourceEnabled: boolean;
  surveyQuestions: SurveyQuestion[];
  header: ReactNode;
  /** 설문 제출 API 호출 직후 트래킹 콜백 (미전달 시 no-op) */
  onSurveySubmitted?: (answerCount: number) => void;
  /** 방문 경로 신규 선택 시 트래킹 콜백 (미전달 시 no-op) */
  onVisitSourceSelect?: () => void;
  /** 피드백 제출 직전 트래킹 콜백 (미전달 시 no-op) */
  onFeedbackSubmit?: (rating: number, hasText: boolean) => void;
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
      .map(([questionId, value]) => {
        const q = surveyQuestions.find((sq) => sq.id === questionId);
        if (q?.type === 'DATE') return { questionId, valueDate: value };
        return { questionId, valueText: value };
      });

    if (answersToSubmit.length > 0 && successData?.customerId) {
      try {
        await fetch(`${API_BASE}/api/taghere/survey-answers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerId: successData.customerId,
            answers: answersToSubmit,
          }),
        });
        onSurveySubmitted?.(answersToSubmit.length);
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

  const handleSubmit = async () => {
    if (!successData.customerId) {
      onClose();
      return;
    }

    setIsSubmitting(true);
    try {

      // 선택된 카테고리를 세부 카테고리로 확장
      const expandedCategories = selectedCategories
        .filter(c => c !== ALL_CATEGORIES_VALUE)
        .flatMap(categoryValue => {
          const option = CATEGORY_OPTIONS.find(opt => opt.value === categoryValue);
          return option ? option.mappedCategories : [];
        });

      onFeedbackSubmit?.(feedbackRating, feedbackText.trim().length > 0);
      // 피드백 저장
      await fetch(`${API_BASE}/api/customers/feedback`, {
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

      // 방문 경로 저장 (선택된 경우)
      if (selectedVisitSource) {
        await fetch(`${API_BASE}/api/customers/visit-source`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            customerId: successData.customerId,
            visitSource: selectedVisitSource,
          }),
        });
      }

      // 제출 완료 후 팝업 닫기
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
          {header}

          {/* Star Rating */}
          <div className="mb-11">
            <StarRating rating={feedbackRating} onRatingChange={setFeedbackRating} />
          </div>

          {/* Visit Source Selection - 방문경로 활성화 시 표시 (24시간마다 재질문) */}
          {visitSourceEnabled && visitSourceOptions.length > 0 && !successData.hasVisitSource && (
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
                      onClick={() => { if (!isSelected) onVisitSourceSelect?.(); setSelectedVisitSource(isSelected ? null : option.id); }}
                      className={`px-3 py-2.5 rounded-lg text-[14px] font-medium transition-all ${isSelected
                          ? 'bg-[#6BA3FF] text-white border border-[#6BA3FF]'
                          : 'bg-neutral-50 text-neutral-600 border border-neutral-200 hover:border-neutral-300'
                        }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Preferred Categories - 조건부 표시: 방문 경로가 활성화되어 있으면 숨김 */}
          {!successData.hasExistingPreferences && !visitSourceEnabled && (
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
                      className={`px-3 py-2.5 rounded-lg text-[14px] font-medium transition-all ${selectedCategories.includes(ALL_CATEGORIES_VALUE)
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
                          className={`px-3 py-2.5 rounded-lg text-[14px] font-medium transition-all ${isSelected
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
                      className={`flex-shrink-0 px-3 py-2.5 rounded-lg text-[14px] font-medium transition-all ${selectedCategories.includes(ALL_CATEGORIES_VALUE)
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
                          className={`flex-shrink-0 px-3 py-2.5 rounded-lg text-[14px] font-medium transition-all ${isSelected
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

          {/* Feedback Text */}
          <div className="mb-4">
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="매장 경험에 대한 솔직한 피드백을 남겨주시면 감사하겠습니다."
              className="w-full h-[84px] px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-lg resize-none text-[14px] text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#FFD541] focus:border-transparent"
            />
          </div>

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
                  <div className="space-y-3 mb-6">
                    {surveyQuestions.map((q) => (
                      <div key={q.id} className="flex flex-col gap-1.5 items-center">
                        <label className="text-[14px] font-medium text-neutral-700 text-center whitespace-pre-line">
                          {q.label}
                        </label>
                        {q.description && (
                          <p className="text-[12px] text-neutral-400 text-center whitespace-pre-line">{q.description}</p>
                        )}
                        {q.type === 'DATE' && (
                          <input
                            type="date"
                            value={surveyAnswers[q.id] || ''}
                            onChange={(e) =>
                              setSurveyAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                            }
                            className="w-full max-w-[280px] px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-lg text-[14px] text-neutral-900 text-center focus:outline-none focus:ring-2 focus:ring-[#FFD541] focus:border-transparent"
                          />
                        )}
                        {q.type === 'TEXT' && (
                          <input
                            type="text"
                            value={surveyAnswers[q.id] || ''}
                            onChange={(e) =>
                              setSurveyAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                            }
                            placeholder="답변을 입력해주세요"
                            className="w-full max-w-[280px] px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-lg text-[14px] text-neutral-900 text-center focus:outline-none focus:ring-2 focus:ring-[#FFD541] focus:border-transparent"
                          />
                        )}
                        {q.type === 'CHOICE' && q.choiceOptions && (
                          <div className="w-full max-w-[280px] space-y-2">
                            {q.choiceOptions.map((opt, idx) => (
                              <button
                                key={idx}
                                onClick={() =>
                                  setSurveyAnswers((prev) => ({ ...prev, [q.id]: opt }))
                                }
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

          {/* Buttons */}
          <div className="flex gap-3 pb-2">
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
          </div>
        </div>
      </div>
    </div>
  );
}
