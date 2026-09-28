'use client';

import { API_BASE } from '@/lib/api-config';
import { useState, useEffect, useCallback } from 'react';
import { Gift, Check, X, ChevronLeft, ChevronRight, Phone } from 'lucide-react';


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
  PENDING: { label: '대기중', color: 'text-[color:var(--ad-ink)]', bg: 'bg-[color:var(--ad-bg)]' },
  COMPLETED: { label: '수령완료', color: 'text-[color:var(--ad-muted)]', bg: 'bg-[color:var(--ad-bg)]' },
  REJECTED: { label: '거절', color: 'text-[color:var(--ad-faint)]', bg: 'bg-[color:var(--ad-bg)]' },
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
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-6 sm:px-8 lg:pt-8">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-[color:var(--ad-ink)]">스탬프 보상 신청</h1>
        <p className="mt-1 text-[13px] text-[color:var(--ad-muted)]">
          고객이 마이페이지에서 신청한 보상 수령 요청을 관리합니다.
        </p>
      </div>

      {/* Status Filter */}
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          { value: 'PENDING', label: '대기중' },
          { value: 'COMPLETED', label: '수령완료' },
          { value: 'REJECTED', label: '거절' },
          { value: 'ALL', label: '전체' },
        ].map((filter) => (
          <button
            key={filter.value}
            onClick={() => { setStatusFilter(filter.value); setPage(1); }}
            className={`ad-press inline-flex h-9 items-center rounded-full px-3.5 text-[13px] font-medium transition-colors ${
              statusFilter === filter.value
                ? 'bg-[color:var(--ad-ink)] text-white'
                : 'bg-white text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)]'
            }`}
          >
            {filter.label}
            {filter.value === 'PENDING' && total > 0 && statusFilter === 'PENDING' && (
              <span className="ad-tnum ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[11px] font-medium">
                {total}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="ad-card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-[color:var(--ad-ink)] border-t-transparent" />
            <p className="text-[13px] text-[color:var(--ad-faint)]">불러오는 중...</p>
          </div>
        ) : claims.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--ad-bg)]">
              <Gift className="h-5 w-5 text-[color:var(--ad-faint)]" strokeWidth={1.7} />
            </div>
            <p className="text-[13px] text-[color:var(--ad-faint)]">
              {statusFilter === 'PENDING' ? '대기 중인 보상 신청이 없습니다.' : '보상 신청 내역이 없습니다.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[color:var(--ad-line)] bg-[color:var(--ad-bg-alt)] text-left text-[11.5px] text-[color:var(--ad-muted)]">
                  <th className="px-4 py-2.5 text-left font-medium">고객명</th>
                  <th className="px-4 py-2.5 text-left font-medium">전화번호</th>
                  <th className="px-4 py-2.5 text-left font-medium">보상</th>
                  <th className="px-4 py-2.5 text-center font-medium">스탬프</th>
                  <th className="px-4 py-2.5 text-left font-medium">신청일</th>
                  <th className="px-4 py-2.5 text-center font-medium">상태</th>
                  {statusFilter === 'PENDING' && (
                    <th className="px-4 py-2.5 text-center font-medium">처리</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--ad-line)]">
                {claims.map((claim) => {
                  const status = STATUS_LABELS[claim.status] || STATUS_LABELS.PENDING;
                  const isProcessing = processing === claim.id;

                  return (
                    <tr key={claim.id} className="transition-colors hover:bg-[color:var(--ad-bg-alt)]">
                      <td className="px-4 py-3 font-medium text-[color:var(--ad-ink)]">
                        {claim.customerName || '-'}
                      </td>
                      <td className="ad-tnum px-4 py-3 text-[color:var(--ad-ink-2)]">
                        <div className="flex items-center gap-1.5">
                          {claim.customerPhone ? (
                            <>
                              <span>{formatPhone(claim.customerPhone)}</span>
                              <a
                                href={`tel:${claim.customerPhone}`}
                                className="rounded-[6px] p-1 text-[color:var(--ad-faint)] hover:bg-[color:var(--ad-bg)] hover:text-[color:var(--ad-ink)]"
                                title="전화하기"
                              >
                                <Phone className="h-3.5 w-3.5" strokeWidth={1.8} />
                              </a>
                            </>
                          ) : (
                            <span className="text-[color:var(--ad-faint)]">-</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-[color:var(--ad-ink)]">
                        {claim.rewardDescription}
                      </td>
                      <td className="ad-tnum px-4 py-3 text-center text-[color:var(--ad-ink-2)]">
                        {claim.tier}개
                      </td>
                      <td className="ad-tnum px-4 py-3 text-[12.5px] text-[color:var(--ad-muted)]">
                        {formatDate(claim.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${status.color} ${status.bg}`}>
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
                                className="ad-press inline-flex h-8 w-8 items-center justify-center rounded-[8px] bg-white text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] transition-colors hover:bg-[color:var(--ad-bg-alt)] disabled:opacity-40"
                                title="수령 완료"
                              >
                                <Check className="h-4 w-4" strokeWidth={1.8} />
                              </button>
                              <button
                                onClick={() => handleStatusChange(claim.id, 'REJECTED')}
                                disabled={isProcessing}
                                className="ad-press inline-flex h-8 w-8 items-center justify-center rounded-[8px] bg-white text-[color:var(--ad-neg)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] transition-colors hover:bg-[color:var(--ad-bg-alt)] disabled:opacity-40"
                                title="거절 (스탬프 복원)"
                              >
                                <X className="h-4 w-4" strokeWidth={1.8} />
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
          <div className="flex items-center justify-between border-t border-[color:var(--ad-line)] px-4 py-3">
            <p className="ad-tnum text-[12.5px] text-[color:var(--ad-muted)]">총 {total}건</p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[color:var(--ad-ink-2)] hover:bg-[color:var(--ad-bg-alt)] disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="ad-tnum px-3 text-[12.5px] text-[color:var(--ad-muted)]">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[color:var(--ad-ink-2)] hover:bg-[color:var(--ad-bg-alt)] disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
