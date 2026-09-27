'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { API_BASE } from '@/lib/api-config';
import { cn, formatNumber } from '@/lib/utils';

// 예약된 발송 — 메시지 발송 화면 맨 위. 발송 2분 전까지 “예약 취소”로 취소하고 차감액을 돌려받는다.
interface Reservation {
  id: string;
  channel: string;
  channelLabel: string;
  title: string;
  targetLabel: string | null;
  sentAt: string;
  recipientCount: number;
  cost: number;
  cancelable: boolean;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit' });

export function ReservationsPanel({
  apiUrl,
  tokenKey = 'token',
  refreshKey = 0,
  showToast,
}: {
  /** /api/marketing-performance 또는 /api/franchise/marketing-performance */
  apiUrl: string;
  tokenKey?: string;
  /** 새로 예약하면 값을 바꿔 목록을 다시 불러온다 */
  refreshKey?: number;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const [items, setItems] = useState<Reservation[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const auth = useCallback(() => ({ Authorization: `Bearer ${localStorage.getItem(tokenKey) || ''}` }), [tokenKey]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}${apiUrl}/reservations`, { headers: auth() });
      if (res.ok) setItems((await res.json()).reservations ?? []);
    } catch {
      // 목록을 못 불러와도 발송 화면은 그대로 쓴다
    }
  }, [apiUrl, auth]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load, refreshKey]);

  const cancel = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`${API_BASE}${apiUrl}/reservations/${id}/cancel`, { method: 'POST', headers: auth() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '예약을 취소하지 못했어요.');
      showToast(data.message || '예약을 취소했어요.', 'success');
      setConfirmId(null);
      load();
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  if (items.length === 0) return null;

  return (
    <section className="rounded-[14px] border border-[color:var(--ad-line)] bg-[color:var(--ad-bg-alt)] p-4" aria-label="예약된 발송">
      <div className="mb-2.5 flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-[color:var(--ad-ink)]" strokeWidth={1.8} />
        <h2 className="text-[13.5px] font-semibold text-[color:var(--ad-ink)]">예약된 발송 {items.length}건</h2>
      </div>
      <ul className="grid gap-2">
        {items.map((r) => (
          <li key={r.id} className="grid gap-2 rounded-[12px] bg-white p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-[color:var(--ad-muted)]">
                <span className="rounded bg-[color:var(--ad-bg)] px-1.5 text-[color:var(--ad-ink-2)]">{r.channelLabel}</span>
                <b className="font-semibold text-[color:var(--ad-ink)]">{when(r.sentAt)}</b>
                <span className="ad-tnum">· {formatNumber(r.recipientCount)}명 · {formatNumber(r.cost)}원</span>
              </div>
              <p className="mt-0.5 truncate text-[13px] text-[color:var(--ad-ink-2)]">{r.title}</p>
            </div>
            {!r.cancelable ? (
              <span className="text-[12px] text-[color:var(--ad-faint)]">곧 발송돼요</span>
            ) : confirmId === r.id ? (
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] text-[color:var(--ad-ink-2)]">취소하고 환불할까요?</span>
                <button type="button" onClick={() => setConfirmId(null)} className="h-8 rounded-[8px] px-2.5 text-[12.5px] text-[color:var(--ad-muted)]">
                  아니요
                </button>
                <button
                  type="button"
                  onClick={() => cancel(r.id)}
                  disabled={busyId === r.id}
                  className="ad-press h-8 rounded-[8px] bg-[color:var(--ad-ink)] px-3 text-[12.5px] font-semibold text-white disabled:opacity-50"
                >
                  {busyId === r.id ? '취소 중...' : '예약 취소'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmId(r.id)}
                className={cn('ad-press h-8 rounded-[8px] bg-white px-3 text-[12.5px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)]')}
              >
                예약 취소
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
