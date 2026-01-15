'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { Card } from '@/components/ui/card';
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
          className={`w-4 h-4 ${star <= rating ? 'fill-yellow-400 text-yellow-400' : 'fill-none text-neutral-300'}`}
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

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

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
      let url = `${apiUrl}/api/dashboard/feedbacks?limit=${pageSize}&offset=${offset}`;
      if (ratingFilter !== null) {
        url += `&rating=${ratingFilter}`;
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
  }, [apiUrl, page, pageSize, ratingFilter]);

  useEffect(() => {
    fetchFeedbacks();
  }, [fetchFeedbacks]);

  const totalPages = Math.ceil(total / pageSize);

  const handleRatingFilter = (rating: number | null) => {
    setRatingFilter(rating);
    setPage(1);
    setShowFilterDropdown(false);
  };

  // 피드백 통계 계산
  const stats = {
    total,
    averageRating: feedbacks.length > 0
      ? (feedbacks.reduce((sum, f) => sum + f.rating, 0) / feedbacks.length).toFixed(1)
      : '0.0',
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 pb-8">
      {ToastComponent}

      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">고객 피드백</h1>
          <p className="text-neutral-500 mt-1">고객들이 남긴 평점과 피드백을 확인하세요</p>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="text-sm text-neutral-500">전체 피드백</div>
          <div className="text-2xl font-bold text-neutral-900 mt-1">{total}개</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-neutral-500">평균 평점</div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-2xl font-bold text-neutral-900">{stats.averageRating}</span>
            <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
          </div>
        </Card>
      </div>

      {/* 필터 */}
      <div className="flex items-center justify-between">
        <div className="relative">
          <Button
            variant="outline"
            onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            className="flex items-center gap-2"
          >
            <Filter className="w-4 h-4" />
            {ratingFilter !== null ? (
              <div className="flex gap-0.5">
                {[...Array(ratingFilter)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
            ) : '전체 평점'}
          </Button>

          {showFilterDropdown && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-neutral-200 rounded-lg shadow-lg z-10 min-w-[140px]">
              <button
                onClick={() => handleRatingFilter(null)}
                className={`w-full px-4 py-2.5 text-left text-sm hover:bg-neutral-50 ${ratingFilter === null ? 'bg-brand-50 text-brand-700' : ''}`}
              >
                전체
              </button>
              {[5, 4, 3, 2, 1].map((rating) => (
                <button
                  key={rating}
                  onClick={() => handleRatingFilter(rating)}
                  className={`w-full px-4 py-2.5 text-left text-sm hover:bg-neutral-50 flex items-center ${ratingFilter === rating ? 'bg-brand-50 text-brand-700' : ''}`}
                >
                  <div className="flex gap-0.5">
                    {[...Array(rating)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="text-sm text-neutral-500">
          총 {total}개의 피드백
        </div>
      </div>

      {/* 피드백 목록 */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-neutral-500">
            <div className="animate-spin w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full mx-auto mb-2" />
            로딩 중...
          </div>
        ) : feedbacks.length === 0 ? (
          <div className="p-8 text-center text-neutral-500">
            <MessageSquare className="w-12 h-12 mx-auto mb-2 text-neutral-300" />
            <p>아직 피드백이 없습니다</p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {feedbacks.map((feedback) => (
              <div key={feedback.id} className="p-4 hover:bg-neutral-50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <StarRating rating={feedback.rating} />
                      <span className="text-sm font-medium text-neutral-900">
                        {feedback.customerName}
                      </span>
                      {feedback.customerPhone && (
                        <span className="text-sm text-neutral-400">
                          {feedback.customerPhone}
                        </span>
                      )}
                    </div>
                    {feedback.text ? (
                      <p className="text-sm text-neutral-700 whitespace-pre-wrap">
                        {feedback.text}
                      </p>
                    ) : (
                      <p className="text-sm text-neutral-400 italic">
                        작성된 피드백 없음
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs text-neutral-400">
                      {getRelativeTime(feedback.createdAt)}
                    </div>
                    <div className="text-xs text-neutral-400 mt-0.5">
                      {formatDate(feedback.createdAt)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-neutral-600">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
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
