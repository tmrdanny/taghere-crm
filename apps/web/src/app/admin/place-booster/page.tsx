'use client';

import { API_BASE } from '@/lib/api-config';
import { useState, useEffect, useCallback } from 'react';
import { BoosterCreateForm, BoosterTargetResult, BoosterFormValues, ActiveEditMeta, validUntilText } from '@/components/place-booster/booster-create-form';
import { BoosterReport, CampaignInputCard, ReportRow, ReportTotals } from '@/components/place-booster/booster-report';
import { ChevronLeft } from 'lucide-react';

const STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: '결제 대기', cls: 'bg-[#ffdace] text-[#993d1f]' },
  SCHEDULED: { label: '발송 예정', cls: 'bg-[color:var(--ad-blue-soft)] text-[color:var(--ad-link)]' },
  RUNNING: { label: '발송 중', cls: 'bg-[#d9fad3] text-[color:var(--ad-pos)]' },
  COMPLETED: { label: '완료', cls: 'bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)]' },
  CANCELLED: { label: '취소됨', cls: 'bg-[#ffc4d0] text-[color:var(--ad-neg)]' },
};
const won = (n: number) => (n ?? 0).toLocaleString('ko-KR');
const adminToken = () => (typeof window !== 'undefined' ? localStorage.getItem('adminToken') || '' : '');
const EDITABLE_STATUSES = ['DRAFT', 'SCHEDULED', 'RUNNING'];

interface AdminTarget { mode: 'store' | 'external'; storeId: string; campaignName: string; storeName: string; }
type DraftForm = BoosterFormValues & { target?: AdminTarget };
interface AdminDraft { id: string; formData: DraftForm; updatedAt: string; }

interface Analytics { totalCampaigns: number; activeCampaigns: number; pendingApproval: number; totalSent: number; totalClicks: number; }
interface Row {
  id: string; keyword: string; status: string; paymentStatus: string;
  perBatchCount: number; totalWeeks: number; sentCount: number; sentBatches: number; totalBatches: number;
  store: { id: string; name: string; ownerName: string | null } | null;
  campaignName: string | null; isExternal: boolean;
}

