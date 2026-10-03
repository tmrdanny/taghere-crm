'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, BellRing, Wallet, X } from 'lucide-react';
import { API_BASE } from '@/lib/api-config';
import { cn } from '@/lib/utils';
import { OwnerReport, num, won } from './types';

/**
 * CRM 홈 맨 위 — 충전금 때문에 손님 알림이 멈췄거나 곧 멈출 때, 그리고 안내 받을 휴대폰이 없을 때만 보인다.
 * (평소에는 아무것도 그리지 않는다)
 */
export function OwnerStatusBanner() {
  const [report, setReport] = useState<OwnerReport | null>(null);
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [saving, setSaving] = useState(false);
  const [phoneHidden, setPhoneHidden] = useState(false);

  const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('token') || ''}` });

  useEffect(() => {
    try {
      setPhoneHidden(localStorage.getItem('owner-notify-phone-hidden') === '1');
    } catch {
      // 저장소를 못 쓰면 매번 보인다
    }
    fetch(`${API_BASE}/api/owner/report`, { headers: auth() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.report && setReport(d.report))
      .catch(() => {});
  }, []);

  if (!report) return null;
  const w = report.wallet;

  const savePhone = async () => {
    setPhoneError('');
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/owner/notify-phone`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...auth() },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '저장하지 못했어요.');
      setReport({ ...report, notifyPhone: data.notifyPhone });
    } catch (e: any) {
      setPhoneError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const hidePhone = () => {
    setPhoneHidden(true);
    try {
      localStorage.setItem('owner-notify-phone-hidden', '1');
    } catch {
      // 무시
    }
  };

  return (
    <div className="mt-4 grid gap-3">
      {w.state !== 'OK' && (
        <section
          role="alert"
          className={cn(
            'flex flex-col gap-3 rounded-[16px] p-4 sm:flex-row sm:items-center sm:p-5',
            w.state === 'EMPTY' ? 'bg-[#fff1f2] shadow-[inset_0_0_0_1px_#fbd5da]' : 'bg-[color:var(--ad-yellow-soft)] shadow-[inset_0_0_0_1px_#f3dc8c]'
          )}
        >
          <span
            className={cn(
              'grid h-10 w-10 flex-none place-items-center rounded-full',
              w.state === 'EMPTY' ? 'bg-white text-[color:var(--ad-neg)]' : 'bg-white text-[#8a5a00]'
            )}
          >
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className={cn('text-[15px] font-semibold', w.state === 'EMPTY' ? 'text-[color:var(--ad-neg)]' : 'text-[#8a5a00]')}>
              {w.state === 'EMPTY' ? '충전금이 없어 손님 알림이 멈췄어요' : '충전금이 곧 바닥나요'}
            </p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-[color:var(--ad-ink-2)]">
              {w.state === 'EMPTY'
                ? w.skipped7d > 0
                  ? `최근 7일 동안 손님 알림 ${num(w.skipped7d)}건이 발송되지 못했어요. 적립한 손님이 적립 알림을 받지 못하고 있어요.`
                  : '손님 적립 알림과 자동 마케팅 메시지가 발송되지 않고 있어요.'
                : `하루 평균 ${won(w.dailySpend)}씩 쓰고 있어 약 ${num(Math.max(1, w.daysLeft ?? 1))}일 뒤 모두 소진돼요. 현재 ${won(w.balance)}`}
            </p>
          </div>
          <Link
            href="/billing"
            className={cn(
              'adm-press inline-flex h-10 flex-none items-center justify-center gap-1.5 rounded-[12px] px-4 text-[13.5px] font-semibold text-white',
              w.state === 'EMPTY' ? 'bg-[color:var(--ad-neg)]' : 'bg-[color:var(--ad-ink)]'
            )}
          >
            <Wallet className="h-4 w-4" />
            충전하기
          </Link>
        </section>
      )}

      {!report.notifyPhone && !phoneHidden && (
        <section className="adm-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
          <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[color:var(--ad-blue-soft)] text-[color:var(--ad-link)]">
            <BellRing className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-semibold text-[color:var(--ad-ink)]">사장님 휴대폰으로 매장 리포트를 받아보세요</p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-[color:var(--ad-muted)]">
              매주 월요일 지난주 손님 기록과, 충전금이 떨어지기 전에 미리 알림톡으로 알려드려요. 로그인 없이 버튼 하나로 열 수 있어요.
            </p>
            {phoneError && <p className="mt-1 text-[12px] text-[color:var(--ad-neg)]">{phoneError}</p>}
          </div>
          <div className="flex flex-none items-center gap-2">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              placeholder="010-0000-0000"
              aria-label="사장님 휴대폰 번호"
              className="h-10 w-[150px] rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13.5px] focus:border-[color:var(--ad-ink)] focus:outline-none"
            />
            <button
              type="button"
              onClick={savePhone}
              disabled={saving}
              className="adm-press h-10 rounded-[10px] bg-[color:var(--ad-ink)] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              등록
            </button>
            <button type="button" onClick={hidePhone} className="grid h-8 w-8 place-items-center rounded-full text-[color:var(--ad-faint)] hover:text-[color:var(--ad-ink)]" aria-label="닫기">
              <X className="h-4 w-4" />
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
