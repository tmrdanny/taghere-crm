'use client';

import { useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { API_BASE } from '@/lib/api-config';

interface Announcement {
  id: string;
  title: string;
  content: string;
}

// 사장님 CRM 모든 탭 상단 공지 — "읽음"을 누르면 이 매장에서는 더 노출하지 않는다 (서버에 매장 단위로 기록)
export function AnnouncementBar() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch(`${API_BASE}/api/dashboard/announcements`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  const markRead = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`${API_BASE}/api/dashboard/announcements/${id}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
      });
      if (res.ok) setItems((prev) => prev.filter((a) => a.id !== id));
    } finally {
      setBusyId(null);
    }
  };

  if (items.length === 0) return null;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pt-4 sm:px-8 lg:pt-6" role="region" aria-label="공지사항">
      <div className="flex flex-col gap-2">
        {items.map((a) => (
          <div key={a.id} className="flex items-start gap-2.5 rounded-[14px] bg-white px-3.5 py-2.5 shadow-[inset_0_0_0_1px_var(--ad-line)]">
            <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center">
              <Megaphone className="h-3 w-3 text-[color:var(--ad-muted)]" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="inline-flex rounded-full bg-[color:var(--ad-bg)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ad-muted)]">공지</span>
                <span className="text-[13px] font-semibold text-[color:var(--ad-ink)]">{a.title}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-[19px] text-[color:var(--ad-muted)]">{a.content}</p>
            </div>
            <button
              type="button"
              onClick={() => markRead(a.id)}
              disabled={busyId === a.id}
              className="shrink-0 self-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-medium text-[color:var(--ad-muted)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:text-[color:var(--ad-ink)] disabled:opacity-50"
              aria-label={`"${a.title}" 공지 읽음`}
            >
              읽음
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
