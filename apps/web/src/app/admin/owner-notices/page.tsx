'use client';

import { useCallback, useEffect, useState } from 'react';
import { BellRing, Loader2, RefreshCw, Send } from 'lucide-react';
import { API_BASE } from '@/lib/api-config';
import { cn } from '@/lib/utils';

// 어드민 — 사장님 안내 (충전금 부족 · 주간 리포트 알림톡)
// 발송 상태(켜짐 여부·템플릿), 지금 보내면 받을 매장, 최근 발송 성과(열람·7일 안 충전), 시험 발송

const KIND_LABEL: Record<string, string> = {
  LOW_BALANCE_EMPTY: '충전금 소진 (알림 멈춤)',
  LOW_BALANCE_SOON: '충전금 곧 소진',
  WEEKLY_REPORT: '주간 리포트',
};
const num = (v: number) => v.toLocaleString('ko-KR');

interface Preview {
  enabled: boolean;
  templates: { LOW_BALANCE: string; WEEKLY_REPORT: string };
  lowBalance: Array<{ storeId: string; storeName: string; kind: string; hasMobile: boolean; balance: number; dailySpend: number; daysLeft: number | null; skipped7d: number }>;
  weekly: { stores: number; withMobile: number };
}
interface Stats {
  days: number;
  byKind: Array<{ kind: string; sent: number; opened: number; toppedUp: number; topupAmount: number }>;
  skipped: { messages: number; stores: number };
  recent: Array<{ id: string; storeName: string; kind: string; status: string; error: string | null; createdAt: string; test: boolean }>;
}

