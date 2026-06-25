'use client';

import { API_BASE } from '@/lib/api-config';
import { useState, useEffect, useCallback, useRef } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { BoosterCreateForm, BoosterTargetResult } from '@/components/place-booster/booster-create-form';

const STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: '결제 대기', cls: 'bg-gray-100 text-gray-600' },
  SCHEDULED: { label: '발송 예정', cls: 'bg-blue-100 text-blue-700' },
  RUNNING: { label: '발송 중', cls: 'bg-green-100 text-green-700' },
  COMPLETED: { label: '완료', cls: 'bg-gray-200 text-gray-700' },
  CANCELLED: { label: '취소됨', cls: 'bg-red-100 text-red-600' },
};
const won = (n: number) => (n ?? 0).toLocaleString('ko-KR');
const adminToken = () => (typeof window !== 'undefined' ? localStorage.getItem('adminToken') || '' : '');

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
  const [showCreate, setShowCreate] = useState(false);
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
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">네이버 플레이스 부스터</h1>
        {!showCreate && (
          <button className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm" onClick={() => setShowCreate(true)}>
            + 캠페인 생성
          </button>
        )}
      </div>

      {msg && (
        <div className="mb-3 bg-blue-50 text-blue-700 px-3 py-2 rounded text-sm flex justify-between">
          {msg} <button onClick={() => setMsg('')}>✕</button>
        </div>
      )}

      {showCreate ? (
        <div className="max-w-5xl">
          <AdminCreateView
            af={af}
            onBack={() => setShowCreate(false)}
            onCreated={() => { setShowCreate(false); setMsg('캠페인을 생성했습니다.'); load(); }}
          />
        </div>
      ) : (
      <>
      {analytics && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <Stat label="전체 캠페인" value={won(analytics.totalCampaigns)} />
          <Stat label="진행 중" value={won(analytics.activeCampaigns)} />
          <Stat label="승인 대기" value={won(analytics.pendingApproval)} highlight={analytics.pendingApproval > 0} />
        </div>
      )}

      <div className="flex gap-2 mb-3">
        <input
          className="border rounded px-3 py-2 text-sm flex-1"
          placeholder="매장명 / 대표자 / 키워드 검색"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <select className="border rounded px-3 py-2 text-sm" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">전체 상태</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-lg border overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-gray-50 text-gray-500 text-xs">
            <tr>
              <th className="px-3 py-2 text-left">매장</th>
              <th className="px-3 py-2 text-left">키워드</th>
              <th className="px-3 py-2 text-left">상태</th>
              <th className="px-3 py-2 text-left">결제</th>
              <th className="px-3 py-2 text-right">진행</th>
              <th className="px-3 py-2 text-right">발송</th>
              <th className="px-3 py-2 text-right">액션</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2">
                  <div className="font-medium flex items-center gap-1.5">
                    {r.store?.name || r.campaignName || '—'}
                    {r.isExternal && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">외부</span>}
                  </div>
                  <div className="text-xs text-gray-400">{r.isExternal ? '외부 고객' : r.store?.ownerName || ''}</div>
                </td>
                <td className="px-3 py-2">{r.keyword}</td>
                <td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded-full ${(STATUS[r.status] || STATUS.DRAFT).cls}`}>{(STATUS[r.status] || STATUS.DRAFT).label}</span></td>
                <td className="px-3 py-2 text-xs">{r.paymentStatus === 'PAID' ? '완료' : r.paymentStatus === 'PENDING_APPROVAL' ? '승인 대기' : '미결제'}</td>
                <td className="px-3 py-2 text-right text-xs">{r.sentBatches}/{r.totalBatches}주</td>
                <td className="px-3 py-2 text-right">{won(r.sentCount)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <div className="flex justify-end gap-1">
                    <button className="text-xs font-medium px-2 py-1 rounded border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100" onClick={() => setDetailId(r.id)}>상세</button>
                    {r.paymentStatus === 'PENDING_APPROVAL' && (
                      <button disabled={acting} className="text-xs font-medium px-2 py-1 rounded border border-green-200 text-green-700 bg-green-50 hover:bg-green-100 disabled:opacity-40" onClick={() => act(`/api/admin/place-booster/campaigns/${r.id}/approve`, 'POST', '승인되었습니다.')}>승인</button>
                    )}
                    {r.status !== 'CANCELLED' && r.status !== 'COMPLETED' && (
                      <button disabled={acting} className="text-xs font-medium px-2 py-1 rounded border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 disabled:opacity-40" onClick={() => { if (confirm('취소(중지)하시겠습니까?')) act(`/api/admin/place-booster/campaigns/${r.id}/cancel`, 'POST', (d) => d.failed?.length ? `취소했습니다. 단, ${d.failed.length}개 회차(${d.failed.map((f: any) => `${f.weekNo}주`).join(', ')})는 발송 5분 이내라 취소되지 않고 발송됩니다.` : '취소되었습니다.'); }}>취소</button>
                    )}
                    <button disabled={acting} className="text-xs font-medium px-2 py-1 rounded border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-40" onClick={() => { if (confirm('삭제(숨김)하시겠습니까?')) act(`/api/admin/place-booster/campaigns/${r.id}`, 'DELETE', '삭제되었습니다.'); }}>삭제</button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="px-3 py-10 text-center text-gray-400">{loading ? '불러오는 중…' : '캠페인이 없습니다.'}</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="flex justify-center gap-2 mt-4 text-sm">
        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 border rounded disabled:opacity-40">이전</button>
        <span className="px-2 py-1">{page} / {pages}</span>
        <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 border rounded disabled:opacity-40">다음</button>
      </div>
      </>
      )}

      {detailId && <DetailModal id={detailId} af={af} onClose={() => setDetailId(null)} onChanged={load} />}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 text-center ${highlight ? 'border-amber-300 bg-amber-50' : 'bg-white'}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-bold mt-1">{value}</div>
    </div>
  );
}

interface ReportRow { batchId: string; weekNo: number; status: string; sentCount: number; clickCount: number; clickRate: number; couponUsedCount: number | null; avgTicket: number | null; revenue: number; }
interface AdminReportData {
  campaign: { keyword: string; couponContent: string; campaignName: string | null };
  store: { name: string; ownerName: string | null } | null;
  isExternal: boolean;
  totals: { sentCount: number; clickCount: number; clickRate: number; revenue: number; adCost: number; roi: number | null };
  rows: ReportRow[];
}
const ROI_TOOLTIP = 'ROI (투자수익률) — 광고에 쓴 비용 대비 얼마의 매출이 돌아왔는지를 나타내는 수치입니다. 100%면 쓴 비용만큼 매출이 발생, 100%를 넘을수록 비용 대비 수익이 좋았다는 의미입니다.';
function DetailModal({ id, af, onClose, onChanged }: { id: string; af: (p: string, i?: RequestInit) => Promise<Response>; onClose: () => void; onChanged: () => void; }) {
  const [data, setData] = useState<AdminReportData | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testMsg, setTestMsg] = useState('');
  const load = useCallback(async () => {
    const res = await af(`/api/admin/place-booster/campaigns/${id}`);
    if (res.ok) setData(await res.json());
  }, [af, id]);
  useEffect(() => { load(); }, [load]);

  const sendTest = async () => {
    setTestMsg('');
    if (!testPhone.trim()) { setTestMsg('테스트로 받을 번호를 입력해주세요.'); return; }
    setTestSending(true);
    try {
      const res = await af(`/api/admin/place-booster/campaigns/${id}/test-send`, { method: 'POST', body: JSON.stringify({ phone: testPhone }) });
      const d = await res.json().catch(() => ({}));
      setTestMsg(res.ok ? '✓ 발송했습니다. 카카오톡 확인' : d.error || '발송 실패');
    } catch {
      setTestMsg('네트워크 오류');
    } finally {
      setTestSending(false);
    }
  };

  const displayName = data ? (data.store?.name || data.campaign.campaignName || '캠페인') : '';
  const exportPdf = async () => {
    const el = reportRef.current;
    if (!el || exporting) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const imgW = pw - 16; // 좌우 8mm 여백
      const imgH = (canvas.height * imgW) / canvas.width;
      let remaining = imgH;
      let posY = 8;
      const img = canvas.toDataURL('image/png');
      // 멀티페이지: 한 장 초과 시 위로 끌어올리며 분할
      while (remaining > 0) {
        pdf.addImage(img, 'PNG', 8, posY, imgW, imgH);
        remaining -= ph - 16;
        if (remaining > 0) {
          pdf.addPage();
          posY = posY - (ph - 16);
        }
      }
      const d = new Date();
      const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      pdf.save(`성과리포트_${displayName}_${ymd}.pdf`);
    } catch {
      alert('PDF 생성에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setExporting(false);
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const saveRow = async (batchId: string, couponUsedCount: string, avgTicket: string) => {
    await af(`/api/admin/place-booster/batches/${batchId}/results`, {
      method: 'PATCH',
      body: JSON.stringify({ couponUsedCount: couponUsedCount ? +couponUsedCount : null, avgTicket: avgTicket ? +avgTicket : null }),
    });
    load();
    onChanged();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="캠페인 상세" className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto scrollbar-hide p-6" onClick={(e) => e.stopPropagation()}>
        {!data ? <p className="text-gray-400">불러오는 중…</p> : (
          <>
            <div className="flex justify-between items-start mb-3 gap-2">
              <button
                type="button"
                className="border rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                onClick={exportPdf}
                disabled={exporting}
              >
                {exporting ? 'PDF 생성 중…' : 'PDF 다운로드'}
              </button>
              <button onClick={onClose} className="text-gray-400 text-lg leading-none">✕</button>
            </div>
            {/* 테스트 발송 (PDF 캡처 영역 밖) */}
            <div className="mb-3 rounded border border-gray-200 bg-gray-50 p-2">
              <div className="text-xs font-medium text-gray-700 mb-1">테스트 발송 — 실제와 똑같은 알림톡 1건을 즉시 (대상/회차/결제 무관)</div>
              <div className="flex gap-2">
                <input className="flex-1 border rounded px-3 py-2 text-sm" value={testPhone} onChange={(e) => setTestPhone(e.target.value.replace(/[^0-9]/g, ''))} placeholder="받을 휴대폰 번호 (예: 01012345678)" inputMode="numeric" />
                <button type="button" className="border rounded px-3 py-2 text-sm font-medium whitespace-nowrap disabled:opacity-50" disabled={testSending} onClick={sendTest}>{testSending ? '발송 중…' : '테스트 발송'}</button>
              </div>
              {testMsg && <p className={`text-xs mt-1 ${testMsg.startsWith('✓') ? 'text-green-700' : 'text-red-600'}`}>{testMsg}</p>}
            </div>
            <div ref={reportRef} className="bg-white p-1">
              <div className="mb-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold">{displayName}</h3>
                  {data.isExternal && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">외부</span>}
                </div>
                <p className="text-sm text-gray-500">유입 키워드: {data.campaign.keyword} · {data.campaign.couponContent}</p>
              </div>
              <div className="grid grid-cols-4 gap-2 mb-4 text-center">
                <KV label="발송" v={won(data.totals.sentCount)} />
                <KV label="클릭" v={won(data.totals.clickCount)} />
                <KV label="클릭율" v={`${data.totals.clickRate.toFixed(1)}%`} />
                <KV label="ROI" v={data.totals.roi == null ? '-' : `${data.totals.roi.toFixed(0)}%`} tooltip={ROI_TOOLTIP} />
              </div>
              <p className="text-xs text-gray-400 mb-2">광고비(ROI 기준): ₩{won(data.totals.adCost)} (VAT 제외)</p>
              <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead className="bg-gray-50 text-gray-500 text-xs">
                  <tr>
                    <th className="px-2 py-1 text-left">주차</th><th className="px-2 py-1 text-right">발송</th>
                    <th className="px-2 py-1 text-right">클릭</th><th className="px-2 py-1 text-right">쿠폰사용</th>
                    <th className="px-2 py-1 text-right">평균객단</th><th className="px-2 py-1 text-right">매출</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r: ReportRow) => <AdminBatchRow key={`${r.batchId}:${r.couponUsedCount ?? ''}:${r.avgTicket ?? ''}`} row={r} onSave={saveRow} />)}
                </tbody>
              </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
function InfoTip({ text }: { text: string }) {
  return (
    <span className="relative inline-flex items-center align-middle group/tip">
      <button type="button" aria-label={text} className="ml-0.5 w-3.5 h-3.5 flex items-center justify-center rounded-full border border-gray-300 text-gray-400 text-[10px] font-bold leading-none cursor-help focus:outline-none">i</button>
      <span className="pointer-events-none absolute right-0 top-full z-50 mt-1.5 hidden w-56 rounded-lg bg-gray-800 px-3 py-2 text-[11px] leading-relaxed text-white text-left shadow-lg group-hover/tip:block group-focus-within/tip:block">
        {text}
      </span>
    </span>
  );
}

function KV({ label, v, tooltip }: { label: string; v: string; tooltip?: string }) {
  return (
    <div className="rounded border p-2">
      <div className="text-xs text-gray-500 flex items-center justify-center">{label}{tooltip && <InfoTip text={tooltip} />}</div>
      <div className="font-bold">{v}</div>
    </div>
  );
}
function AdminBatchRow({ row, onSave }: { row: ReportRow; onSave: (b: string, u: string, a: string) => void }) {
  const [u, setU] = useState(row.couponUsedCount?.toString() ?? '');
  const [a, setA] = useState(row.avgTicket?.toString() ?? '');
  return (
    <tr className="border-t">
      <td className="px-2 py-1">{row.weekNo}주</td>
      <td className="px-2 py-1 text-right">{won(row.sentCount)}</td>
      <td className="px-2 py-1 text-right">{won(row.clickCount)} ({row.clickRate.toFixed(1)}%)</td>
      <td className="px-2 py-1 text-right"><input className="w-14 border rounded px-1 text-right" value={u} onChange={(e) => setU(e.target.value.replace(/[^0-9]/g, ''))} /></td>
      <td className="px-2 py-1 text-right"><input className="w-20 border rounded px-1 text-right" value={a} onChange={(e) => setA(e.target.value.replace(/[^0-9]/g, ''))} /></td>
      <td className="px-2 py-1 text-right">{won(row.revenue)}</td>
      <td className="px-2 py-1 text-right"><button className="text-xs font-medium px-2 py-1 rounded border border-gray-300 text-gray-700 bg-white hover:bg-gray-50" onClick={() => onSave(row.batchId, u, a)}>저장</button></td>
    </tr>
  );
}

interface StoreOpt { id: string; name: string; ownerName: string | null; address: string | null; phone: string | null; }

/** 운영자 캠페인 생성 — 사장님 생성 폼(BoosterCreateForm)에 매장 선택/외부 고객 대상 선택을 주입 */
function AdminCreateView({ af, onBack, onCreated }: { af: (p: string, i?: RequestInit) => Promise<Response>; onBack: () => void; onCreated: () => void; }) {
  const [mode, setMode] = useState<'store' | 'external'>('store');
  const [campaignName, setCampaignName] = useState('');
  const [stores, setStores] = useState<StoreOpt[]>([]);
  const [storeId, setStoreId] = useState('');
  const [selectedStoreName, setSelectedStoreName] = useState('');
  const [storeSearch, setStoreSearch] = useState('');
  const [prefillPhone, setPrefillPhone] = useState('');

  useEffect(() => {
    const t = setTimeout(async () => {
      const res = await af(`/api/admin/place-booster/stores?search=${encodeURIComponent(storeSearch)}`);
      if (res.ok) setStores(await res.json());
    }, 250);
    return () => clearTimeout(t);
  }, [af, storeSearch]);

  const renderTarget = () => (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 bg-neutral-100 rounded-lg p-1">
        {([['store', '기존 매장'], ['external', '외부 고객']] as const).map(([m, label]) => (
          <button
            key={m}
            type="button"
            className={`py-2 rounded-md text-sm font-medium transition-colors ${mode === m ? 'bg-white shadow text-neutral-900' : 'text-neutral-500'}`}
            onClick={() => setMode(m)}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === 'external' ? (
        <input className="input" placeholder="외부 고객/캠페인 식별용 이름 (예: 행궁동 카페 6월)" value={campaignName} onChange={(e) => setCampaignName(e.target.value)} />
      ) : selectedStoreName ? (
        <div className="flex items-center justify-between border border-green-300 bg-green-50 rounded-xl px-4 py-3 text-sm">
          <span className="font-medium">{selectedStoreName}</span>
          <button type="button" className="text-xs text-neutral-500 underline" onClick={() => { setStoreId(''); setSelectedStoreName(''); }}>변경</button>
        </div>
      ) : (
        <>
          <input className="input" placeholder="매장명 / 대표자 검색" value={storeSearch} onChange={(e) => setStoreSearch(e.target.value)} />
          {storeSearch.trim() && (
            <div className="max-h-44 overflow-y-auto border border-neutral-200 rounded-xl divide-y">
              {stores.length === 0 && <div className="px-3 py-2 text-sm text-neutral-400">검색 결과가 없습니다.</div>}
              {stores.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-50"
                  onClick={() => { setStoreId(s.id); setSelectedStoreName(s.name); setStoreSearch(''); setPrefillPhone(s.phone || ''); }}
                >
                  <span className="font-medium">{s.name}</span>
                  {s.ownerName ? <span className="text-neutral-500"> ({s.ownerName})</span> : null}
                  <span className="text-xs text-neutral-400"> — {s.address || '주소없음'}</span>
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

  return (
    <BoosterCreateForm
      apiPrefix="/api/admin/place-booster"
      fetcher={af}
      submitLabel="캠페인 생성"
      submitNote="생성 후 계좌이체 입금 확인 시 목록에서 '승인' 하면 발송이 시작됩니다."
      prefillPhone={prefillPhone}
      renderTarget={renderTarget}
      getTargetPayload={getTargetPayload}
      onBack={onBack}
      onCreated={onCreated}
    />
  );
}
