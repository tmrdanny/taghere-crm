'use client';

import { useState, useEffect, useCallback } from 'react';
import { Gift, Check, X, ChevronLeft, ChevronRight, Phone } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface RewardClaim {
  id: string;
  franchiseId: string;
  franchiseCustomerId: string;
  tier: number;
  rewardDescription: string;
  status: 'PENDING' | 'COMPLETED' | 'REJECTED';
  customerName: string | null;
  customerPhone: string | null;
  stampLedgerId: string | null;
  processedAt: string | null;
  createdAt: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  PENDING: { label: '대기중', color: 'text-amber-700', bg: 'bg-amber-50' },
  COMPLETED: { label: '수령완료', color: 'text-green-700', bg: 'bg-green-50' },
  REJECTED: { label: '거절', color: 'text-red-700', bg: 'bg-red-50' },
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const h = d.getHours().toString().padStart(2, '0');
  const min = d.getMinutes().toString().padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}`;
}

function formatPhone(phone: string | null): string {
  if (!phone) return '-';
  // 11자리 숫자면 하이픈 포맷팅
  const cleaned = phone.replace(/[^0-9]/g, '');
  if (cleaned.length === 11) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
}

export default function RewardClaimsPage() {
  const [claims, setClaims] = useState<RewardClaim[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const fetchClaims = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('franchiseToken');
      const params = new URLSearchParams({
        status: statusFilter,
        page: page.toString(),
        limit: '20',
      });
      const res = await fetch(`${API_BASE}/api/franchise/reward-claims?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setClaims(data.claims);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      }
    } catch (e) {
      console.error('Failed to fetch reward claims:', e);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => {
    fetchClaims();
  }, [fetchClaims]);

  const handleStatusChange = async (claimId: string, newStatus: 'COMPLETED' | 'REJECTED') => {
    const confirmMsg = newStatus === 'COMPLETED'
      ? '보상 수령 완료 처리하시겠습니까?'
      : '보상 신청을 거절하시겠습니까? 스탬프가 복원됩니다.';

    if (!confirm(confirmMsg)) return;

    setProcessing(claimId);
    try {
      const token = localStorage.getItem('franchiseToken');
      const res = await fetch(`${API_BASE}/api/franchise/reward-claims/${claimId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        fetchClaims();
      } else {
        const data = await res.json();
        alert(data.error || '처리에 실패했습니다.');
      }
    } catch {
      alert('처리 중 오류가 발생했습니다.');
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="p-4 lg:p-8 max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <Gift className="w-6 h-6 text-amber-500" />
          <h1 className="text-2xl font-bold text-slate-900">보상 신청</h1>
        </div>
        <p className="text-sm text-slate-500 ml-9">
          고객이 마이페이지에서 신청한 보상 수령 요청을 관리합니다.
        </p>
      </div>

      {/* Status Filter */}
      <div className="flex gap-2 mb-4">
        {[
          { value: 'PENDING', label: '대기중' },
          { value: 'COMPLETED', label: '수령완료' },
          { value: 'REJECTED', label: '거절' },
          { value: 'ALL', label: '전체' },
        ].map((filter) => (
          <button
            key={filter.value}
            onClick={() => { setStatusFilter(filter.value); setPage(1); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === filter.value
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {filter.label}
            {filter.value === 'PENDING' && total > 0 && statusFilter === 'PENDING' && (
              <span className="ml-1.5 bg-amber-400 text-slate-900 text-xs font-bold px-1.5 py-0.5 rounded-full">
                {total}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-600 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-400">불러오는 중...</p>
          </div>
        ) : claims.length === 0 ? (
          <div className="p-12 text-center">
            <Gift className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400">
              {statusFilter === 'PENDING' ? '대기 중인 보상 신청이 없습니다.' : '보상 신청 내역이 없습니다.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 font-medium text-slate-500">고객명</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">전화번호</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">보상</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-500">스탬프</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500">신청일</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-500">상태</th>
                  {statusFilter === 'PENDING' && (
                    <th className="text-center px-4 py-3 font-medium text-slate-500">처리</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {claims.map((claim) => {
                  const status = STATUS_LABELS[claim.status] || STATUS_LABELS.PENDING;
                  const isProcessing = processing === claim.id;

                  return (
                    <tr key={claim.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {claim.customerName || '-'}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        <div className="flex items-center gap-1.5">
                          {claim.customerPhone ? (
                            <>
                              <span>{formatPhone(claim.customerPhone)}</span>
                              <a
                                href={`tel:${claim.customerPhone}`}
                                className="text-blue-500 hover:text-blue-600"
                                title="전화하기"
                              >
                                <Phone className="w-3.5 h-3.5" />
                              </a>
                            </>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-900 font-medium">
                        {claim.rewardDescription}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-600">
                        {claim.tier}개
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {formatDate(claim.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${status.color} ${status.bg}`}>
                          {status.label}
                        </span>
                      </td>
                      {statusFilter === 'PENDING' && (
                        <td className="px-4 py-3 text-center">
                          {claim.status === 'PENDING' && (
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleStatusChange(claim.id, 'COMPLETED')}
                                disabled={isProcessing}
                                className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors disabled:opacity-50"
                                title="수령 완료"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleStatusChange(claim.id, 'REJECTED')}
                                disabled={isProcessing}
                                className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
                                title="거절 (스탬프 복원)"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
            <p className="text-sm text-slate-500">총 {total}건</p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-slate-600 px-3">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
