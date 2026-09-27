'use client';

import { API_BASE } from '@/lib/api-config';
import { useEffect, useState } from 'react';
import { Star, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

interface Feedback {
  id: string;
  rating: number;
  text: string | null;
  createdAt: string;
  customerName: string;
  customerPhone: string | null;
  storeName: string;
  storeId: string;
}

interface Store {
  id: string;
  name: string;
}

export default function FranchiseFeedbackPage() {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [averageRating, setAverageRating] = useState(0);

  // 필터 상태
  const [selectedStoreId, setSelectedStoreId] = useState<string>('all');
  const [selectedRating, setSelectedRating] = useState<string>('all');
  const [hasTextOnly, setHasTextOnly] = useState(false);

  // 페이지네이션
  const [page, setPage] = useState(1);
  const limit = 20;

  const API_URL = API_BASE;

  useEffect(() => {
    fetchSummary();
  }, []);

  useEffect(() => {
    fetchFeedbacks();
  }, [selectedStoreId, selectedRating, hasTextOnly, page]);

  const fetchSummary = async () => {
    try {
      const token = localStorage.getItem('franchiseToken');
      const res = await fetch(`${API_URL}/api/franchise/feedbacks/summary`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setTotalCount(data.totalCount);
      setAverageRating(data.averageRating);
    } catch (error) {
      console.error('Failed to fetch summary:', error);
    }
  };

  const fetchFeedbacks = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('franchiseToken');
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: ((page - 1) * limit).toString(),
      });

      if (selectedStoreId !== 'all') params.append('storeId', selectedStoreId);
      if (selectedRating !== 'all') params.append('rating', selectedRating);
      if (hasTextOnly) params.append('hasText', 'true');

      const res = await fetch(`${API_URL}/api/franchise/feedbacks?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Failed to fetch feedbacks');

      const data = await res.json();
      setFeedbacks(data.feedbacks);
      setStores(data.stores);
    } catch (error) {
      console.error('Failed to fetch feedbacks:', error);
      alert('피드백 조회에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadExcel = async () => {
    try {
      const token = localStorage.getItem('franchiseToken');
      const params = new URLSearchParams({ limit: '10000', offset: '0' });
      if (selectedStoreId !== 'all') params.append('storeId', selectedStoreId);
      if (selectedRating !== 'all') params.append('rating', selectedRating);
      if (hasTextOnly) params.append('hasText', 'true');

      const res = await fetch(`${API_URL}/api/franchise/feedbacks?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();

      const excelData = data.feedbacks.map((f: Feedback) => ({
        '매장명': f.storeName,
        '별점': f.rating,
        '고객명': f.customerName,
        '전화번호': f.customerPhone || '-',
        '피드백': f.text || '작성된 피드백 없음',
        '작성일': new Date(f.createdAt).toLocaleString('ko-KR')
      }));

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '고객 피드백');

      const fileName = `고객_피드백_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);
    } catch (error) {
      console.error('Excel download failed:', error);
      alert('엑셀 다운로드에 실패했습니다.');
    }
  };

  const StarRating = ({ rating }: { rating: number }) => (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          strokeWidth={1.7}
          className={`h-4 w-4 fill-none ${
            star <= rating
              ? 'text-[color:var(--ad-ink-2)]'
              : 'text-[#d1d3d6]'
          }`}
        />
      ))}
    </div>
  );

  if (loading && feedbacks.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[color:var(--ad-ink)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 sm:px-8 lg:pt-8">
      {/* 헤더 */}
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-[color:var(--ad-ink)]">고객 피드백</h1>
        <p className="mt-1 text-[13px] text-[color:var(--ad-muted)]">
          전체 매장의 고객 피드백을 조회하고 관리할 수 있습니다.
        </p>
      </div>

      {/* 통계 카드 */}
      <div className="ad-card mb-4 grid grid-cols-1 md:grid-cols-2">
        <div className="p-5">
          <p className="mb-1 text-[12px] text-[color:var(--ad-muted)]">총 피드백 수</p>
          <p className="ad-tnum text-[24px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">{totalCount.toLocaleString()}</p>
        </div>
        <div className="border-t border-[color:var(--ad-line)] p-5 md:border-l md:border-t-0">
          <p className="mb-1 text-[12px] text-[color:var(--ad-muted)]">평균 별점</p>
          <div className="flex items-center gap-2">
            <p className="ad-tnum text-[24px] font-medium tracking-[-0.03em] text-[color:var(--ad-ink)]">{averageRating.toFixed(1)}</p>
            <StarRating rating={Math.round(averageRating)} />
          </div>
        </div>
      </div>

      {/* 필터 & 다운로드 */}
      <div className="ad-card mb-4 p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* 매장 필터 */}
          <div className="flex items-center gap-2">
            <label className="text-[13px] font-medium text-[color:var(--ad-ink-2)]">매장</label>
            <select
              value={selectedStoreId}
              onChange={(e) => {
                setSelectedStoreId(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13px] text-[color:var(--ad-ink-2)] focus:border-[color:var(--ad-navy)] focus:outline-none"
            >
              <option value="all">전체 매장</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </div>

          {/* 별점 필터 */}
          <div className="flex items-center gap-2">
            <label className="text-[13px] font-medium text-[color:var(--ad-ink-2)]">별점</label>
            <select
              value={selectedRating}
              onChange={(e) => {
                setSelectedRating(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13px] text-[color:var(--ad-ink-2)] focus:border-[color:var(--ad-navy)] focus:outline-none"
            >
              <option value="all">전체</option>
              <option value="5">5점</option>
              <option value="4">4점</option>
              <option value="3">3점</option>
              <option value="2">2점</option>
              <option value="1">1점</option>
            </select>
          </div>

          {/* 텍스트 필터 */}
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={hasTextOnly}
              onChange={(e) => {
                setHasTextOnly(e.target.checked);
                setPage(1);
              }}
              className="h-4 w-4 rounded border-[color:var(--ad-line-strong)] accent-[#131651]"
            />
            <span className="text-[13px] text-[color:var(--ad-ink-2)]">텍스트가 있는 피드백만</span>
          </label>

          {/* 엑셀 다운로드 */}
          <button
            onClick={handleDownloadExcel}
            className="ad-press ml-auto inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] bg-white px-3.5 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]"
          >
            <Download className="h-4 w-4" strokeWidth={1.8} />
            엑셀 다운로드
          </button>
        </div>
      </div>

      {/* 피드백 테이블 */}
      <div className="ad-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[color:var(--ad-line)] bg-[color:var(--ad-bg-alt)] text-left text-[11.5px] text-[color:var(--ad-muted)]">
                <th className="px-4 py-2.5 text-left font-medium">매장</th>
                <th className="px-4 py-2.5 text-left font-medium">별점</th>
                <th className="px-4 py-2.5 text-left font-medium">고객명</th>
                <th className="px-4 py-2.5 text-left font-medium">전화번호</th>
                <th className="w-1/3 px-4 py-2.5 text-left font-medium">피드백</th>
                <th className="px-4 py-2.5 text-left font-medium">작성일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--ad-line)]">
              {feedbacks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-[13px] text-[color:var(--ad-faint)]">
                    피드백이 없습니다.
                  </td>
                </tr>
              ) : (
                feedbacks.map((feedback) => (
                  <tr key={feedback.id} className="transition-colors hover:bg-[color:var(--ad-bg-alt)]">
                    <td className="px-4 py-3 font-medium text-[color:var(--ad-ink)]">{feedback.storeName}</td>
                    <td className="px-4 py-3">
                      <StarRating rating={feedback.rating} />
                    </td>
                    <td className="px-4 py-3 text-[color:var(--ad-ink)]">{feedback.customerName}</td>
                    <td className="ad-tnum px-4 py-3 text-[color:var(--ad-ink-2)]">{feedback.customerPhone || '-'}</td>
                    <td className="px-4 py-3 text-[color:var(--ad-ink-2)]">
                      {feedback.text || (
                        <span className="text-[color:var(--ad-faint)]">작성된 피드백 없음</span>
                      )}
                    </td>
                    <td className="ad-tnum px-4 py-3 text-[color:var(--ad-muted)]">
                      {new Date(feedback.createdAt).toLocaleDateString('ko-KR')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        {feedbacks.length > 0 && (
          <div className="flex items-center justify-between border-t border-[color:var(--ad-line)] px-4 py-3">
            <p className="ad-tnum text-[12.5px] text-[color:var(--ad-muted)]">
              총 {totalCount.toLocaleString()}개의 피드백
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="ad-press h-8 rounded-[8px] bg-white px-3 text-[12.5px] text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] transition-colors hover:bg-[color:var(--ad-bg-alt)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                이전
              </button>
              <span className="ad-tnum text-[12.5px] text-[color:var(--ad-muted)]">
                {page} 페이지
              </span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={feedbacks.length < limit}
                className="ad-press h-8 rounded-[8px] bg-white px-3 text-[12.5px] text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] transition-colors hover:bg-[color:var(--ad-bg-alt)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                다음
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
