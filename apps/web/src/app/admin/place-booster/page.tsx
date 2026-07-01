'use client';

import { API_BASE } from '@/lib/api-config';
import { useState, useEffect, useCallback, useRef } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { BoosterCreateForm, BoosterTargetResult, BoosterFormValues, toDateInput } from '@/components/place-booster/booster-create-form';
import { BoosterReport, CampaignInputCard, ReportRow, ReportTotals } from '@/components/place-booster/booster-report';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';

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
  const [editId, setEditId] = useState<string | null>(null);
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
        {!showCreate && !detailId && !editId && (
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
      ) : editId ? (
        <div className="max-w-5xl">
          <AdminEditView
            id={editId}
            af={af}
            onBack={() => setEditId(null)}
            onSaved={() => { setEditId(null); setMsg('캠페인을 수정했습니다.'); load(); }}
          />
        </div>
      ) : detailId ? (
        <div className="max-w-5xl">
          <AdminReportView id={detailId} af={af} onBack={() => setDetailId(null)} onChanged={load} />
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
                    {r.status === 'DRAFT' && (
                      <button disabled={acting} className="text-xs font-medium px-2 py-1 rounded border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-40" onClick={() => setEditId(r.id)}>수정</button>
                    )}
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

interface AdminReportData {
  campaign: {
    keyword: string; couponContent: string; campaignName: string | null; status: string;
    perBatchCount: number; totalWeeks: number; totalTargetCount: number;
    naverPlaceUrl: string; couponCode: string | null; couponAmount: string | null;
    couponValidUntil: string | null; ownerPhone: string | null;
  };
  store: { name: string; ownerName: string | null } | null;
  isExternal: boolean;
  totals: ReportTotals;
  rows: ReportRow[];
}

/** 운영자 성과 리포트 — 사장님 화면과 동일한 전체 페이지 + 운영자 전용(PDF 다운로드·외부 배지·광고비) */
function AdminReportView({ id, af, onBack, onChanged }: { id: string; af: (p: string, i?: RequestInit) => Promise<Response>; onBack: () => void; onChanged: () => void; }) {
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
    const el = reportRef.current;
    if (!el || exporting) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const imgW = pw - 16;
      const imgH = (canvas.height * imgW) / canvas.width;
      let remaining = imgH;
      let posY = 8;
      const img = canvas.toDataURL('image/png');
      while (remaining > 0) {
        pdf.addImage(img, 'PNG', 8, posY, imgW, imgH);
        remaining -= ph - 16;
        if (remaining > 0) { pdf.addPage(); posY = posY - (ph - 16); }
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

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <button onClick={onBack} className="flex items-center gap-0.5 text-[15px] text-neutral-500 hover:text-neutral-700">
          <ChevronLeft className="w-5 h-5" /> 목록으로
        </button>
        {data && (
          <Button type="button" variant="secondary" size="sm" onClick={exportPdf} disabled={exporting}>
            {exporting ? 'PDF 생성 중…' : 'PDF 다운로드'}
          </Button>
        )}
      </div>

      {!data ? (
        <p className="text-[15px] text-neutral-400">불러오는 중…</p>
      ) : (
        <>
          {/* 테스트 발송 (PDF 캡처 영역 밖) */}
          <Card className="p-5 mb-4">
            <div className="text-[15px] font-semibold text-neutral-800 mb-1">테스트 발송</div>
            <p className="text-sm text-neutral-400 mb-3">입력한 번호로 실제와 똑같은 알림톡 1건을 즉시 보냅니다. (발송 대상·회차·결제와 무관)</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                className="flex-1 border border-neutral-300 rounded-lg px-3.5 py-3 text-base min-h-12"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="받을 휴대폰 번호 (예: 01012345678)"
                inputMode="numeric"
              />
              <Button type="button" variant="secondary" size="lg" className="shrink-0" onClick={sendTest} disabled={testSending}>
                {testSending ? '발송 중…' : '테스트 발송'}
              </Button>
            </div>
            {testMsg && <p className={`text-sm mt-2 ${testMsg.startsWith('✓') ? 'text-green-700' : 'text-red-600'}`}>{testMsg}</p>}
          </Card>

          {/* 캡처 영역: 헤더 + 성과 리포트 */}
          <div ref={reportRef}>
            <Card className="p-6 mb-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-neutral-900">{displayName}</h2>
                    {data.isExternal && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">외부</span>}
                  </div>
                  <p className="text-base text-neutral-500 mt-1.5">유입 키워드: {data.campaign.keyword} · {data.campaign.couponContent}</p>
                  <div className="text-sm text-neutral-400 mt-1">
                    {data.campaign.perBatchCount.toLocaleString()}명 × {data.campaign.totalWeeks}주 (총 {data.campaign.totalTargetCount.toLocaleString()}명)
                  </div>
                </div>
                <span className={`text-sm px-2.5 py-1 rounded-full shrink-0 ${(STATUS[data.campaign.status] || STATUS.DRAFT).cls}`}>
                  {(STATUS[data.campaign.status] || STATUS.DRAFT).label}
                </span>
              </div>
            </Card>

            {/* 캠페인 입력 정보 (취소 후 재등록 참고용) */}
            <CampaignInputCard
              fields={{
                keyword: data.campaign.keyword,
                naverPlaceUrl: data.campaign.naverPlaceUrl,
                couponContent: data.campaign.couponContent,
                couponCode: data.campaign.couponCode,
                couponAmount: data.campaign.couponAmount,
                couponValidUntil: data.campaign.couponValidUntil,
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

/** 운영자 대상(매장/외부) 선택 — 생성/수정 공용. initial 로 수정 시 프리필. */
function useAdminTarget(
  af: (p: string, i?: RequestInit) => Promise<Response>,
  initial?: { storeId: string | null; storeName: string; campaignName: string | null }
) {
  const [mode, setMode] = useState<'store' | 'external'>(initial?.storeId ? 'store' : initial?.campaignName ? 'external' : 'store');
  const [campaignName, setCampaignName] = useState(initial?.campaignName ?? '');
  const [stores, setStores] = useState<StoreOpt[]>([]);
  const [storeId, setStoreId] = useState(initial?.storeId ?? '');
  const [selectedStoreName, setSelectedStoreName] = useState(initial?.storeName ?? '');
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

  return { renderTarget, getTargetPayload, prefillPhone };
}

/** 운영자 캠페인 생성 — 사장님 생성 폼(BoosterCreateForm)에 매장 선택/외부 고객 대상 선택을 주입 */
function AdminCreateView({ af, onBack, onCreated }: { af: (p: string, i?: RequestInit) => Promise<Response>; onBack: () => void; onCreated: () => void; }) {
  const { renderTarget, getTargetPayload, prefillPhone } = useAdminTarget(af);
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

interface EditCampaign {
  keyword: string; naverPlaceUrl: string; placeId: string;
  couponContent: string; couponCode: string | null; couponAmount: string | null;
  couponValidUntil: string | null; ownerPhone: string | null;
  weekday: number; sendTime: string; perBatchCount: number; totalWeeks: number;
  storeId: string | null; campaignName: string | null;
}

/** 운영자 캠페인 수정 — 상세 로드 후 프리필된 폼(edit 모드) 렌더 */
function AdminEditView({ id, af, onBack, onSaved }: { id: string; af: (p: string, i?: RequestInit) => Promise<Response>; onBack: () => void; onSaved: () => void; }) {
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

  if (err) return <div className="rounded-lg bg-red-50 text-red-700 px-4 py-3 text-sm">{err} <button className="underline ml-2" onClick={onBack}>목록으로</button></div>;
  if (!data) return <div className="p-10 text-center text-gray-400">불러오는 중…</div>;
  return <AdminEditForm id={id} af={af} campaign={data.campaign} storeName={data.store?.name ?? ''} onBack={onBack} onSaved={onSaved} />;
}

function AdminEditForm({ id, af, campaign: c, storeName, onBack, onSaved }: { id: string; af: (p: string, i?: RequestInit) => Promise<Response>; campaign: EditCampaign; storeName: string; onBack: () => void; onSaved: () => void; }) {
  const { renderTarget, getTargetPayload } = useAdminTarget(af, { storeId: c.storeId, storeName, campaignName: c.campaignName });
  const initialValues: BoosterFormValues = {
    keyword: c.keyword,
    naverPlaceUrl: c.naverPlaceUrl,
    placeId: c.placeId,
    placeName: storeName,
    placeAddress: null,
    couponContent: c.couponContent,
    couponCode: c.couponCode ?? '',
    couponAmount: c.couponAmount ?? '',
    couponValidUntil: toDateInput(c.couponValidUntil),
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
      submitNote="결제/승인 전 캠페인만 수정됩니다. 발송 일정·인원 변경 시 회차가 재생성됩니다."
      renderTarget={renderTarget}
      getTargetPayload={getTargetPayload}
      onBack={onBack}
      onSaved={onSaved}
    />
  );
}
