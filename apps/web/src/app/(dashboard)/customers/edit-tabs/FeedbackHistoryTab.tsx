import { formatDate } from '@/lib/utils';
import { CustomerFeedbackEntry } from '../types';
import { StarRating } from '../StarRating';

// 고객 상세 모달의 피드백 탭.
export function FeedbackHistoryTab({
  feedbackHistory,
  loadingHistory,
}: {
  feedbackHistory: CustomerFeedbackEntry[];
  loadingHistory: boolean;
}) {
  return (
    <div className="flex-1 overflow-hidden flex flex-col mt-3">
      {loadingHistory && (
        <div className="text-center py-4 text-neutral-500 text-sm">
          불러오는 중...
        </div>
      )}
      {!loadingHistory && (feedbackHistory?.length || 0) === 0 && (
        <div className="text-center py-4 text-neutral-500 text-sm">
          고객이 남긴 피드백이 없습니다.
        </div>
      )}
      {!loadingHistory && (feedbackHistory?.length || 0) > 0 && (
        <div className="flex-1 overflow-hidden relative">
          <div className="h-full overflow-y-auto space-y-3 pr-2 pb-4" style={{ scrollbarWidth: 'thin', scrollbarColor: '#d4d4d4 transparent' }}>
            {(feedbackHistory || []).map((feedback) => (
              <div
                key={feedback.id}
                className="p-3 bg-neutral-50 rounded-lg border border-neutral-100"
              >
                <div className="flex items-center justify-between mb-2">
                  <StarRating rating={feedback.rating} readonly />
                  <span className="text-xs text-neutral-400">
                    {formatDate(feedback.createdAt)}
                  </span>
                </div>
                {feedback.text && (
                  <p className="text-sm text-neutral-700">{feedback.text}</p>
                )}
              </div>
            ))}
          </div>
          {/* Scroll indicator gradient */}
          <div className="absolute bottom-0 left-0 right-2 h-8 bg-gradient-to-t from-white to-transparent pointer-events-none" />
        </div>
      )}
    </div>
  );
}
