'use client';

import { useState } from 'react';
import { AlertTriangle, ArrowRight, BellOff, Check, ChevronDown, MessageCircle, Sparkles, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AutomationSuggestion, OwnerReport, num, periodLabel, shortWon, won } from './types';

/**
 * 사장님 리포트 본문 — 로그인 없는 링크(/o/:token)에서 쓴다. 휴대폰(카카오톡 안 브라우저)에서 먼저 보이도록 한 줄 흐름으로.
 * 순서: 급한 일(충전금) → 지난주 손님 → 메시지 효과 → 자동 마케팅 → 충전금 → 설정
 */
export function OwnerReportView({
  report,
  api,
  onCharge,
  onChanged,
  crmHref,
}: {
  report: OwnerReport;
  /** 사장님 로그인 토큰을 붙여 API 를 부른다 */
  api: (path: string, init?: RequestInit) => Promise<Response>;
  onCharge: () => void;
  onChanged: () => void;
  crmHref: string;
}) {
  const w = report.wallet;
  const t = report.thisWeek;
  const diff = t.visitors - report.lastWeek.visitors;
  const m = report.marketing;

  return (
    <div className="mx-auto w-full max-w-[560px] px-4 pb-16 pt-6 sm:pt-10">
      <header className="mb-5">
        <div className="flex items-center gap-2">
          <img src="/Taghere-logo.png" alt="" className="h-5 w-5 rounded-[5px]" />
          <span className="text-[12.5px] font-medium text-[color:var(--ad-muted)]">태그히어 CRM</span>
        </div>
        <h1 className="mt-3 text-[22px] font-semibold leading-tight tracking-[-0.4px] text-[color:var(--ad-ink)]">{report.store.name}</h1>
        <p className="mt-1 text-[13px] text-[color:var(--ad-muted)] adm-tnum">지난주 리포트 · {periodLabel(t)}</p>
      </header>

      {w.state !== 'OK' && <WalletAlert report={report} onCharge={onCharge} />}

      {/* 지난주 손님 */}
      <section className="mt-4">
        <SectionTitle>지난주 손님</SectionTitle>
        <div className="adm-card grid grid-cols-2 overflow-hidden">
          <Metric
            label="적립한 손님"
            value={`${num(t.visitors)}명`}
            sub={
              diff === 0 ? (
                <span className="text-[color:var(--ad-faint)]">지난주와 같아요</span>
              ) : (
                <span className={cn('inline-flex items-center gap-0.5 font-medium', diff > 0 ? 'text-[color:var(--ad-pos)]' : 'text-[color:var(--ad-neg)]')}>
                  {diff > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  지난주보다 {num(Math.abs(diff))}명 {diff > 0 ? '많아요' : '적어요'}
                </span>
              )
            }
            className="border-b border-r border-[color:var(--ad-line)]"
          />
          <Metric
            label="다시 온 손님"
            value={`${num(t.returning)}명`}
            sub={t.visitors > 0 ? `적립 손님의 ${Math.round((t.returning / t.visitors) * 100)}%` : undefined}
            className="border-b border-[color:var(--ad-line)]"
          />
          <Metric label="처음 온 손님" value={`${num(t.newCustomers)}명`} sub="새로 등록한 손님" className="border-r border-[color:var(--ad-line)]" />
          <Metric label="적립 손님 결제액" value={shortWon(t.revenue)} sub="주문 기록이 있는 결제만" />
        </div>
      </section>

      {/* 메시지 효과 */}
      <section className="mt-6">
        <SectionTitle>메시지 효과 · 최근 30일</SectionTitle>
        <div className="adm-card p-5">
          {m.recipients > 0 ? (
            <>
              <p className="text-[15px] font-medium leading-snug text-[color:var(--ad-ink)]">
                메시지를 받은 손님 <b className="adm-tnum">{num(m.recipients)}명</b> 중 <b className="adm-tnum text-[color:var(--ad-link)]">{num(m.revisited)}명</b>이 14일 안에 다시 왔어요
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[color:var(--ad-bg)]" aria-hidden>
                <div className="h-full rounded-full bg-[color:var(--ad-link)]" style={{ width: `${Math.min(100, Math.max(2, (m.revisited / m.recipients) * 100))}%` }} />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-[12.5px]">
                <div>
                  <dt className="text-[color:var(--ad-muted)]">다시 온 손님 결제액</dt>
                  <dd className="mt-0.5 text-[15px] font-semibold text-[color:var(--ad-ink)] adm-tnum">{shortWon(m.revenue)}</dd>
                </div>
                <div>
                  <dt className="text-[color:var(--ad-muted)]">보낸 비용</dt>
                  <dd className="mt-0.5 text-[15px] font-semibold text-[color:var(--ad-ink)] adm-tnum">{shortWon(m.cost)}</dd>
                </div>
              </dl>
              <p className="mt-3 text-[11.5px] leading-relaxed text-[color:var(--ad-faint)]">메시지를 받고 14일 안에 적립·주문 기록이 있는 손님을 셌어요. 메시지가 없었어도 왔을 손님이 포함될 수 있어요.</p>
            </>
          ) : (
            <p className="text-[14px] leading-relaxed text-[color:var(--ad-muted)]">
              최근 30일 동안 손님에게 보낸 메시지가 없어요. 아래 자동 마케팅을 켜 두면 조건에 맞는 손님에게 알아서 쿠폰이 나가요.
            </p>
          )}
        </div>
      </section>

      {/* 자동 마케팅 */}
      <section className="mt-6">
        <SectionTitle right={<span className="adm-tnum">켜짐 {report.automation.items.filter((i) => i.enabled).length}/{report.automation.items.length}</span>}>
          자동 마케팅
        </SectionTitle>
        <div className="grid gap-2.5">
          {report.automation.items.map((item) => (
            <AutomationCard key={item.type} item={item} naverPlaceReady={report.automation.naverPlaceReady} api={api} onChanged={onChanged} freeLeft={w.freeCreditsLeft} />
          ))}
        </div>
      </section>

      {/* 충전금 */}
      <section className="mt-6">
        <SectionTitle>충전금</SectionTitle>
        <div className="adm-card p-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[12.5px] text-[color:var(--ad-muted)]">남은 충전금</p>
              <p className="mt-1 text-[26px] font-semibold leading-none tracking-[-0.03em] text-[color:var(--ad-ink)] adm-tnum">{won(w.balance)}</p>
            </div>
            <button
              type="button"
              onClick={onCharge}
              className="adm-press inline-flex h-10 items-center gap-1.5 rounded-[12px] bg-[color:var(--ad-ink)] px-4 text-[13.5px] font-semibold text-white"
            >
              <Wallet className="h-4 w-4" />
              충전하기
            </button>
          </div>
          <ul className="mt-4 grid gap-2 border-t border-[color:var(--ad-line)] pt-4 text-[13px] text-[color:var(--ad-ink-2)]">
            <li className="flex justify-between gap-3">
              <span className="text-[color:var(--ad-muted)]">하루 평균 사용</span>
              <span className="adm-tnum">{w.dailySpend > 0 ? won(w.dailySpend) : '-'}</span>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-[color:var(--ad-muted)]">지금 속도로 쓸 수 있는 기간</span>
              <span className="adm-tnum">{w.daysLeft === null ? '-' : w.daysLeft > 60 ? '두 달 이상' : `약 ${num(w.daysLeft)}일`}</span>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-[color:var(--ad-muted)]">이번 달 무료 메시지</span>
              <span className="adm-tnum">
                {num(w.freeCreditsLeft)} / {num(w.freeCreditsTotal)}건 남음
              </span>
            </li>
          </ul>
          <p className="mt-3 text-[11.5px] leading-relaxed text-[color:var(--ad-faint)]">손님 적립 알림 1건 20원, 쿠폰·자동 마케팅 메시지 1건 50원이에요. 10만원 이상 충전하면 보너스를 더 드려요.</p>
        </div>
      </section>

      <a
        href={crmHref}
        className="adm-press mt-6 flex h-12 items-center justify-center gap-1.5 rounded-[14px] bg-white text-[14px] font-semibold text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)]"
      >
        CRM 전체 화면 열기
        <ArrowRight className="h-4 w-4" />
      </a>

      <NoticeSettings report={report} api={api} onChanged={onChanged} />
    </div>
  );
}

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between px-1">
      <h2 className="text-[13px] font-semibold text-[color:var(--ad-ink-2)]">{children}</h2>
      {right && <span className="text-[12px] text-[color:var(--ad-faint)]">{right}</span>}
    </div>
  );
}

