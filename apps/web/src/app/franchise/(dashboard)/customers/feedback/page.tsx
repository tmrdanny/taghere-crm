'use client';

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

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

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
          className={`w-4 h-4 ${
            star <= rating
              ? 'fill-yellow-400 text-yellow-400'
              : 'fill-none text-slate-300'
          }`}
        />
      ))}
    </div>
  );

  if (loading && feedbacks.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-franchise-700 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* 헤더 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">고객 피드백</h1>
        <p className="text-sm text-slate-500 mt-1">
          전체 매장의 고객 피드백을 조회하고 관리할 수 있습니다.
        </p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <p className="text-sm text-slate-500 mb-1">총 피드백 수</p>
          <p className="text-3xl font-bold text-slate-900">{totalCount.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <p className="text-sm text-slate-500 mb-1">평균 별점</p>
          <div className="flex items-center gap-2">
            <p className="text-3xl font-bold text-slate-900">{averageRating.toFixed(1)}</p>
            <StarRating rating={Math.round(averageRating)} />
          </div>
        </div>
      </div>

      {/* 필터 & 다운로드 */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* 매장 필터 */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700">매장</label>
            <select
              value={selectedStoreId}
              onChange={(e) => {
                setSelectedStoreId(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-franchise-700"
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
            <label className="text-sm font-medium text-slate-700">별점</label>
            <select
              value={selectedRating}
              onChange={(e) => {
                setSelectedRating(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-franchise-700"
            >
              <option value="all">전체</option>
              <option value="5">⭐️ 5점</option>
              <option value="4">⭐️ 4점</option>
              <option value="3">⭐️ 3점</option>
              <option value="2">⭐️ 2점</option>
              <option value="1">⭐️ 1점</option>
            </select>
          </div>

          {/* 텍스트 필터 */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={hasTextOnly}
              onChange={(e) => {
                setHasTextOnly(e.target.checked);
                setPage(1);
              }}
              className="w-4 h-4 rounded border-slate-300 text-franchise-700 focus:ring-franchise-700"
            />
            <span className="text-sm text-slate-700">텍스트가 있는 피드백만</span>
          </label>

          {/* 엑셀 다운로드 */}
          <button
            onClick={handleDownloadExcel}
            className="ml-auto flex items-center gap-2 px-4 py-2 bg-franchise-700 text-white rounded-lg hover:bg-franchise-700/90 transition-colors text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            엑셀 다운로드
          </button>
        </div>
      </div>

      {/* 피드백 테이블 */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-franchise-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-franchise-700 uppercase">매장</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-franchise-700 uppercase">별점</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-franchise-700 uppercase">고객명</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-franchise-700 uppercase">전화번호</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-franchise-700 uppercase w-1/3">피드백</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-franchise-700 uppercase">작성일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {feedbacks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    피드백이 없습니다.
                  </td>
                </tr>
              ) : (
                feedbacks.map((feedback) => (
                  <tr key={feedback.id} className="hover:bg-franchise-50/50 transition-colors">
                    <td className="px-6 py-4 text-sm text-slate-900">{feedback.storeName}</td>
                    <td className="px-6 py-4">
                      <StarRating rating={feedback.rating} />
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-900">{feedback.customerName}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{feedback.customerPhone || '-'}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {feedback.text || (
                        <span className="text-slate-400 italic">작성된 피드백 없음</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
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
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200">
            <p className="text-sm text-slate-600">
              총 {totalCount.toLocaleString()}개의 피드백
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-3 py-1 border border-slate-200 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-franchise-50 transition-colors"
              >
                이전
              </button>
              <span className="text-sm text-slate-600">
                {page} 페이지
              </span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={feedbacks.length < limit}
                className="px-3 py-1 border border-slate-200 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-franchise-50 transition-colors"
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