export default function OwnerNoticesPage() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // 시험 발송
  const [q, setQ] = useState('');
  const [stores, setStores] = useState<Array<{ id: string; name: string }>>([]);
  const [storeId, setStoreId] = useState('');
  const [kind, setKind] = useState('WEEKLY_REPORT');
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [testResult, setTestResult] = useState('');

  const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('adminToken') || ''}` });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [p, s] = await Promise.all([
        fetch(`${API_BASE}/api/admin/owner-notices/preview`, { headers: auth() }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('미리보기를 불러오지 못했습니다.')))),
        fetch(`${API_BASE}/api/admin/owner-notices/stats?days=30`, { headers: auth() }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('통계를 불러오지 못했습니다.')))),
      ]);
      setPreview(p);
      setStats(s);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (q.trim().length < 2) return setStores([]);
    const t = setTimeout(() => {
      fetch(`${API_BASE}/api/admin/stores?search=${encodeURIComponent(q.trim())}&pageSize=10`, { headers: auth() })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d?.stores && setStores(d.stores.map((s: any) => ({ id: s.id, name: s.name }))))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const sendTest = async () => {
    setTestResult('');
    if (!storeId) return setTestResult('매장을 골라 주세요.');
    setSending(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/owner-notices/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth() },
        body: JSON.stringify({ storeId, kind, phone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '시험 발송에 실패했습니다.');
      setTestResult(data.sent ? '발송 요청했어요. 1~2분 안에 도착해요.' : `발송하지 못했어요: ${data.reason ?? '알 수 없음'}`);
      load();
    } catch (e: any) {
      setTestResult(e.message);
    } finally {
      setSending(false);
    }
  };

  const empty = preview?.lowBalance.filter((c) => c.kind === 'LOW_BALANCE_EMPTY') ?? [];
  const soon = preview?.lowBalance.filter((c) => c.kind === 'LOW_BALANCE_SOON') ?? [];

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pb-16 pt-6 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.4px] text-[color:var(--ad-ink)]">사장님 안내</h1>
          <p className="mt-1 text-[13px] text-[color:var(--ad-muted)]">충전금 부족 · 주간 리포트 알림톡 (무료, 로그인 없이 여는 링크 포함)</p>
        </div>
        <button
          type="button"
          onClick={load}
          className="adm-press inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-white px-3.5 text-[13px] font-medium text-[color:var(--ad-ink)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)]"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          새로고침
        </button>
      </header>

      {error && <p className="mt-4 text-[13px] text-[color:var(--ad-neg)]">{error}</p>}

      {preview && (
        <section className="adm-card mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 p-5 text-[13px]">
          <span className="inline-flex items-center gap-2 font-semibold text-[color:var(--ad-ink)]">
            <span className={cn('h-2.5 w-2.5 rounded-full', preview.enabled ? 'bg-[color:var(--ad-pos-dot)]' : 'bg-[color:var(--ad-line-strong)]')} />
            자동 발송 {preview.enabled ? '켜짐' : '꺼짐'}
          </span>
          <span className="text-[color:var(--ad-muted)]">
            {preview.enabled ? '주간 리포트: 매주 월 10~12시 · 충전금 안내: 매일 11~20시' : '운영 API 에 OWNER_NOTICE_ENABLED=true 를 넣으면 시작돼요 (템플릿 승인 후)'}
          </span>
          <span className="text-[12px] text-[color:var(--ad-faint)]">
            템플릿 {preview.templates.LOW_BALANCE} · {preview.templates.WEEKLY_REPORT}
          </span>
        </section>
      )}

      {/* 성과 */}
      <section className="mt-6">
        <h2 className="mb-2 px-1 text-[13px] font-semibold text-[color:var(--ad-ink-2)]">최근 30일 성과</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {['LOW_BALANCE_EMPTY', 'LOW_BALANCE_SOON', 'WEEKLY_REPORT'].map((k) => {
            const s = stats?.byKind.find((b) => b.kind === k);
            return (
              <div key={k} className="adm-card p-5">
                <p className="text-[12.5px] font-medium text-[color:var(--ad-muted)]">{KIND_LABEL[k]}</p>
                <p className="mt-2 text-[24px] font-semibold leading-none text-[color:var(--ad-ink)] adm-tnum">
                  {num(s?.sent ?? 0)}
                  <span className="ml-0.5 text-[13px] font-medium text-[color:var(--ad-muted)]">건 발송</span>
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-[12.5px]">
                  <div>
                    <dt className="text-[color:var(--ad-faint)]">링크 열람</dt>
                    <dd className="font-semibold text-[color:var(--ad-ink)] adm-tnum">
                      {num(s?.opened ?? 0)} {s?.sent ? <span className="font-normal text-[color:var(--ad-faint)]">({Math.round(((s.opened ?? 0) / s.sent) * 100)}%)</span> : null}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[color:var(--ad-faint)]">7일 안 충전</dt>
                    <dd className="font-semibold text-[color:var(--ad-ink)] adm-tnum">
                      {num(s?.toppedUp ?? 0)}곳 · {num(s?.topupAmount ?? 0)}원
                    </dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
        {stats && (
          <p className="mt-2 px-1 text-[12px] text-[color:var(--ad-faint)] adm-tnum">
            충전금 부족으로 못 나간 손님 알림: 최근 30일 {num(stats.skipped.messages)}건 · {num(stats.skipped.stores)}개 매장
          </p>
        )}
      </section>

      {/* 지금 보내면 받을 매장 */}
      <section className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="adm-card overflow-hidden">
          <div className="flex items-center justify-between px-5 pb-2 pt-4">
            <h2 className="text-[14px] font-semibold text-[color:var(--ad-ink)]">지금 충전금 안내를 받을 매장</h2>
            <span className="text-[12px] text-[color:var(--ad-faint)] adm-tnum">
              소진 {empty.length} · 곧 소진 {soon.length}
            </span>
          </div>
          {loading && !preview ? (
            <div className="grid place-items-center py-10 text-[color:var(--ad-muted)]">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (preview?.lowBalance.length ?? 0) === 0 ? (
            <p className="px-5 pb-5 text-[13px] text-[color:var(--ad-muted)]">지금은 안내할 매장이 없어요. (이번 주에 이미 받은 매장은 빠져요)</p>
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-[12.5px]">
                <thead className="sticky top-0 bg-[color:var(--ad-bg-alt)] text-left text-[color:var(--ad-muted)]">
                  <tr>
                    <th className="px-5 py-2 font-medium">매장</th>
                    <th className="px-2 py-2 font-medium">안내</th>
                    <th className="px-2 py-2 text-right font-medium">잔액</th>
                    <th className="px-2 py-2 text-right font-medium">하루 사용</th>
                    <th className="px-5 py-2 text-right font-medium">못 나간 알림(7일)</th>
                  </tr>
                </thead>
                <tbody>
                  {preview!.lowBalance.map((c) => (
                    <tr key={c.storeId} className="border-t border-[color:var(--ad-line)]">
                      <td className="px-5 py-2">
                        {c.storeName}
                        {!c.hasMobile && <span className="ml-1.5 text-[11px] text-[color:var(--ad-faint)]">휴대폰 없음</span>}
                      </td>
                      <td className={cn('px-2 py-2', c.kind === 'LOW_BALANCE_EMPTY' ? 'text-[color:var(--ad-neg)]' : 'text-[color:var(--ad-amber)]')}>
                        {c.kind === 'LOW_BALANCE_EMPTY' ? '소진' : `${c.daysLeft ?? '-'}일 남음`}
                      </td>
                      <td className="px-2 py-2 text-right adm-tnum">{num(c.balance)}원</td>
                      <td className="px-2 py-2 text-right adm-tnum">{num(c.dailySpend)}원</td>
                      <td className="px-5 py-2 text-right adm-tnum">{num(c.skipped7d)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {preview && (
            <p className="border-t border-[color:var(--ad-line)] px-5 py-3 text-[12.5px] text-[color:var(--ad-muted)] adm-tnum">
              이번 주 주간 리포트 대상 {num(preview.weekly.stores)}곳 (휴대폰 번호 있음 {num(preview.weekly.withMobile)}곳)
            </p>
          )}
        </div>

        {/* 시험 발송 */}
        <div className="adm-card p-5">
          <h2 className="flex items-center gap-1.5 text-[14px] font-semibold text-[color:var(--ad-ink)]">
            <BellRing className="h-4 w-4" />
            시험 발송
          </h2>
          <p className="mt-1 text-[12px] text-[color:var(--ad-faint)]">고른 매장의 실제 숫자로, 입력한 번호에만 보내요.</p>
          <div className="mt-3 grid gap-2.5">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="매장 이름 검색"
              className="h-10 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13px] focus:border-[color:var(--ad-ink)] focus:outline-none"
            />
            {stores.length > 0 && (
              <select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className="h-10 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-2 text-[13px]"
              >
                <option value="">매장 선택</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
            <select value={kind} onChange={(e) => setKind(e.target.value)} className="h-10 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-2 text-[13px]">
              <option value="WEEKLY_REPORT">주간 리포트</option>
              <option value="LOW_BALANCE_EMPTY">충전금 소진</option>
              <option value="LOW_BALANCE_SOON">충전금 곧 소진</option>
            </select>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              placeholder="받을 휴대폰 010-0000-0000"
              className="h-10 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13px] focus:border-[color:var(--ad-ink)] focus:outline-none"
            />
            <button
              type="button"
              onClick={sendTest}
              disabled={sending}
              className="adm-press inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] bg-[color:var(--ad-ink)] text-[13px] font-semibold text-white disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {sending ? '보내는 중...' : '시험 발송'}
            </button>
            {testResult && <p className="text-[12.5px] text-[color:var(--ad-muted)]">{testResult}</p>}
          </div>
        </div>
      </section>

      {/* 최근 발송 */}
      <section className="adm-card mt-6 overflow-hidden">
        <h2 className="px-5 pb-2 pt-4 text-[14px] font-semibold text-[color:var(--ad-ink)]">최근 발송</h2>
        {(stats?.recent.length ?? 0) === 0 ? (
          <p className="px-5 pb-5 text-[13px] text-[color:var(--ad-muted)]">아직 보낸 안내가 없어요.</p>
        ) : (
          <table className="w-full text-[12.5px]">
            <tbody>
              {stats!.recent.map((r) => (
                <tr key={r.id} className="border-t border-[color:var(--ad-line)]">
                  <td className="px-5 py-2">{r.storeName}</td>
                  <td className="px-2 py-2 text-[color:var(--ad-muted)]">
                    {KIND_LABEL[r.kind] ?? r.kind}
                    {r.test && <span className="ml-1.5 rounded-full bg-[color:var(--ad-bg)] px-1.5 text-[11px]">시험</span>}
                  </td>
                  <td className={cn('px-2 py-2', r.status === 'FAILED' ? 'text-[color:var(--ad-neg)]' : 'text-[color:var(--ad-muted)]')} title={r.error ?? ''}>
                    {r.status === 'SENT' ? '발송' : r.status === 'FAILED' ? '실패' : '대기'}
                  </td>
                  <td className="px-5 py-2 text-right text-[color:var(--ad-faint)] adm-tnum">{new Date(r.createdAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