function Metric({ label, value, sub, className }: { label: string; value: string; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('p-4', className)}>
      <p className="text-[12px] text-[color:var(--ad-muted)]">{label}</p>
      <p className="mt-1.5 text-[22px] font-semibold leading-none tracking-[-0.02em] text-[color:var(--ad-ink)] adm-tnum">{value}</p>
      {sub && <p className="mt-1.5 text-[11.5px] leading-snug text-[color:var(--ad-faint)]">{sub}</p>}
    </div>
  );
}

function WalletAlert({ report, onCharge }: { report: OwnerReport; onCharge: () => void }) {
  const w = report.wallet;
  const empty = w.state === 'EMPTY';
  return (
    <section
      className={cn('rounded-[16px] p-5', empty ? 'bg-[#fff1f2] shadow-[inset_0_0_0_1px_#fbd5da]' : 'bg-[color:var(--ad-yellow-soft)] shadow-[inset_0_0_0_1px_#f3dc8c]')}
      role="alert"
    >
      <p className={cn('flex items-center gap-1.5 text-[15px] font-semibold', empty ? 'text-[color:var(--ad-neg)]' : 'text-[#8a5a00]')}>
        <AlertTriangle className="h-4 w-4" />
        {empty ? '손님 알림이 멈췄어요' : '충전금이 곧 바닥나요'}
      </p>
      <p className="mt-2 text-[14px] leading-relaxed text-[color:var(--ad-ink-2)]">
        {empty ? (
          w.skipped7d > 0 ? (
            <>
              최근 7일 동안 손님 알림 <b className="adm-tnum">{num(w.skipped7d)}건</b>이 충전금이 부족해 발송되지 못했어요. 적립한 손님이 적립 알림을 받지 못하고 있어요.
            </>
          ) : (
            '충전금이 부족해 손님 적립 알림과 자동 마케팅이 발송되지 않고 있어요.'
          )
        ) : (
          <>
            하루 평균 <b className="adm-tnum">{won(w.dailySpend)}</b>씩 쓰고 있어 약 <b className="adm-tnum">{num(Math.max(1, w.daysLeft ?? 1))}일</b> 뒤 충전금이 모두 소진돼요.
          </>
        )}
      </p>
      <button
        type="button"
        onClick={onCharge}
        className={cn(
          'adm-press mt-4 flex h-12 w-full items-center justify-center gap-1.5 rounded-[12px] text-[15px] font-semibold text-white',
          empty ? 'bg-[color:var(--ad-neg)]' : 'bg-[color:var(--ad-ink)]'
        )}
      >
        <Wallet className="h-4 w-4" />
        {empty ? '충전하고 알림 다시 보내기' : '미리 충전하기'}
      </button>
      <p className="mt-2 text-center text-[11.5px] text-[color:var(--ad-faint)] adm-tnum">현재 충전금 {won(w.balance)}</p>
    </section>
  );
}

