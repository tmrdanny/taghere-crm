'use client';

import { API_BASE } from '@/lib/api-config';
import { useCallback, useEffect, useRef, useState } from 'react';

interface ApprovalRequest {
  id: string;
  createdAt: string;
  expiresAt: string;
  customer: {
    id: string;
    name: string | null;
    phoneLastDigits: string | null;
    totalStamps: number;
  };
}

// 매번 적립 개수 직접 입력 모드: 고객이 적립하기를 누르면 생성되는 승인 요청을
// 대시보드 어디에서든 팝업으로 띄워 직원이 개수를 입력해 승인/취소하게 한다.
export function StampApprovalWatcher() {
  const [enabled, setEnabled] = useState(false);
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [countInput, setCountInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 매장 설정 확인 — manualStampCountEnabled 매장만 폴링
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch(`${API_BASE}/api/stamp-settings`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.manualStampCountEnabled) setEnabled(true);
      })
      .catch(() => {});
  }, []);

  const fetchPending = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/stamps/approval-requests/pending`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setRequests(data.requests || []);
    } catch {
      // 다음 폴링에서 재시도
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    fetchPending();
    const interval = setInterval(fetchPending, 4000);
    return () => clearInterval(interval);
  }, [enabled, fetchPending]);

  const current = requests[0] || null;

  // 새 요청이 표시되면 입력 초기화 + 포커스
  useEffect(() => {
    if (current) {
      setCountInput('');
      setActionError(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDecision = async (action: 'approve' | 'reject') => {
    if (!current || submitting) return;
    const count = parseInt(countInput, 10);
    if (action === 'approve' && (!Number.isInteger(count) || count < 1)) {
      setActionError('적립할 스탬프 개수를 입력해주세요.');
      return;
    }
    setSubmitting(true);
    setActionError(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/stamps/approval-requests/${current.id}/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: action === 'approve' ? JSON.stringify({ count }) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(data.error || '처리 중 오류가 발생했습니다.');
      }
      await fetchPending();
    } catch {
      setActionError('처리 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!enabled || !current) return null;

  const customerLabel = current.customer.name
    || (current.customer.phoneLastDigits ? `고객 (끝번호 ${current.customer.phoneLastDigits.slice(-4)})` : '고객');
  const requestedAt = new Date(current.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl">🎫</span>
          <h2 className="text-lg font-bold text-neutral-900">스탬프 적립 요청</h2>
        </div>
        <p className="text-sm text-neutral-500 mb-4">
          <span className="font-semibold text-neutral-800">{customerLabel}</span>님이 스탬프 적립을 요청했어요. ({requestedAt})
          <br />현재 보유: {current.customer.totalStamps}개
          {requests.length > 1 && (
            <span className="block mt-1 text-xs text-amber-600">외 {requests.length - 1}건 대기 중</span>
          )}
        </p>

        <label className="block text-sm font-medium text-neutral-900 mb-1.5">적립할 스탬프 개수</label>
        <input
          ref={inputRef}
          type="number"
          inputMode="numeric"
          min={1}
          value={countInput}
          onChange={(e) => setCountInput(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => { if (e.key === 'Enter') handleDecision('approve'); }}
          placeholder="예: 2"
          className="w-full h-12 border border-neutral-200 rounded-xl px-4 text-lg font-semibold text-center focus:outline-none focus:ring-2 focus:ring-[#FFD541] mb-2"
        />
        {actionError && <p className="text-sm text-red-500 mb-2">{actionError}</p>}

        <div className="flex gap-2 mt-2">
          <button
            onClick={() => handleDecision('reject')}
            disabled={submitting}
            className="flex-1 h-12 rounded-xl border border-neutral-200 text-neutral-600 font-semibold disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={() => handleDecision('approve')}
            disabled={submitting || !countInput}
            className="flex-1 h-12 rounded-xl bg-[#FFD541] text-neutral-900 font-bold disabled:opacity-50"
          >
            {submitting ? '처리 중...' : '적립'}
          </button>
        </div>
      </div>
    </div>
  );
}
