'use client';

import { API_BASE } from '@/lib/api-config';
import { useCallback, useEffect, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { formatDate, getRelativeTime } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Star, Filter, MessageSquare } from 'lucide-react';
import { useToast } from '@/components/ui/toast';

interface Feedback {
  id: string;
  rating: number;
  text: string | null;
  createdAt: string;
  customerName: string;
  customerPhone: string | null;
}

// 별점 컴포넌트
function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`w-4 h-4 fill-none ${star <= rating ? 'text-[color:var(--ad-muted)]' : 'text-[color:var(--ad-line-strong)]'}`}
          strokeWidth={1.8}
        />
      ))}
    </div>
  );
}

export default function FeedbackPage() {
  const { showToast, ToastComponent } = useToast();
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [hasTextFilter, setHasTextFilter] = useState(false);


  // showToast를 ref로 저장하여 의존성 문제 해결
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  const fetchFeedbacks = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('로그인이 필요합니다.');
      }

      const offset = (page - 1) * pageSize;
      let url = `${API_BASE}/api/dashboard/feedbacks?limit=${pageSize}&offset=${offset}`;
      if (ratingFilter !== null) {
        url += `&rating=${ratingFilter}`;
      }
      if (hasTextFilter) {
        url += `&hasText=true`;
      }

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        throw new Error('피드백 목록을 불러오는데 실패했습니다.');
      }

      const data = await res.json();
      setFeedbacks(data.feedbacks);
      setTotal(data.total);
      setHasMore(data.hasMore);
    } catch (err: any) {
      showToastRef.current(err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, ratingFilter, hasTextFilter]);

  useEffect(() => {
    fetchFeedbacks();
  }, [fetchFeedbacks]);

  const totalPages = Math.ceil(total / pageSize);

  const handleRatingFilter = (rating: number | null) => {
    setRatingFilter(rating);
    setPage(1);
    setShowFilterDropdown(false);
  };

  const handleHasTextFilter = () => {
    setHasTextFilter(!hasTextFilter);
    setPage(1);
  };

  // 피드백 통계 계산
  const stats = {
    total,
    averageRating: feedbacks.length > 0
      ? (feedbacks.reduce((sum, f) => sum + f.rating, 0) / feedbacks.length).toFixed(1)
      : '0.0',
  };

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 sm:px-8 lg:pt-8 space-y-5">
      {ToastComponent}

      {/* 헤더 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-[color:var(--ad-ink)]">고객 피드백</h1>
          <p className="mt-1 text-[13px] text-[color:var(--ad-muted)]">고객들이 남긴 평점과 피드백을 확인하세요</p>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="ad-card grid grid-cols-2">
        <div className="p-5">
          <div className="text-[12px] text-[color:var(--ad-muted)]">전체 피드백</div>
          <div className="ad-tnum mt-1 text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">{total}개</div>
        </div>
        <div className="border-l border-[color:var(--ad-line)] p-5">
          <div className="text-[12px] text-[color:var(--ad-muted)]">평균 평점</div>
          <div className="mt-1 flex items-center gap-2">
            <span className="ad-tnum text-[20px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">{stats.averageRating}</span>
            <Star className="h-4 w-4 fill-none text-[color:var(--ad-faint)]" strokeWidth={1.8} />
          </div>
        </div>
      </div>

      {/* 필터 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Button
              variant="outline"
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              className="ad-press h-9 rounded-[10px] border-0 bg-white px-3.5 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] flex items-center gap-2"
            >
              <Filter className="w-3.5 h-3.5" strokeWidth={1.8} />
              {ratingFilter !== null ? (
                <div className="flex gap-0.5">
                  {[...Array(ratingFilter)].map((_, i) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-none text-[color:var(--ad-muted)]" strokeWidth={1.8} />
                  ))}
                </div>
              ) : '전체 평점'}
            </Button>

            {showFilterDropdown && (
              <div className="absolute left-0 top-full z-10 mt-1 min-w-[140px] overflow-hidden rounded-[12px] border border-[color:var(--ad-line)] bg-white py-1 shadow-[0_16px_40px_-16px_rgba(29,32,34,0.25)]">
                <button
                  onClick={() => handleRatingFilter(null)}
                  className={`w-full px-4 py-2.5 text-left text-[13px] hover:bg-[color:var(--ad-bg-alt)] ${ratingFilter === null ? 'bg-[color:var(--ad-bg)] font-medium text-[color:var(--ad-ink)]' : ''}`}
                >
                  전체
                </button>
                {[5, 4, 3, 2, 1].map((rating) => (
                  <button
                    key={rating}
                    onClick={() => handleRatingFilter(rating)}
                    className={`w-full px-4 py-2.5 text-left text-[13px] hover:bg-[color:var(--ad-bg-alt)] flex items-center ${ratingFilter === rating ? 'bg-[color:var(--ad-bg)] font-medium text-[color:var(--ad-ink)]' : ''}`}
                  >
                    <div className="flex gap-0.5">
                      {[...Array(rating)].map((_, i) => (
                        <Star key={i} className="w-3.5 h-3.5 fill-none text-[color:var(--ad-muted)]" strokeWidth={1.8} />
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <Button
            variant={hasTextFilter ? 'default' : 'outline'}
            onClick={handleHasTextFilter}
            className={`ad-press flex h-9 items-center gap-2 rounded-[10px] px-3.5 text-[13px] ${hasTextFilter ? 'border-0 bg-[color:var(--ad-ink)] font-medium text-white hover:bg-[#383c40]' : 'border-0 bg-white font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]'}`}
          >
            <MessageSquare className="w-3.5 h-3.5" strokeWidth={1.8} />
            텍스트 리뷰만
          </Button>
        </div>

        <div className="ad-tnum text-[12.5px] text-[color:var(--ad-muted)]">
          총 {total}개의 피드백
        </div>
      </div>

      {/* 피드백 목록 */}
      <div className="ad-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-[13px] text-[color:var(--ad-faint)]">
            <div className="animate-spin w-8 h-8 border-2 border-[color:var(--ad-ink)] border-t-transparent rounded-full mx-auto mb-2" />
            로딩 중...
          </div>
        ) : feedbacks.length === 0 ? (
          <div className="p-8 text-center text-[13px] text-[color:var(--ad-faint)]">
            <MessageSquare className="mx-auto mb-2 h-8 w-8 text-[color:var(--ad-line-strong)]" strokeWidth={1.7} />
            <p>아직 피드백이 없습니다</p>
          </div>
        ) : (
          <div className="divide-y divide-[color:var(--ad-line)]">
            {feedbacks.map((feedback) => (
              <div key={feedback.id} className="px-5 py-4 transition-colors hover:bg-[color:var(--ad-bg-alt)]">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <StarRating rating={feedback.rating} />
                      <span className="text-[13px] font-medium text-[color:var(--ad-ink)]">
                        {feedback.customerName}
                      </span>
                      {feedback.customerPhone && (
                        <span className="text-[13px] text-[color:var(--ad-faint)]">
                          {feedback.customerPhone}
                        </span>
                      )}
                    </div>
                    {feedback.text ? (
                      <p className="text-[13px] text-[color:var(--ad-ink-2)] whitespace-pre-wrap">
                        {feedback.text}
                      </p>
                    ) : (
                      <p className="text-[13px] text-[color:var(--ad-faint)] italic">
                        작성된 피드백 없음
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-[12px] text-[color:var(--ad-faint)]">
                      {getRelativeTime(feedback.createdAt)}
                    </div>
                    <div className="text-[12px] text-[color:var(--ad-faint)] mt-0.5">
                      {formatDate(feedback.createdAt)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="ad-press h-9 rounded-[10px] border-0 bg-white px-3.5 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] px-2.5"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="ad-tnum text-[13px] text-[color:var(--ad-muted)]">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="ad-press h-9 rounded-[10px] border-0 bg-white px-3.5 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] px-2.5"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