function AutomationCard({
  item,
  naverPlaceReady,
  api,
  onChanged,
  freeLeft,
}: {
  item: AutomationSuggestion;
  naverPlaceReady: boolean;
  api: (path: string, init?: RequestInit) => Promise<Response>;
  onChanged: () => void;
  freeLeft: number;
}) {
  const [open, setOpen] = useState(false);
  const [coupon, setCoupon] = useState('');
  const [naverUrl, setNaverUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const enable = async () => {
    setError('');
    if (!coupon.trim()) return setError('손님에게 드릴 혜택을 적어 주세요.');
    setSaving(true);
    try {
      const res = await api('/api/owner/quick-automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: item.type, couponContent: coupon.trim(), naverPlaceUrl: naverUrl.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '켜지 못했어요.');
      setOpen(false);
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="adm-card p-4">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-full',
            item.enabled ? 'bg-[color:var(--ad-blue-soft)] text-[color:var(--ad-link)]' : 'bg-[color:var(--ad-bg)] text-[color:var(--ad-faint)]'
          )}
        >
          {item.enabled ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <Sparkles className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[14.5px] font-semibold text-[color:var(--ad-ink)]">{item.label}</p>
            {item.enabled ? (
              <span className="rounded-full bg-[color:var(--ad-blue-soft)] px-2 py-0.5 text-[11.5px] font-semibold text-[color:var(--ad-link)]">켜짐</span>
            ) : (
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="adm-press inline-flex h-8 items-center gap-1 rounded-[10px] bg-[color:var(--ad-ink)] px-3 text-[12.5px] font-semibold text-white"
              >
                켜기
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
              </button>
            )}
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[color:var(--ad-muted)]">{item.why}</p>
          {item.audience > 0 && (
            <p className="mt-1 text-[12px] text-[color:var(--ad-faint)] adm-tnum">
              <MessageCircle className="mr-1 inline h-3 w-3" />
              최근 30일 기준 손님 {num(item.audience)}명이 대상이에요
            </p>
          )}
        </div>
      </div>

      {open && !item.enabled && (
        <div className="mt-4 grid gap-3 border-t border-[color:var(--ad-line)] pt-4">
          <label className="grid gap-1.5">
            <span className="text-[12.5px] font-medium text-[color:var(--ad-ink-2)]">손님에게 드릴 혜택</span>
            <input
              value={coupon}
              onChange={(e) => setCoupon(e.target.value)}
              maxLength={60}
              placeholder="예: 음료 1잔 무료, 5,000원 할인"
              className="h-11 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[14px] focus:border-[color:var(--ad-ink)] focus:outline-none"
            />
            <span className="text-[11.5px] text-[color:var(--ad-faint)]">술·주류 혜택은 문자로 보낼 수 없어요.</span>
          </label>
          {!naverPlaceReady && (
            <label className="grid gap-1.5">
              <span className="text-[12.5px] font-medium text-[color:var(--ad-ink-2)]">네이버 플레이스 링크</span>
              <input
                value={naverUrl}
                onChange={(e) => setNaverUrl(e.target.value)}
                inputMode="url"
                placeholder="https://naver.me/..."
                className="h-11 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[14px] focus:border-[color:var(--ad-ink)] focus:outline-none"
              />
              <span className="text-[11.5px] text-[color:var(--ad-faint)]">쿠폰 문자에 매장 길찾기 링크로 들어가요. 네이버 지도 → 매장 → 공유 → 링크 복사</span>
            </label>
          )}
          <p className="rounded-[10px] bg-[color:var(--ad-bg-alt)] px-3 py-2.5 text-[12px] leading-relaxed text-[color:var(--ad-muted)]">
            조건에 맞는 손님에게 광고 문자로 발송돼요. 이번 달 무료 {num(freeLeft)}건을 먼저 쓰고, 그다음부터 1건 50원이에요. 언제든 CRM에서 끌 수 있어요.
          </p>
          {error && <p className="text-[12.5px] text-[color:var(--ad-neg)]">{error}</p>}
          <button
            type="button"
            onClick={enable}
            disabled={saving}
            className="adm-press h-11 rounded-[12px] bg-[color:var(--ad-ink)] text-[14px] font-semibold text-white disabled:opacity-50"
          >
            {saving ? '켜는 중...' : `${item.label} 켜기`}
          </button>
        </div>
      )}
    </div>
  );
}

function NoticeSettings({ report, api, onChanged }: { report: OwnerReport; api: (path: string, init?: RequestInit) => Promise<Response>; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const savePhone = async () => {
    setError('');
    setBusy(true);
    try {
      const res = await api('/api/owner/notify-phone', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '저장하지 못했어요.');
      setEditing(false);
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleOptOut = async () => {
    setBusy(true);
    try {
      await api('/api/owner/report-opt-out', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ optOut: !report.reportOptOut }) });
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-8 border-t border-[color:var(--ad-line)] pt-5 text-[12.5px] text-[color:var(--ad-muted)]">
      <div className="flex items-center justify-between gap-3">
        <span>알림 받는 번호</span>
        {editing ? null : (
          <span className="flex items-center gap-2">
            <span className="adm-tnum text-[color:var(--ad-ink-2)]">{report.notifyPhone ?? '등록된 휴대폰 없음'}</span>
            <button type="button" onClick={() => setEditing(true)} className="font-medium text-[color:var(--ad-link)] underline-offset-2 hover:underline">
              {report.notifyPhone ? '변경' : '등록'}
            </button>
          </span>
        )}
      </div>
      {editing && (
        <div className="mt-2 flex gap-2">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            placeholder="010-0000-0000"
            className="h-10 min-w-0 flex-1 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[14px] focus:border-[color:var(--ad-ink)] focus:outline-none"
          />
          <button type="button" onClick={savePhone} disabled={busy} className="h-10 rounded-[10px] bg-[color:var(--ad-ink)] px-4 text-[13px] font-semibold text-white disabled:opacity-50">
            저장
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-[color:var(--ad-neg)]">{error}</p>}
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5">
          <BellOff className="h-3.5 w-3.5" />
          매주 월요일 리포트 알림톡
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={!report.reportOptOut}
          onClick={toggleOptOut}
          disabled={busy}
          className={cn('relative h-6 w-11 rounded-full transition-colors', report.reportOptOut ? 'bg-[color:var(--ad-line-strong)]' : 'bg-[color:var(--ad-ink)]')}
        >
          <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', report.reportOptOut ? 'left-0.5' : 'left-[22px]')} />
          <span className="sr-only">주간 리포트 받기</span>
        </button>
      </div>
      <p className="mt-4 text-[11.5px] leading-relaxed text-[color:var(--ad-faint)]">충전금 부족 안내는 손님 알림이 멈추지 않도록 리포트 수신과 관계없이 보내드려요.</p>
    </section>
  );
}