export default function AdminPlaceBoosterPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [drafts, setDrafts] = useState<AdminDraft[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [resumeForm, setResumeForm] = useState<BoosterFormValues | undefined>(undefined);
  const [resumeTarget, setResumeTarget] = useState<AdminTarget | undefined>(undefined);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);

  const af = useCallback(
    (path: string, init?: RequestInit) =>
      fetch(`${API_BASE}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken()}`, ...(init?.headers || {}) },
      }),
    []
  );

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    setLoading(true);
    try {
      const [a, c] = await Promise.all([
        af('/api/admin/place-booster/analytics'),
        af(`/api/admin/place-booster/campaigns?${params}`),
      ]);
      if (a.ok) setAnalytics(await a.json());
      else setMsg('성과 데이터를 불러오지 못했습니다.');
      if (c.ok) {
        const d = await c.json();
        setRows(d.campaigns);
        setTotal(d.total);
      } else {
        setMsg('캠페인 목록을 불러오지 못했습니다.');
      }
    } catch {
      setMsg('네트워크 오류로 데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [af, page, search, status]);

  useEffect(() => { load(); }, [load]);

  const loadDrafts = useCallback(async () => {
    try {
      const res = await af('/api/admin/place-booster/drafts');
      if (res.ok) setDrafts(await res.json());
    } catch { /* 무시 */ }
  }, [af]);
  useEffect(() => { loadDrafts(); }, [loadDrafts]);

  const saveDraftFn = useCallback(async (formData: DraftForm) => {
    const res = await af(
      draftId ? `/api/admin/place-booster/drafts/${draftId}` : '/api/admin/place-booster/drafts',
      { method: draftId ? 'PATCH' : 'POST', body: JSON.stringify({ formData }) }
    );
    if (res.ok) {
      const d = await res.json();
      if (!draftId && d?.id) setDraftId(d.id);
      setMsg('임시 저장되었습니다.');
    } else {
      throw new Error('임시 저장 실패');
    }
  }, [af, draftId]);

  const startCreate = () => { setDraftId(null); setResumeForm(undefined); setResumeTarget(undefined); setShowCreate(true); };
  const resumeDraft = (d: AdminDraft) => {
    setDraftId(d.id);
    const { target, ...form } = d.formData;
    setResumeForm(form as BoosterFormValues);
    setResumeTarget(target);
    setShowCreate(true);
  };
  const deleteDraft = async (id: string) => {
    await af(`/api/admin/place-booster/drafts/${id}`, { method: 'DELETE' });
    await loadDrafts();
  };

  const act = async (path: string, method: string, okMsg: string | ((data: any) => string)) => {
    if (acting) return;
    setActing(true);
    try {
      const res = await af(path, { method });
      if (res.ok) {
        const d = await res.json().catch(() => ({}));
        setMsg(typeof okMsg === 'function' ? okMsg(d) : okMsg);
        await load();
      }
      else { const d = await res.json().catch(() => ({})); setMsg(d.error || '실패했습니다.'); }
    } catch {
      setMsg('네트워크 오류가 발생했습니다.');
    } finally {
      setActing(false);
    }
  };

  const pages = Math.max(1, Math.ceil(total / 20));

  return (
    // ad-booster: 공용 부스터 컴포넌트(점주·프랜차이즈와 공유)를 관리자 화면에서만 v2 톤으로 보이게 하는 범위
    <div className="ad-booster">
      {!showCreate && !detailId && !editId && (
        <div className="flex flex-wrap items-center justify-end gap-3 mb-5">
          <button className="ad-press inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-[10px] bg-[color:var(--ad-yellow)] text-[13px] font-semibold text-[color:var(--ad-ink)] hover:bg-[color:var(--ad-yellow-strong)] disabled:opacity-50" onClick={startCreate}>
            + 캠페인 생성
          </button>
        </div>
      )}

      {msg && (
        <div className="mb-4 bg-[color:var(--ad-blue-soft)] text-[color:var(--ad-link)] px-4 py-2.5 rounded-[10px] text-[13px] flex justify-between">
          {msg} <button onClick={() => setMsg('')}>✕</button>
        </div>
      )}

      {showCreate ? (
        <div className="max-w-5xl">
          <AdminCreateView
            af={af}
            initialForm={resumeForm}
            initialTarget={resumeTarget}
            onSaveDraft={saveDraftFn}
            onBack={() => { setShowCreate(false); loadDrafts(); }}
            onCreated={async (id) => {
              if (draftId) { await deleteDraft(draftId); setDraftId(null); }
              setShowCreate(false);
              setMsg('캠페인을 생성했습니다.');
              load();
              void id;
            }}
          />
        </div>
      ) : editId ? (
        <div className="max-w-5xl">
          <AdminEditView
            id={editId}
            af={af}
            onBack={() => setEditId(null)}
            onSaved={(meta) => {
              setEditId(null);
              if (meta && typeof meta.restaged === 'number') {
                const failN = meta.failed?.length ?? 0;
                setMsg(
                  meta.restaged > 0
                    ? `남은 ${meta.restaged}개 주차를 새 내용으로 재예약했습니다.${failN ? ` (${failN}개 주차는 발송 임박으로 변경 불가)` : ''}`
                    : '변경 가능한 남은 주차가 없습니다.'
                );
              } else {
                setMsg('캠페인을 수정했습니다.');
              }
              load();
            }}
          />
        </div>
      ) : detailId ? (
        <div className="max-w-5xl">
          <AdminReportView id={detailId} af={af} onBack={() => setDetailId(null)} onChanged={load} />
        </div>
      ) : (
      <>
      {analytics && (
        <div className="ad-card grid grid-cols-3 overflow-hidden mb-4">
          <Stat label="전체 캠페인" value={won(analytics.totalCampaigns)} />
          <Stat label="진행 중" value={won(analytics.activeCampaigns)} />
          <Stat label="승인 대기" value={won(analytics.pendingApproval)} highlight={analytics.pendingApproval > 0} />
        </div>
      )}
      {drafts.length > 0 && (
        <div className="ad-card mb-4 divide-y divide-[color:var(--ad-line)]">
          {drafts.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <button className="text-left flex-1 min-w-0" onClick={() => resumeDraft(d)}>
                <span className="text-[13px] font-medium text-[color:var(--ad-ink)]">{d.formData?.keyword?.trim() || d.formData?.target?.campaignName || '(제목 없음)'}</span>
                <span className="ml-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium bg-[color:var(--ad-bg)] text-[color:var(--ad-muted)]">임시 저장됨</span>
                <span className="ml-2 text-[12px] text-[color:var(--ad-faint)]">이어서 작성</span>
              </button>
              <button className="ad-press text-[12px] font-medium px-2.5 h-7 rounded-[8px] bg-white shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] disabled:opacity-40 text-[color:var(--ad-neg)]" onClick={() => deleteDraft(d.id)}>삭제</button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-3">
        <input
          className="h-10 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none flex-1 min-w-[200px]"
          placeholder="매장명 / 대표자 / 키워드 검색"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <select className="h-10 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">전체 상태</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <div className="ad-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-[color:var(--ad-line)] bg-[color:var(--ad-bg-alt)] text-left text-[11.5px] text-[color:var(--ad-muted)]">
              <th className="px-4 py-2.5 font-medium text-left">매장</th>
              <th className="px-4 py-2.5 font-medium text-left">키워드</th>
              <th className="px-4 py-2.5 font-medium text-left">상태</th>
              <th className="px-4 py-2.5 font-medium text-left">결제</th>
              <th className="px-4 py-2.5 font-medium text-right">진행</th>
              <th className="px-4 py-2.5 font-medium text-right">발송</th>
              <th className="px-4 py-2.5 font-medium text-right">액션</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--ad-line)] text-[13px]">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-[rgba(110,173,255,0.05)]">
                <td className="px-4 py-3">
                  <div className="font-medium text-[color:var(--ad-ink)] flex items-center gap-1.5">
                    {r.store?.name || r.campaignName || '—'}
                    {r.isExternal && <span className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium bg-[color:var(--ad-blue-soft)] text-[color:var(--ad-link)]">외부</span>}
                  </div>
                  <div className="text-[12px] text-[color:var(--ad-faint)]">{r.isExternal ? '외부 고객' : r.store?.ownerName || ''}</div>
                </td>
                <td className="px-4 py-3">{r.keyword}</td>
                <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${(STATUS[r.status] || STATUS.DRAFT).cls}`}>{(STATUS[r.status] || STATUS.DRAFT).label}</span></td>
                <td className="px-4 py-3 text-[12px] text-[color:var(--ad-ink-2)]">{r.paymentStatus === 'PAID' ? '완료' : r.paymentStatus === 'PENDING_APPROVAL' ? '승인 대기' : '미결제'}</td>
                <td className="px-4 py-3 text-right text-[12px] ad-tnum">{r.sentBatches}/{r.totalBatches}주</td>
                <td className="px-4 py-3 text-right ad-tnum">{won(r.sentCount)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <div className="flex justify-end gap-1">
                    <button className="ad-press text-[12px] font-medium px-2.5 h-7 rounded-[8px] bg-white shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] disabled:opacity-40 text-[color:var(--ad-link)]" onClick={() => setDetailId(r.id)}>상세</button>
                    {EDITABLE_STATUSES.includes(r.status) && (
                      <button disabled={acting} className="ad-press text-[12px] font-medium px-2.5 h-7 rounded-[8px] bg-white shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] disabled:opacity-40 text-[color:var(--ad-ink-2)]" onClick={() => setEditId(r.id)}>수정</button>
                    )}
                    {r.paymentStatus === 'PENDING_APPROVAL' && (
                      <button disabled={acting} className="ad-press text-[12px] font-semibold px-2.5 h-7 rounded-[8px] bg-[color:var(--ad-yellow)] text-[color:var(--ad-ink)] hover:bg-[color:var(--ad-yellow-strong)] disabled:opacity-40" onClick={() => act(`/api/admin/place-booster/campaigns/${r.id}/approve`, 'POST', '승인되었습니다.')}>승인</button>
                    )}
                    {r.status !== 'CANCELLED' && r.status !== 'COMPLETED' && (
                      <button disabled={acting} className="ad-press text-[12px] font-medium px-2.5 h-7 rounded-[8px] bg-white shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] disabled:opacity-40 text-[#993d1f]" onClick={() => { if (confirm('취소(중지)하시겠습니까?')) act(`/api/admin/place-booster/campaigns/${r.id}/cancel`, 'POST', (d) => d.failed?.length ? `취소했습니다. 단, ${d.failed.length}개 회차(${d.failed.map((f: any) => `${f.weekNo}주`).join(', ')})는 발송 5분 이내라 취소되지 않고 발송됩니다.` : '취소되었습니다.'); }}>취소</button>
                    )}
                    <button disabled={acting} className="ad-press text-[12px] font-medium px-2.5 h-7 rounded-[8px] bg-white shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] disabled:opacity-40 text-[color:var(--ad-neg)]" onClick={() => { if (confirm('삭제(숨김)하시겠습니까?')) act(`/api/admin/place-booster/campaigns/${r.id}`, 'DELETE', '삭제되었습니다.'); }}>삭제</button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-[13px] text-[color:var(--ad-faint)]">{loading ? '불러오는 중…' : '캠페인이 없습니다.'}</td></tr>}
          </tbody>
        </table>
      </div>
      </div>

      <div className="flex items-center justify-center gap-2 mt-4 text-[13px] text-[color:var(--ad-ink-2)]">
        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="ad-press inline-flex items-center justify-center h-9 px-3.5 rounded-[10px] bg-white text-[13px] text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] disabled:opacity-50">이전</button>
        <span className="px-2 py-1 ad-tnum">{page} / {pages}</span>
        <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="ad-press inline-flex items-center justify-center h-9 px-3.5 rounded-[10px] bg-white text-[13px] text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] disabled:opacity-50">다음</button>
      </div>
      </>
      )}

    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`p-5 border-l border-[color:var(--ad-line)] first:border-l-0 ${highlight ? 'bg-[color:var(--ad-yellow-soft)]' : ''}`}>
      <div className="text-[12px] text-[color:var(--ad-muted)]">{label}</div>
      <div className="text-[22px] font-semibold tracking-[-0.03em] ad-tnum text-[color:var(--ad-ink)] mt-1">{value}</div>
    </div>
  );
}

interface AdminReportData {
  campaign: {
    keyword: string; couponContent: string; campaignName: string | null; status: string;
    perBatchCount: number; totalWeeks: number; totalTargetCount: number;
    naverPlaceUrl: string; couponCode: string | null; couponAmount: string | null;
    couponValidUntil: string | null; couponValidUntilText: string | null; ownerPhone: string | null;
  };
  store: { name: string; ownerName: string | null } | null;
  isExternal: boolean;
  totals: ReportTotals;
  rows: ReportRow[];
}

/** 운영자 성과 리포트 — 사장님 화면과 동일한 전체 페이지 + 운영자 전용(PDF 다운로드·외부 배지·광고비) */
function AdminReportView({ id, af, onBack, onChanged }: { id: string; af: (p: string, i?: RequestInit) => Promise<Response>; onBack: () => void; onChanged: () => void; }) {
  const [data, setData] = useState<AdminReportData | null>(null);
  const [exporting, setExporting] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testMsg, setTestMsg] = useState('');

  const load = useCallback(async () => {
    const res = await af(`/api/admin/place-booster/campaigns/${id}`);
    if (res.ok) setData(await res.json());
  }, [af, id]);
  useEffect(() => { load(); }, [load]);
  const reload = () => { load(); onChanged(); };

  const sendTest = async () => {
    setTestMsg('');
    if (!testPhone.trim()) { setTestMsg('테스트로 받을 번호를 입력해주세요.'); return; }
    setTestSending(true);
    try {
      const res = await af(`/api/admin/place-booster/campaigns/${id}/test-send`, { method: 'POST', body: JSON.stringify({ phone: testPhone }) });
      const d = await res.json().catch(() => ({}));
      setTestMsg(res.ok ? '✓ 테스트 알림톡을 발송했어요. 카카오톡을 확인해보세요.' : d.error || '발송에 실패했습니다.');
    } catch {
      setTestMsg('네트워크 오류가 발생했습니다.');
    } finally {
      setTestSending(false);
    }
  };

  const displayName = data ? (data.store?.name || data.campaign.campaignName || '캠페인') : '';
  const exportPdf = async () => {
    if (!data || exporting) return;
    setExporting(true);
    try {
      // react-pdf는 브라우저 전용이라 클릭 시점에 동적 import (SSR/초기 번들 제외)
      const { downloadBoosterReportPdf } = await import('@/components/place-booster/booster-report-pdf');
      await downloadBoosterReportPdf(data, displayName);
    } catch {
      alert('PDF 생성에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <button onClick={onBack} className="flex items-center gap-0.5 text-[13px] font-medium text-[color:var(--ad-muted)] hover:text-[color:var(--ad-ink)]">
          <ChevronLeft className="w-4 h-4" /> 목록으로
        </button>
        {data && (
          <button type="button" className="ad-press inline-flex items-center justify-center h-9 px-3.5 rounded-[10px] bg-white text-[13px] text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] disabled:opacity-50" onClick={exportPdf} disabled={exporting}>
            {exporting ? 'PDF 생성 중…' : 'PDF 다운로드'}
          </button>
        )}
      </div>

      {!data ? (
        <p className="text-[13px] text-[color:var(--ad-faint)]">불러오는 중…</p>
      ) : (
        <>
          {/* 테스트 발송 (PDF 캡처 영역 밖) */}
          <div className="ad-card p-5 mb-4">
            <div className="text-[14px] font-semibold text-[color:var(--ad-ink)] mb-1">테스트 발송</div>
            <p className="text-[12px] text-[color:var(--ad-faint)] mb-3">입력한 번호로 실제와 똑같은 알림톡 1건을 즉시 보냅니다. (발송 대상·회차·결제와 무관)</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                className="flex-1 h-10 rounded-[10px] border border-[color:var(--ad-line-strong)] bg-white px-3 text-[13.5px] placeholder:text-[color:var(--ad-faint)] focus:border-[color:var(--ad-navy)] focus:outline-none"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="받을 휴대폰 번호 (예: 01012345678)"
                inputMode="numeric"
              />
              <button type="button" className="ad-press inline-flex items-center justify-center h-9 px-3.5 rounded-[10px] bg-white text-[13px] text-[color:var(--ad-ink-2)] shadow-[inset_0_0_0_1px_var(--ad-line-strong)] hover:bg-[color:var(--ad-bg-alt)] disabled:opacity-50 shrink-0" onClick={sendTest} disabled={testSending}>
                {testSending ? '발송 중…' : '테스트 발송'}
              </button>
            </div>
            {testMsg && <p className={`text-[12.5px] mt-2 ${testMsg.startsWith('✓') ? 'text-[color:var(--ad-pos)]' : 'text-[color:var(--ad-neg)]'}`}>{testMsg}</p>}
          </div>

          {/* 성과 리포트 (화면용 — PDF는 데이터로 별도 렌더) */}
          <div>
            <div className="ad-card p-5 mb-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-[17px] font-bold text-[color:var(--ad-ink)]">{displayName}</h2>
                    {data.isExternal && <span className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium bg-[color:var(--ad-blue-soft)] text-[color:var(--ad-link)]">외부</span>}
                  </div>
                  <p className="text-[13px] text-[color:var(--ad-muted)] mt-1.5">유입 키워드: {data.campaign.keyword} · {data.campaign.couponContent}</p>
                  <div className="text-[12px] text-[color:var(--ad-faint)] mt-1 ad-tnum">
                    {data.campaign.perBatchCount.toLocaleString()}명 × {data.campaign.totalWeeks}주 (총 {data.campaign.totalTargetCount.toLocaleString()}명)
                  </div>
                </div>
                <span className={`inline-flex rounded-full px-2.5 py-1 text-[12px] font-medium shrink-0 ${(STATUS[data.campaign.status] || STATUS.DRAFT).cls}`}>
                  {(STATUS[data.campaign.status] || STATUS.DRAFT).label}
                </span>
              </div>
            </div>

            {/* 캠페인 입력 정보 (취소 후 재등록 참고용) */}
            <CampaignInputCard
              fields={{
                keyword: data.campaign.keyword,
                naverPlaceUrl: data.campaign.naverPlaceUrl,
                couponContent: data.campaign.couponContent,
                couponCode: data.campaign.couponCode,
                couponAmount: data.campaign.couponAmount,
                couponValidUntil: data.campaign.couponValidUntil,
                couponValidUntilText: data.campaign.couponValidUntilText,
                ownerPhone: data.campaign.ownerPhone,
              }}
            />

            <BoosterReport
              totals={data.totals}
              rows={data.rows}
              fetcher={af}
              apiPrefix="/api/admin/place-booster"
              reload={reload}
              showAdCost
            />
          </div>
        </>
      )}
    </div>
  );
}

interface StoreOpt { id: string; name: string; ownerName: string | null; address: string | null; phone: string | null; }

/** 운영자 대상(매장/외부) 선택 — 생성/수정 공용. initial 로 수정 시 프리필. disabled면 매장 검색 fetch 스킵. */
function useAdminTarget(
  af: (p: string, i?: RequestInit) => Promise<Response>,
  initial?: { storeId: string | null; storeName: string; campaignName: string | null },
  disabled = false
) {
  const [mode, setMode] = useState<'store' | 'external'>(initial?.storeId ? 'store' : initial?.campaignName ? 'external' : 'store');
  const [campaignName, setCampaignName] = useState(initial?.campaignName ?? '');
  const [stores, setStores] = useState<StoreOpt[]>([]);
  const [storeId, setStoreId] = useState(initial?.storeId ?? '');
  const [selectedStoreName, setSelectedStoreName] = useState(initial?.storeName ?? '');
  const [storeSearch, setStoreSearch] = useState('');
  const [prefillPhone, setPrefillPhone] = useState('');

  useEffect(() => {
    if (disabled) return; // 대상 UI 미노출(발송중 수정) — 검색 fetch 불필요
    const t = setTimeout(async () => {
      const res = await af(`/api/admin/place-booster/stores?search=${encodeURIComponent(storeSearch)}`);
      if (res.ok) setStores(await res.json());
    }, 250);
    return () => clearTimeout(t);
  }, [af, storeSearch, disabled]);

  const renderTarget = () => (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded-[10px] bg-[rgba(29,32,34,0.045)] p-[3px]">
        {([['store', '기존 매장'], ['external', '외부 고객']] as const).map(([m, label]) => (
          <button
            key={m}
            type="button"
            className={`ad-press py-2 rounded-[8px] text-[13px] font-medium transition-colors ${mode === m ? 'bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08)] text-[color:var(--ad-ink)]' : 'text-[color:var(--ad-muted)]'}`}
            onClick={() => setMode(m)}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === 'external' ? (
        <input className="input" placeholder="외부 고객/캠페인 식별용 이름 (예: 행궁동 카페 6월)" value={campaignName} onChange={(e) => setCampaignName(e.target.value)} />
      ) : selectedStoreName ? (
        <div className="flex items-center justify-between border border-[color:var(--ad-line-strong)] bg-[color:var(--ad-bg-alt)] rounded-[10px] px-4 py-3 text-[13px]">
          <span className="font-medium text-[color:var(--ad-ink)]">{selectedStoreName}</span>
          <button type="button" className="text-[12.5px] font-medium text-[color:var(--ad-link)] hover:underline" onClick={() => { setStoreId(''); setSelectedStoreName(''); }}>변경</button>
        </div>
      ) : (
        <>
          <input className="input" placeholder="매장명 / 대표자 검색" value={storeSearch} onChange={(e) => setStoreSearch(e.target.value)} />
          {storeSearch.trim() && (
            <div className="max-h-44 overflow-y-auto border border-[color:var(--ad-line)] rounded-[10px] divide-y divide-[color:var(--ad-line)] bg-white">
              {stores.length === 0 && <div className="px-3 py-2 text-[13px] text-[color:var(--ad-faint)]">검색 결과가 없습니다.</div>}
              {stores.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  className="w-full text-left px-3 py-2 text-[13px] hover:bg-[color:var(--ad-bg-alt)]"
                  onClick={() => { setStoreId(s.id); setSelectedStoreName(s.name); setStoreSearch(''); setPrefillPhone(s.phone || ''); }}
                >
                  <span className="font-medium text-[color:var(--ad-ink)]">{s.name}</span>
                  {s.ownerName ? <span className="text-[color:var(--ad-muted)]"> ({s.ownerName})</span> : null}
                  <span className="text-[12px] text-[color:var(--ad-faint)]"> — {s.address || '주소없음'}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );

  const getTargetPayload = (): BoosterTargetResult => {
    if (mode === 'store') {
      if (!storeId) return { ok: false, error: '매장을 선택해주세요.' };
      return { ok: true, payload: { storeId } };
    }
    if (!campaignName.trim()) return { ok: false, error: '캠페인명을 입력해주세요.' };
    return { ok: true, payload: { campaignName: campaignName.trim() } };
  };

  const targetSnapshot: AdminTarget = { mode, storeId, campaignName, storeName: selectedStoreName };
  return { renderTarget, getTargetPayload, prefillPhone, targetSnapshot };
}

/** 운영자 캠페인 생성 — 사장님 생성 폼에 대상 선택 주입 + 임시저장(target 포함) */
function AdminCreateView({
  af, onBack, onCreated, initialForm, initialTarget, onSaveDraft,
}: {
  af: (p: string, i?: RequestInit) => Promise<Response>;
  onBack: () => void;
  onCreated: (id: string) => void;
  initialForm?: BoosterFormValues;
  initialTarget?: AdminTarget;
  onSaveDraft?: (formData: DraftForm) => Promise<void>;
}) {
  const { renderTarget, getTargetPayload, prefillPhone, targetSnapshot } = useAdminTarget(
    af,
    initialTarget ? { storeId: initialTarget.storeId || null, storeName: initialTarget.storeName, campaignName: initialTarget.campaignName || null } : undefined
  );
  return (
    <BoosterCreateForm
      apiPrefix="/api/admin/place-booster"
      fetcher={af}
      submitLabel="캠페인 생성"
      submitNote="생성 후 계좌이체 입금 확인 시 목록에서 '승인' 하면 발송이 시작됩니다."
      prefillPhone={prefillPhone}
      initialValues={initialForm}
      renderTarget={renderTarget}
      getTargetPayload={getTargetPayload}
      onSaveDraft={onSaveDraft ? (values) => onSaveDraft({ ...values, target: targetSnapshot }) : undefined}
      onBack={onBack}
      onCreated={onCreated}
    />
  );
}

interface EditCampaign {
  status: string;
  keyword: string; naverPlaceUrl: string; placeId: string;
  couponContent: string; couponCode: string | null; couponAmount: string | null;
  couponValidUntil: string | null; couponValidUntilText: string | null; ownerPhone: string | null;
  weekday: number; sendTime: string; perBatchCount: number; totalWeeks: number;
  storeId: string | null; campaignName: string | null;
}

/** 운영자 캠페인 수정 — 상세 로드 후 프리필된 폼(edit 모드) 렌더 */
function AdminEditView({ id, af, onBack, onSaved }: { id: string; af: (p: string, i?: RequestInit) => Promise<Response>; onBack: () => void; onSaved: (meta?: ActiveEditMeta) => void; }) {
  const [data, setData] = useState<{ campaign: EditCampaign; store: { name: string } | null } | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    af(`/api/admin/place-booster/campaigns/${id}`)
      .then(async (r) => {
        if (!r.ok) { setErr('캠페인을 불러오지 못했습니다.'); return; }
        const d = await r.json();
        setData({ campaign: d.campaign, store: d.store });
      })
      .catch(() => setErr('네트워크 오류가 발생했습니다.'));
  }, [af, id]);

  if (err) return <div className="rounded-[10px] bg-[#ffc4d0]/40 text-[color:var(--ad-neg)] px-4 py-3 text-[13px]">{err} <button className="underline ml-2" onClick={onBack}>목록으로</button></div>;
  if (!data) return <div className="p-10 text-center text-[13px] text-[color:var(--ad-faint)]">불러오는 중…</div>;
  return <AdminEditForm id={id} af={af} campaign={data.campaign} storeName={data.store?.name ?? ''} onBack={onBack} onSaved={onSaved} />;
}

function AdminEditForm({ id, af, campaign: c, storeName, onBack, onSaved }: { id: string; af: (p: string, i?: RequestInit) => Promise<Response>; campaign: EditCampaign; storeName: string; onBack: () => void; onSaved: (meta?: ActiveEditMeta) => void; }) {
  const presetLocked = c.status !== 'DRAFT'; // 발송 진행 중이면 인원/주차·대상 고정
  // 발송중 수정에는 대상 선택을 노출하지 않음(대상 고정) — DRAFT일 때만 target 주입/검색
  const { renderTarget, getTargetPayload } = useAdminTarget(af, { storeId: c.storeId, storeName, campaignName: c.campaignName }, presetLocked);
  const initialValues: BoosterFormValues = {
    keyword: c.keyword,
    naverPlaceUrl: c.naverPlaceUrl,
    placeId: c.placeId,
    placeName: storeName,
    placeAddress: null,
    couponContent: c.couponContent,
    couponCode: c.couponCode ?? '',
    couponAmount: c.couponAmount ?? '',
    couponValidUntilText: validUntilText(c),
    ownerPhone: c.ownerPhone ?? '',
    weekday: c.weekday,
    sendTime: c.sendTime,
    perBatchCount: c.perBatchCount,
    totalWeeks: c.totalWeeks,
  };
  return (
    <BoosterCreateForm
      apiPrefix="/api/admin/place-booster"
      fetcher={af}
      mode="edit"
      campaignId={id}
      initialValues={initialValues}
      submitLabel="수정 완료"
      presetLocked={presetLocked}
      submitNote={
        presetLocked
          ? '이미 발송된 주차는 그대로 두고, 남은 주차만 새 내용으로 재예약됩니다. (남은 주차 수신자는 새로 선정)'
          : '결제/승인 전이라 전체 항목을 수정할 수 있습니다. 일정·인원 변경 시 회차가 재생성됩니다.'
      }
      renderTarget={presetLocked ? undefined : renderTarget}
      getTargetPayload={presetLocked ? undefined : getTargetPayload}
      onBack={onBack}
      onSaved={(_id, meta) => onSaved(meta)}
    />
  );
}
