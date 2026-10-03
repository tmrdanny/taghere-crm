'use client';

import '@/app/admin/admin-theme.css';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { API_BASE } from '@/lib/api-config';
import { ChargeModal } from '@/components/ChargeModal';
import { OwnerReportView } from '@/features/owner-report/OwnerReportView';
import type { OwnerReport } from '@/features/owner-report/types';

/**
 * 로그인 없이 여는 사장님 리포트 — 알림톡(주간 리포트·충전금 안내) 버튼의 도착지.
 * 링크를 열면 12시간짜리 사장님 로그인 토큰을 받아 이 탭에 저장한다. 그래서 여기서 충전·자동 마케팅 켜기를 바로 할 수 있고,
 * "CRM 전체 화면 열기"를 누르면 로그인 없이 CRM 으로 들어간다.
 * 충전(토스) 후에는 같은 주소로 돌아와 결제를 확정한다.
 */
export default function OwnerLinkPage() {
  return (
    <Suspense fallback={null}>
      <OwnerLinkInner />
    </Suspense>
  );
}

function OwnerLinkInner() {
  const { token } = useParams<{ token: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [report, setReport] = useState<OwnerReport | null>(null);
  const [error, setError] = useState('');
  const [chargeOpen, setChargeOpen] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const session = useRef<string | null>(null);
  const confirmedRef = useRef(false);

  const api = useCallback(
    (path: string, init: RequestInit = {}) =>
      fetch(`${API_BASE}${path}`, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${session.current || ''}` } }),
    []
  );

  const refresh = useCallback(async () => {
    const res = await api('/api/owner/report');
    if (res.ok) setReport((await res.json()).report);
  }, [api]);

  // 링크 열기 → 로그인 토큰 + 리포트
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/owner-link/open`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) throw new Error(data.error || '리포트를 열지 못했어요.');
        session.current = data.session;
        if (data.session) {
          try {
            localStorage.setItem('token', data.session);
            sessionStorage.removeItem('auth-me-cache');
          } catch {
            // 저장이 막힌 브라우저여도 이 화면은 그대로 쓴다
          }
        }
        setReport(data.report);
        if (data.purpose === 'TOPUP' && !searchParams.get('paymentKey') && !searchParams.get('paymentFailed')) setChargeOpen(true);
      } catch (e: any) {
        if (alive) setError(e.message);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // 토스 결제 후 돌아오면 결제 확정
  useEffect(() => {
    if (!report || confirmedRef.current) return;
    const paymentKey = searchParams.get('paymentKey');
    const orderId = searchParams.get('orderId');
    const amount = searchParams.get('amount');
    if (searchParams.get('paymentFailed')) {
      confirmedRef.current = true;
      setNotice({ type: 'error', text: '결제가 완료되지 않았어요. 다시 시도해 주세요.' });
      router.replace(`/o/${token}`);
      return;
    }
    if (!paymentKey || !orderId || !amount) return;
    confirmedRef.current = true;
    (async () => {
      try {
        const res = await api('/api/payments/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentKey, orderId, amount: parseInt(amount, 10) }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || '결제 확인에 실패했어요.');
        setNotice({ type: 'success', text: `${Number(data.amount).toLocaleString('ko-KR')}원이 충전됐어요. 손님 알림이 다시 발송돼요.` });
        await refresh();
      } catch (e: any) {
        setNotice({ type: 'error', text: e.message });
      } finally {
        router.replace(`/o/${token}`);
      }
    })();
  }, [report, searchParams, api, refresh, router, token]);

  return (
    <div className="adm adm-crm min-h-[100dvh]">
      {notice && (
        <div className="sticky top-0 z-30 px-4 pt-3">
          <div
            role="status"
            className={`mx-auto flex max-w-[560px] items-start justify-between gap-3 rounded-[12px] px-4 py-3 text-[13.5px] font-medium shadow-sm ${
              notice.type === 'success' ? 'bg-[#e8f6e5] text-[color:var(--ad-pos)]' : 'bg-[#fff1f2] text-[color:var(--ad-neg)]'
            }`}
          >
            <span>{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} className="text-[12px] opacity-70">
              닫기
            </button>
          </div>
        </div>
      )}

      {error ? (
        <div className="mx-auto grid min-h-[70dvh] max-w-[420px] place-items-center px-6 text-center">
          <div>
            <img src="/Taghere-logo.png" alt="" className="mx-auto h-9 w-9 rounded-[9px]" />
            <p className="mt-4 text-[16px] font-semibold text-[color:var(--ad-ink)]">{error}</p>
            <a href="/login" className="mt-5 inline-flex h-11 items-center rounded-[12px] bg-[color:var(--ad-ink)] px-5 text-[14px] font-semibold text-white">
              CRM 로그인하기
            </a>
          </div>
        </div>
      ) : !report ? (
        <div className="grid min-h-[70dvh] place-items-center text-[color:var(--ad-muted)]">
          <span className="inline-flex items-center gap-2 text-[13.5px]">
            <Loader2 className="h-4 w-4 animate-spin" />
            리포트를 불러오고 있어요
          </span>
        </div>
      ) : (
        <OwnerReportView report={report} api={api} onCharge={() => setChargeOpen(true)} onChanged={refresh} crmHref="/home" />
      )}

      {report && (
        <ChargeModal
          isOpen={chargeOpen}
          onClose={() => setChargeOpen(false)}
          currentBalance={report.wallet.balance}
          successRedirectPath={`/o/${token}`}
        />
      )}
    </div>
  );
}
